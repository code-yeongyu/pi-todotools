import type { ExtensionAPI, ExtensionContext, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import stripAnsi from "strip-ansi";
import { describe, expect, it, vi } from "vitest";
import { TODO_STATE_ENTRY_TYPE, type TodoPhase, type TodoToolDetails } from "../src/state.js";
import { phaseRomanNumeral, registerTodoTool, TODO_PARAMS_SCHEMA } from "../src/tools/todo.js";

// A real Theme value import would pull the whole pi-coding-agent index (and its
// transitive undici) into the test process, which crashes on older Node 20
// runtimes. The render assertions only need the styling hooks.
const testTheme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	strikethrough: (text: string) => text,
} as unknown as Theme;

const markerTheme = {
	fg: (name: string, text: string) => `<fg:${name}>${text}</fg:${name}>`,
	bold: (text: string) => `<bold>${text}</bold>`,
	strikethrough: (text: string) => `<s>${text}</s>`,
} as unknown as Theme;

type Captured = {
	tool: ToolDefinition;
	appendEntry: ReturnType<typeof vi.fn>;
	syncWidget: ReturnType<typeof vi.fn>;
	setCalls: TodoPhase[][];
	getPhases: () => TodoPhase[];
	setPhases: (phases: TodoPhase[]) => void;
};

function captureTodoTool(initialPhases: TodoPhase[] = []): Captured {
	let capturedTool: ToolDefinition | undefined;
	let currentPhases = initialPhases;
	const appendEntry = vi.fn();
	const syncWidget = vi.fn();
	const setCalls: TodoPhase[][] = [];
	const pi = {
		registerTool(tool: ToolDefinition) {
			capturedTool = tool;
		},
		appendEntry,
	} as Partial<ExtensionAPI> as ExtensionAPI;

	registerTodoTool(pi, {
		getCurrentPhases: () => currentPhases,
		setCurrentPhases: (phases) => {
			setCalls.push(phases);
			currentPhases = phases;
		},
		syncWidget,
	});

	if (!capturedTool) throw new Error("Expected todo tool to be registered");
	return {
		tool: capturedTool,
		appendEntry,
		syncWidget,
		setCalls,
		getPhases: () => currentPhases,
		setPhases: (phases) => {
			currentPhases = phases;
		},
	};
}

function memoryCtx(): ExtensionContext {
	return { sessionManager: { getSessionFile: () => undefined } } as Partial<ExtensionContext> as ExtensionContext;
}

function renderContext(args: unknown, overrides: { expanded?: boolean; isError?: boolean } = {}) {
	return {
		args,
		toolCallId: "todo-render",
		invalidate: () => {},
		lastComponent: undefined,
		state: undefined,
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: overrides.expanded ?? false,
		showImages: false,
		isError: overrides.isError ?? false,
	};
}

function renderToText(component: { render: (width: number) => string[] }, width = 160): string {
	return stripAnsi(component.render(width).join("\n"))
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n");
}

describe("todo tool registration", () => {
	it("registers exactly one op-based todo tool", () => {
		// when
		const { tool } = captureTodoTool();

		// then
		expect(tool.name).toBe("todo");
		expect(tool.label).toBe("Todo");
		expect(tool.parameters).toBe(TODO_PARAMS_SCHEMA);
		expect(tool.description).toContain("auto-promotes");
		expect(tool.description).toContain("NEVER an auto-generated ID");
		expect(tool.promptSnippet).toContain("phased");
		expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
	});

	it("converts one-based indexes to roman numerals", () => {
		expect(phaseRomanNumeral(0)).toBe("");
		expect(phaseRomanNumeral(1)).toBe("I");
		expect(phaseRomanNumeral(4)).toBe("IV");
		expect(phaseRomanNumeral(9)).toBe("IX");
		expect(phaseRomanNumeral(42)).toBe("XLII");
	});
});

describe("todo tool execution", () => {
	it("persists phased v2 state under the historical sanepi key", async () => {
		// given
		const { tool, appendEntry, syncWidget, setCalls, getPhases } = captureTodoTool();
		const ctx = memoryCtx();

		// when
		const result = await tool.execute(
			"call-1",
			{
				op: "init",
				list: [
					{ phase: "Foundation", items: ["Scaffold workspace", "Wire entrypoint"] },
					{ phase: "Verification", items: ["Run focused tests"] },
				],
			},
			undefined,
			undefined,
			ctx,
		);

		// then
		const expectedPhases: TodoPhase[] = [
			{
				name: "Foundation",
				tasks: [
					{ content: "Scaffold workspace", status: "in_progress" },
					{ content: "Wire entrypoint", status: "pending" },
				],
			},
			{ name: "Verification", tasks: [{ content: "Run focused tests", status: "pending" }] },
		];
		expect(appendEntry).toHaveBeenCalledWith(TODO_STATE_ENTRY_TYPE, { schema: "v2", phases: expectedPhases });
		expect(setCalls).toHaveLength(1);
		expect(getPhases()).toEqual(expectedPhases);
		expect(syncWidget).toHaveBeenCalledWith(ctx);
		const details = result.details as TodoToolDetails;
		expect(details.op).toBe("init");
		expect(details.storage).toBe("memory");
		expect(details.phases).toEqual(expectedPhases);
		expect("isError" in result && result.isError === true).toBe(false);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Remaining items (3):");
	});

	it("reports session storage when a session file exists", async () => {
		// given
		const { tool } = captureTodoTool();
		const ctx = {
			sessionManager: { getSessionFile: () => "/tmp/session.jsonl" },
		} as Partial<ExtensionContext> as ExtensionContext;

		// when
		const result = await tool.execute("call-2", { op: "init", items: ["Persisted"] }, undefined, undefined, ctx);

		// then
		expect((result.details as TodoToolDetails).storage).toBe("session");
	});

	it("records completion transitions for newly finished tasks", async () => {
		// given an initialized list
		const { tool, getPhases } = captureTodoTool();
		const ctx = memoryCtx();
		await tool.execute("call-3", { op: "init", items: ["First", "Second"] }, undefined, undefined, ctx);

		// when
		const result = await tool.execute("call-4", { op: "done", task: "First" }, undefined, undefined, ctx);

		// then
		const details = result.details as TodoToolDetails;
		expect(details.completedTasks).toEqual([{ phase: "Tasks", content: "First" }]);
		expect(getPhases()).toEqual([
			{
				name: "Tasks",
				tasks: [
					{ content: "First", status: "completed" },
					{ content: "Second", status: "in_progress" },
				],
			},
		]);
	});

	it("rejects invalid operations atomically without writing state", async () => {
		// given a persisted list
		const { tool, appendEntry, setCalls, getPhases } = captureTodoTool();
		const ctx = memoryCtx();
		await tool.execute("call-5", { op: "init", items: ["Stable task"] }, undefined, undefined, ctx);
		appendEntry.mockClear();
		setCalls.length = 0;

		// when an unknown target is completed
		const result = await tool.execute("call-6", { op: "done", task: "Unknown task" }, undefined, undefined, ctx);

		// then nothing is persisted and the error is surfaced
		expect("isError" in result && result.isError === true).toBe(true);
		expect(appendEntry).not.toHaveBeenCalled();
		expect(setCalls).toHaveLength(0);
		expect(getPhases()).toEqual([{ name: "Tasks", tasks: [{ content: "Stable task", status: "in_progress" }] }]);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain('Errors: Task "Unknown task" not found');
	});

	it("view echoes state read-only, even when the persisted state is invalid", async () => {
		// given illegally duplicated in-progress tasks
		const invalid: TodoPhase[] = [
			{
				name: "Tasks",
				tasks: [
					{ content: "First", status: "in_progress" },
					{ content: "Second", status: "in_progress" },
				],
			},
		];
		const { tool, appendEntry, setCalls } = captureTodoTool(invalid);

		// when
		const result = await tool.execute("call-7", { op: "view" }, undefined, undefined, memoryCtx());

		// then nothing is normalized or written
		expect((result.details as TodoToolDetails).phases).toEqual(invalid);
		expect("isError" in result && result.isError === true).toBe(false);
		expect(appendEntry).not.toHaveBeenCalled();
		expect(setCalls).toHaveLength(0);
	});
});

describe("todo tool rendering", () => {
	it("renders compact call labels per operation", () => {
		// given
		const { tool } = captureTodoTool();
		if (!tool.renderCall) throw new Error("Expected renderCall");

		// when / then
		const labels: Array<[unknown, string]> = [
			[
				{
					op: "init",
					list: [
						{ phase: "One", items: ["a", "b"] },
						{ phase: "Two", items: ["c"] },
					],
				},
				"todo init (2 phases, 3 tasks)",
			],
			[{ op: "init", items: ["only"] }, "todo init (1 phase, 1 task)"],
			[{ op: "append", phase: "Follow-up", items: ["x", "y"] }, "todo append: Follow-up (2 items)"],
			[{ op: "start", task: "Build core" }, "todo start: Build core"],
			[{ op: "done", task: "Build core" }, "todo done: Build core"],
			[{ op: "drop", task: "Build core" }, "todo drop: Build core"],
			[{ op: "rm", task: "Old" }, "todo rm: Old"],
			[{ op: "rm" }, "todo rm: all"],
			[{ op: "view" }, "todo view"],
			[{ op: "done" }, "todo done: (missing target)"],
		];
		for (const [args, expected] of labels) {
			expect(renderToText(tool.renderCall(args, testTheme, renderContext(args)))).toBe(expected);
		}
	});

	it("renders a static phase tree with collapsed untouched closed phases", () => {
		// given
		const { tool } = captureTodoTool();
		if (!tool.renderResult) throw new Error("Expected renderResult");
		const args = { op: "done", task: "Build core" };
		const phases: TodoPhase[] = [
			{
				name: "Foundation",
				tasks: [
					{ content: "Build core", status: "completed" },
					{ content: "Wire entrypoint", status: "completed" },
				],
			},
			{ name: "Auth", tasks: [{ content: "Configure auth", status: "completed" }] },
			{ name: "Verification", tasks: [{ content: "Run checks", status: "pending" }] },
		];

		// when
		const rendered = renderToText(
			tool.renderResult(
				{
					content: [{ type: "text", text: "summary" }],
					details: {
						op: "done",
						phases,
						storage: "memory",
						completedTasks: [{ phase: "Foundation", content: "Build core" }],
					},
				},
				{ expanded: false, isPartial: false },
				testTheme,
				renderContext(args),
			),
		);

		// then
		expect(rendered).toContain("I. Foundation");
		expect(rendered).toContain("[✓] Build core");
		expect(rendered).toContain("II. Auth — 1/1 done");
		expect(rendered).toContain("III. Verification");
		expect(rendered).toContain("[ ] Run checks");
	});

	it("expands collapsed phases when the result view is expanded", () => {
		// given
		const { tool } = captureTodoTool();
		if (!tool.renderResult) throw new Error("Expected renderResult");
		const phases: TodoPhase[] = [
			{ name: "Auth", tasks: [{ content: "Configure auth", status: "completed" }] },
			{ name: "Verification", tasks: [{ content: "Run checks", status: "in_progress" }] },
		];

		// when
		const rendered = renderToText(
			tool.renderResult(
				{ content: [{ type: "text", text: "summary" }], details: { op: "done", phases, storage: "memory" } },
				{ expanded: true, isPartial: false },
				testTheme,
				renderContext({ op: "done", task: "Configure auth" }, { expanded: true }),
			),
		);

		// then the untouched closed phase is fully listed
		expect(rendered).toContain("I. Auth");
		expect(rendered).toContain("[✓] Configure auth");
		expect(rendered).not.toContain("1/1 done");
	});

	it("strikes completed tasks and accents the active one", () => {
		// given
		const { tool } = captureTodoTool();
		if (!tool.renderResult) throw new Error("Expected renderResult");
		const phases: TodoPhase[] = [
			{
				name: "Animation",
				tasks: [
					{ content: "Task A", status: "completed" },
					{ content: "Active task", status: "in_progress" },
					{ content: "Dropped task", status: "abandoned" },
					{ content: "Queued task", status: "pending" },
				],
			},
		];

		// when
		const rendered = tool
			.renderResult(
				{
					content: [{ type: "text", text: "summary" }],
					details: { op: "done", phases, storage: "memory" },
				},
				{ expanded: false, isPartial: false },
				markerTheme,
				renderContext({ op: "done", task: "Task A" }),
			)
			.render(160)
			.join("\n");

		// then
		expect(rendered).toContain("<fg:accent><bold>I. Animation</bold></fg:accent>");
		expect(rendered).toContain("<fg:dim><s>[✓] Task A</s></fg:dim>");
		expect(rendered).toContain("<fg:accent><bold>[•] Active task</bold></fg:accent>");
		expect(rendered).toContain("<fg:dim>[×] Dropped task</fg:dim>");
		expect(rendered).toContain("  [ ] Queued task");
	});

	it("renders errors as plain text without the phase tree", () => {
		// given
		const { tool } = captureTodoTool();
		if (!tool.renderResult) throw new Error("Expected renderResult");

		// when
		const rendered = renderToText(
			tool.renderResult(
				{
					content: [{ type: "text", text: "unable to complete" }],
					details: { op: "done", phases: [], storage: "memory" },
				},
				{ expanded: false, isPartial: false },
				testTheme,
				renderContext({ op: "done", task: "Task A" }, { isError: true }),
			),
		);

		// then
		expect(rendered).toContain("unable to complete");
		expect(rendered).not.toContain("I. ");
	});
});
