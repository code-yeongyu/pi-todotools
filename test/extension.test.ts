import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import todotoolsExtension, { TASK_MANAGEMENT_SECTION, TODO_STATE_ENTRY_TYPE } from "../src/index.js";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;

function createMockPi() {
	const handlers = new Map<string, EventHandler[]>();
	const registeredTools: string[] = [];
	const pi = {
		registerTool(tool: { name: string }) {
			registeredTools.push(tool.name);
		},
		appendEntry: vi.fn(),
		on(event: string, handler: EventHandler) {
			const eventHandlers = handlers.get(event) ?? [];
			eventHandlers.push(handler);
			handlers.set(event, eventHandlers);
		},
		events: { emit: vi.fn(), on: vi.fn(() => () => {}) },
	} as Partial<ExtensionAPI> as ExtensionAPI;
	return { pi, handlers, registeredTools };
}

describe("todotools extension", () => {
	it("registers the phased todo tool and appends task-management guidance", async () => {
		// given
		const { pi, handlers, registeredTools } = createMockPi();

		// when
		todotoolsExtension(pi);
		const beforeAgentStartHandlers = handlers.get("before_agent_start") ?? [];
		const ctx = {
			sessionManager: { getSessionId: () => "session-1" },
		} as Partial<ExtensionContext> as ExtensionContext;
		const results = [];
		for (const handler of beforeAgentStartHandlers) {
			results.push(
				await handler(
					{
						type: "before_agent_start",
						prompt: "work",
						systemPrompt: "base",
						systemPromptOptions: { cwd: process.cwd() },
					},
					ctx,
				),
			);
		}

		// then
		expect(registeredTools).toEqual(["todo"]);
		expect(results).toContainEqual({ systemPrompt: `base\n${TASK_MANAGEMENT_SECTION}` });
	});

	it("restores phased state from the session branch and refreshes the sidebar", async () => {
		// given a branch holding a legacy flat todowrite-era snapshot
		const { pi, handlers } = createMockPi();
		todotoolsExtension(pi);
		const setWidget = vi.fn();
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{
						type: "custom",
						customType: TODO_STATE_ENTRY_TYPE,
						data: {
							todos: [
								{ content: "Legacy open", status: "pending", priority: "high" },
								{ content: "Legacy closed", status: "completed", priority: "low" },
							],
						},
					},
				],
			},
			ui: { setWidget },
		} as unknown as ExtensionContext;

		// when the session starts
		const sessionStartHandlers = handlers.get("session_start") ?? [];
		expect(sessionStartHandlers).toHaveLength(1);
		for (const handler of sessionStartHandlers) {
			await handler({ type: "session_start", reason: "startup", cwd: process.cwd() }, ctx);
		}

		// then the sidebar shows the migrated open task
		expect(setWidget).toHaveBeenCalledWith("todo-sidebar", ["Todo", "Tasks", "[ ] Legacy open", "[✓] Legacy closed"]);

		// and the agent receives op-based prompt guidance
		expect(TASK_MANAGEMENT_SECTION).toContain("op-based");
	});
});
