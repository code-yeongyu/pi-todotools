import type {
	AgentEndEvent,
	BeforeAgentStartEvent,
	ExtensionAPI,
	ExtensionContext,
	SessionShutdownEvent,
} from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveContinuationConfig } from "../src/continuation/config.js";
import { buildContinuationPrompt, CONTINUATION_DIRECTIVE, countIncomplete } from "../src/continuation/prompt.js";
import { installContinuation } from "../src/continuation/runtime.js";
import type { TodoItem } from "../src/state.js";
import { SANEPI_CONVERSATION_EVENT, SANEPI_SYSTEM_PREFIX } from "../src/system-messages.js";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;

const pendingTodos: TodoItem[] = [{ content: "Continue this", status: "pending", priority: "high" }];

function createAgentEndEvent(stopReason: string): AgentEndEvent {
	return {
		type: "agent_end",
		messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason }],
	} as AgentEndEvent;
}

function createBeforeAgentStartEvent(prompt: string): BeforeAgentStartEvent {
	return {
		type: "before_agent_start",
		prompt,
		systemPrompt: "",
		systemPromptOptions: { cwd: process.cwd() },
	} as BeforeAgentStartEvent;
}

function createMockPi() {
	const handlers = new Map<string, EventHandler[]>();
	const emitted: Array<{ event: string; payload: unknown }> = [];
	const mockPi = {
		registerFlag: vi.fn(),
		getFlag: vi.fn(() => false),
		sendUserMessage: vi.fn(),
		on(event: string, handler: EventHandler) {
			const eventHandlers = handlers.get(event) ?? [];
			eventHandlers.push(handler);
			handlers.set(event, eventHandlers);
		},
		events: {
			emit(event: string, payload: unknown) {
				emitted.push({ event, payload });
			},
			on: vi.fn(() => () => {}),
		},
		async trigger(event: string, payload: unknown, ctx: ExtensionContext) {
			for (const handler of handlers.get(event) ?? []) {
				await handler(payload, ctx);
			}
		},
		emitted,
	};
	return mockPi;
}

function createMockContext(options?: { hasUI?: boolean; isIdle?: () => boolean }): ExtensionContext {
	const context: Record<keyof ExtensionContext, unknown> = {
		hasUI: options?.hasUI ?? true,
		isIdle: options?.isIdle ?? (() => true),
		sessionManager: {
			getSessionId: () => "session-1",
		},
		ui: {
			notify: vi.fn(),
		},
		cwd: process.cwd(),
		modelRegistry: {},
		model: undefined,
		signal: undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "",
	};
	return context as ExtensionContext;
}

describe("todo continuation", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves continuation settings with project and CLI precedence", () => {
		expect(resolveContinuationConfig({})).toEqual({ enabled: true });
		expect(
			resolveContinuationConfig({ globalSettings: { todotools: { continuation: { enabled: false } } } }),
		).toEqual({
			enabled: false,
		});
		expect(
			resolveContinuationConfig({
				globalSettings: { todotools: { continuation: { enabled: false } } },
				projectSettings: { todotools: { continuation: { enabled: true } } },
			}),
		).toEqual({ enabled: true });
		expect(
			resolveContinuationConfig({
				projectSettings: { todotools: { continuation: { enabled: true } } },
				cliFlag: true,
			}),
		).toEqual({ enabled: false });
	});

	it("builds a sanitized continuation prompt for incomplete todos", () => {
		const prompt = buildContinuationPrompt([
			{ content: "Done", status: "completed", priority: "high" },
			{ content: "Line one\nline two", status: "in_progress", priority: "high" },
			{ content: "Pending", status: "pending", priority: "medium" },
		]);

		expect(countIncomplete(pendingTodos)).toBe(1);
		expect(prompt).toContain(CONTINUATION_DIRECTIVE);
		expect(prompt).toContain("[Status: 1/3 completed, 2 remaining]");
		expect(prompt).toContain("- [in_progress] Line one line two");
		expect(prompt).toContain("- [pending] Pending");
	});

	it("injects a prefixed follow-up after a clean stop with incomplete todos", async () => {
		vi.useFakeTimers();
		const mockPi = createMockPi();
		const ctx = createMockContext();

		installContinuation(mockPi as Partial<ExtensionAPI> as ExtensionAPI, { getCurrentTodos: () => pendingTodos });
		await mockPi.trigger("agent_end", createAgentEndEvent("stop"), ctx);
		await vi.advanceTimersByTimeAsync(0);

		expect(mockPi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining(`${SANEPI_SYSTEM_PREFIX}\n${CONTINUATION_DIRECTIVE}`),
		);
		expect(mockPi.emitted).toEqual([
			expect.objectContaining({
				event: SANEPI_CONVERSATION_EVENT,
				payload: expect.objectContaining({
					action: "injected",
					route: "todotools.continuation",
					sessionId: "session-1",
				}),
			}),
		]);
	});

	it("cancels a pending dispatch when a new non-continuation turn starts", async () => {
		vi.useFakeTimers();
		let isIdle = false;
		const mockPi = createMockPi();
		const ctx = createMockContext({ isIdle: () => isIdle });

		installContinuation(mockPi as Partial<ExtensionAPI> as ExtensionAPI, { getCurrentTodos: () => pendingTodos });
		await mockPi.trigger("agent_end", createAgentEndEvent("stop"), ctx);
		await vi.advanceTimersByTimeAsync(0);
		await mockPi.trigger("before_agent_start", createBeforeAgentStartEvent("new user request"), ctx);
		isIdle = true;
		await vi.advanceTimersByTimeAsync(100);

		expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("clears pending per-session work on shutdown", async () => {
		vi.useFakeTimers();
		let isIdle = false;
		const mockPi = createMockPi();
		const ctx = createMockContext({ isIdle: () => isIdle });

		installContinuation(mockPi as Partial<ExtensionAPI> as ExtensionAPI, { getCurrentTodos: () => pendingTodos });
		await mockPi.trigger("agent_end", createAgentEndEvent("stop"), ctx);
		await vi.advanceTimersByTimeAsync(0);
		await mockPi.trigger(
			"session_shutdown",
			{ type: "session_shutdown", reason: "quit" } satisfies SessionShutdownEvent,
			ctx,
		);
		isIdle = true;
		await vi.advanceTimersByTimeAsync(100);

		expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
	});
});
