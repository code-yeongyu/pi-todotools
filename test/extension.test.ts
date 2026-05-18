import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import todotoolsExtension, { TASK_MANAGEMENT_SECTION } from "../src/index.js";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;

describe("todotools extension", () => {
	it("registers both todo tools and appends task-management guidance", async () => {
		const handlers = new Map<string, EventHandler[]>();
		const registeredTools: string[] = [];
		const pi = {
			registerTool(tool: { name: string }) {
				registeredTools.push(tool.name);
			},
			registerFlag: vi.fn(),
			appendEntry: vi.fn(),
			on(event: string, handler: EventHandler) {
				const eventHandlers = handlers.get(event) ?? [];
				eventHandlers.push(handler);
				handlers.set(event, eventHandlers);
			},
			events: { emit: vi.fn(), on: vi.fn(() => () => {}) },
		} as Partial<ExtensionAPI> as ExtensionAPI;

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

		expect(registeredTools).toEqual(["todowrite", "todoread"]);
		expect(pi.registerFlag).toHaveBeenCalledWith(
			"disable-todo-continuation",
			expect.objectContaining({ type: "boolean", default: false }),
		);
		expect(results).toContainEqual({ systemPrompt: `base\n${TASK_MANAGEMENT_SECTION}` });
	});
});
