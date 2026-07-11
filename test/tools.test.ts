import { type ExtensionAPI, type ExtensionContext, Theme, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import stripAnsi from "strip-ansi";
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

const fgColors: ConstructorParameters<typeof Theme>[0] = {
	accent: "#ffffff",
	border: "#ffffff",
	borderAccent: "#ffffff",
	borderMuted: "#ffffff",
	success: "#ffffff",
	error: "#ffffff",
	warning: "#ffffff",
	muted: "#ffffff",
	dim: "#ffffff",
	text: "#ffffff",
	thinkingText: "#ffffff",
	userMessageText: "#ffffff",
	customMessageText: "#ffffff",
	customMessageLabel: "#ffffff",
	toolTitle: "#ffffff",
	toolOutput: "#ffffff",
	mdHeading: "#ffffff",
	mdLink: "#ffffff",
	mdLinkUrl: "#ffffff",
	mdCode: "#ffffff",
	mdCodeBlock: "#ffffff",
	mdCodeBlockBorder: "#ffffff",
	mdQuote: "#ffffff",
	mdQuoteBorder: "#ffffff",
	mdHr: "#ffffff",
	mdListBullet: "#ffffff",
	toolDiffAdded: "#ffffff",
	toolDiffRemoved: "#ffffff",
	toolDiffContext: "#ffffff",
	syntaxComment: "#ffffff",
	syntaxKeyword: "#ffffff",
	syntaxFunction: "#ffffff",
	syntaxVariable: "#ffffff",
	syntaxString: "#ffffff",
	syntaxNumber: "#ffffff",
	syntaxType: "#ffffff",
	syntaxOperator: "#ffffff",
	syntaxPunctuation: "#ffffff",
	thinkingOff: "#ffffff",
	thinkingMinimal: "#ffffff",
	thinkingLow: "#ffffff",
	thinkingMedium: "#ffffff",
	thinkingHigh: "#ffffff",
	thinkingXhigh: "#ffffff",
	thinkingMax: "#ffffff",
	bashMode: "#ffffff",
};
const bgColors: ConstructorParameters<typeof Theme>[1] = {
	selectedBg: "#000000",
	userMessageBg: "#000000",
	customMessageBg: "#000000",
	toolPendingBg: "#000000",
	toolSuccessBg: "#000000",
	toolErrorBg: "#000000",
};
const testTheme = new Theme(fgColors, bgColors, "truecolor");

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

	it("renders updated todo contents in the todowrite call", () => {
		// given
		const todos: TodoItem[] = [
			{
				content: "src/tools/todowrite.ts: Show visible todo contents - expect call rows",
				status: "in_progress",
				priority: "high",
			},
			{
				content: "test/tools.test.ts:\nReject\u0000 count-only renderer",
				status: "pending",
				priority: "medium",
			},
		];
		const tool = captureTool((pi) =>
			registerTodoWriteTool(pi, {
				getCurrentTodos: () => [],
				setCurrentTodos: () => {},
				syncWidget: () => {},
			}),
		);

		if (!tool.renderCall) {
			throw new Error("Expected todowrite renderCall to be registered");
		}

		// when
		const args = { todos };
		const rendered = stripAnsi(
			tool
				.renderCall(args, testTheme, {
					args,
					toolCallId: "tool-todo",
					invalidate: () => {},
					lastComponent: undefined,
					state: undefined,
					cwd: process.cwd(),
					executionStarted: false,
					argsComplete: true,
					isPartial: false,
					expanded: false,
					showImages: false,
					isError: false,
				})
				.render(120)
				.join("\n"),
		);

		// then
		expect(rendered).toContain("todowrite 2 todos");
		expect(rendered).toContain("[•] src/tools/todowrite.ts: Show visible todo contents - expect call rows");
		expect(rendered).toContain("[ ] test/tools.test.ts: Reject count-only renderer");
		expect(rendered).not.toContain("item(s)");
		expect(rendered).not.toContain("\u0000");
		expect(rendered).not.toContain("\nReject");
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
