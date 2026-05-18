import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { TODO_STATE_ENTRY_TYPE, type TodoItem } from "../src/state.js";
import { registerTodoReadTool } from "../src/tools/todoread.js";
import { registerTodoWriteTool } from "../src/tools/todowrite.js";

function captureTool(register: (pi: ExtensionAPI) => void): ToolDefinition {
	let capturedTool: ToolDefinition | undefined;
	const pi = {
		registerTool(tool: ToolDefinition) {
			capturedTool = tool;
		},
		appendEntry: vi.fn(),
	} as Partial<ExtensionAPI> as ExtensionAPI;

	register(pi);

	if (!capturedTool) {
		throw new Error("Expected tool to be registered");
	}

	return capturedTool;
}

describe("todo tools", () => {
	it("registers workflow-first prompt guidance on todowrite", () => {
		const tool = captureTool((pi) =>
			registerTodoWriteTool(pi, {
				getCurrentTodos: () => [],
				setCurrentTodos: () => {},
				syncWidget: () => {},
			}),
		);

		expect(tool.name).toBe("todowrite");
		expect(tool.promptSnippet).toContain("MANDATORY for ALL tasks");
		expect(tool.promptSnippet).toContain("EXPLORE -> DEFINE -> PLAN -> TODO -> EXECUTE");
		expect(tool.promptGuidelines).toContain(
			"Create todos for EVERY task. No 'trivial task' exemptions. Follow EXPLORE -> DEFINE -> PLAN -> TODO -> EXECUTE workflow always.",
		);
	});

	it("stores the complete todo list and appends session state", async () => {
		const todos: TodoItem[] = [
			{ content: "Inspect auth flow", status: "in_progress", priority: "high" },
			{ content: "Run regression tests", status: "pending", priority: "medium" },
		];
		let currentTodos: TodoItem[] = [];
		const syncWidget = vi.fn();
		const appendEntry = vi.fn();
		let capturedTool: ToolDefinition | undefined;
		const pi = {
			registerTool(tool: ToolDefinition) {
				capturedTool = tool;
			},
			appendEntry,
		} as Partial<ExtensionAPI> as ExtensionAPI;
		registerTodoWriteTool(pi, {
			getCurrentTodos: () => currentTodos,
			setCurrentTodos: (nextTodos) => {
				currentTodos = nextTodos;
			},
			syncWidget,
		});

		if (!capturedTool) {
			throw new Error("Expected todowrite tool to be registered");
		}

		const ctx = {} as ExtensionContext;
		const result = await capturedTool.execute("call-1", { todos }, undefined, undefined, ctx);

		expect(currentTodos).toEqual(todos);
		expect(currentTodos).not.toBe(todos);
		expect(appendEntry).toHaveBeenCalledWith(TODO_STATE_ENTRY_TYPE, { todos });
		expect(syncWidget).toHaveBeenCalledWith(ctx);
		expect(result.details).toEqual({ todos });
		expect(result.content).toEqual([{ type: "text", text: JSON.stringify(todos, null, 2) }]);
	});

	it("reads current todos through todoread", async () => {
		const todos: TodoItem[] = [{ content: "Read me", status: "pending", priority: "high" }];
		const tool = captureTool((pi) => registerTodoReadTool(pi, () => todos));

		const result = await tool.execute("call-2", {}, undefined, undefined, {} as ExtensionContext);

		expect(tool.name).toBe("todoread");
		expect(result.details).toEqual({ todos });
		expect(result.content).toEqual([{ type: "text", text: JSON.stringify(todos, null, 2) }]);
	});
});
