import { describe, expect, it } from "vitest";
import {
	formatSummary,
	getTodoMarker,
	getTodoResultLines,
	getTodoWidgetLines,
	isIncompleteTodo,
	isTerminalTodoStatus,
	sanitizeTodoText,
} from "../src/rendering.js";
import type { TodoPhase } from "../src/state.js";

describe("todo rendering", () => {
	it("maps statuses to checklist markers", () => {
		expect(getTodoMarker("completed")).toBe("[✓]");
		expect(getTodoMarker("in_progress")).toBe("[•]");
		expect(getTodoMarker("abandoned")).toBe("[×]");
		expect(getTodoMarker("cancelled")).toBe("[×]");
		expect(getTodoMarker("pending")).toBe("[ ]");
	});

	it("treats completed, abandoned, and cancelled as terminal", () => {
		expect(isTerminalTodoStatus("completed")).toBe(true);
		expect(isTerminalTodoStatus("abandoned")).toBe(true);
		expect(isTerminalTodoStatus("cancelled")).toBe(true);
		expect(isTerminalTodoStatus("pending")).toBe(false);
		expect(isIncompleteTodo({ content: "open", status: "pending" })).toBe(true);
		expect(isIncompleteTodo({ content: "closed", status: "abandoned" })).toBe(false);
	});

	it("sanitizes ANSI, newlines, and control characters", () => {
		expect(sanitizeTodoText("Unsafe\u001b[31m text\nnext\tline")).toBe("Unsafe text next line");
		expect(sanitizeTodoText("  spaced\u0000\u0007 out  ")).toBe("spaced out");
	});

	it("builds the sidebar from the active phase only", () => {
		// given an active phase and a closed successor
		const phases: TodoPhase[] = [
			{
				name: "Foundation",
				tasks: [
					{ content: "Active task", status: "in_progress" },
					{ content: "Queued task", status: "pending" },
				],
			},
			{ name: "Auth", tasks: [{ content: "Done task", status: "completed" }] },
		];

		// when
		const lines = getTodoWidgetLines(phases);

		// then only the active phase is shown
		expect(lines).toEqual(["Todo", "Foundation", "[•] Active task", "[ ] Queued task"]);
		expect(
			getTodoWidgetLines([{ name: "Done", tasks: [{ content: "Closed", status: "completed" }] }]),
		).toBeUndefined();
	});

	it("builds result lines across all phases", () => {
		// given
		const phases: TodoPhase[] = [
			{
				name: "Foundation",
				tasks: [
					{ content: "Active task", status: "in_progress" },
					{ content: "Done task", status: "completed" },
				],
			},
		];

		// when / then
		expect(getTodoResultLines(phases)).toEqual(["1 todos", "Foundation:", "[•] Active task", "[✓] Done task"]);
	});

	it("summarizes empty lists and surfaces errors", () => {
		expect(formatSummary([], [])).toBe("Todo list cleared.");
		expect(formatSummary([], [], true)).toBe("Todo list is empty.");
		expect(formatSummary([], ["boom"])).toBe("Errors: boom");
	});

	it("summarizes remaining items, overall progress, and the active phase", () => {
		// given
		const phases: TodoPhase[] = [
			{
				name: "Foundation",
				tasks: [
					{ content: "Build core", status: "completed" },
					{ content: "Add edge cases", status: "in_progress" },
				],
			},
			{ name: "Verification", tasks: [{ content: "Run tests", status: "pending" }] },
		];

		// when
		const summary = formatSummary(phases, []);

		// then
		expect(summary).toContain("Remaining items (2):");
		expect(summary).toContain("  - Add edge cases [in_progress] (Foundation)");
		expect(summary).toContain("  - Run tests [pending] (Verification)");
		expect(summary).toContain("Overall: 1/3 done, 2 open.");
		expect(summary).toContain('Active phase 1/2 "Foundation" (1/2).');
		expect(summary).toContain("  Foundation:");
		expect(summary).toContain("    - [X] Build core");
		expect(summary).toContain("    - [ ] Add edge cases (in progress)");
		expect(summary).toContain("    - [ ] Run tests");
	});

	it("explains when the active pointer sits behind out-of-order completions", () => {
		// given a later phase completed while an earlier phase is still open
		const phases: TodoPhase[] = [
			{ name: "Foundation", tasks: [{ content: "Open work", status: "in_progress" }] },
			{ name: "Verification", tasks: [{ content: "Finished early", status: "completed" }] },
		];

		// when
		const summary = formatSummary(phases, []);

		// then
		expect(summary).toContain("earliest phase with open tasks");
		expect(summary).toContain("nothing was un-completed");
	});

	it("marks dropped tasks in the checklist and prefixes errors", () => {
		// given
		const phases: TodoPhase[] = [{ name: "Tasks", tasks: [{ content: "Dropped", status: "abandoned" }] }];

		// when
		const summary = formatSummary(phases, ["something failed"]);

		// then
		expect(summary.startsWith("Errors: something failed")).toBe(true);
		expect(summary).toContain("Remaining items: none.");
		expect(summary).toContain("    - [ ] Dropped (dropped)");
	});
});
