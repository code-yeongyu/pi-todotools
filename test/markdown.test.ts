import { describe, expect, it } from "vitest";
import {
	DEFAULT_TODO_MARKDOWN_FILE,
	markdownToPhases,
	phasesToMarkdown,
	resolveTodoMarkdownPath,
} from "../src/markdown.js";
import type { TodoPhase } from "../src/state.js";

describe("todo markdown round-trip", () => {
	it("renders an empty list as the default phase heading", () => {
		expect(phasesToMarkdown([])).toBe("# Tasks\n");
		expect(DEFAULT_TODO_MARKDOWN_FILE).toBe("TODO.md");
	});

	it("renders phases as headings with status markers", () => {
		// given
		const phases: TodoPhase[] = [
			{
				name: "Foundation",
				tasks: [
					{ content: "Done", status: "completed" },
					{ content: "Active", status: "in_progress" },
				],
			},
			{
				name: "Verification",
				tasks: [
					{ content: "Queued", status: "pending" },
					{ content: "Dropped", status: "abandoned" },
				],
			},
		];

		// when / then
		expect(phasesToMarkdown(phases)).toBe(
			"# Foundation\n- [x] Done\n- [/] Active\n\n# Verification\n- [ ] Queued\n- [-] Dropped\n",
		);
	});

	it("parses every supported marker back into statuses", () => {
		// when
		const { phases, errors } = markdownToPhases(
			"# Phase\n- [ ] pending\n- [x] done\n- [X] done loud\n- [/] active\n- [>] also active\n- [-] dropped\n- [~] also dropped\n",
		);

		// then
		expect(errors).toEqual([]);
		expect(phases).toEqual([
			{
				name: "Phase",
				tasks: [
					{ content: "pending", status: "pending" },
					{ content: "done", status: "completed" },
					{ content: "done loud", status: "completed" },
					{ content: "active", status: "in_progress" },
					{ content: "also active", status: "pending" },
					{ content: "dropped", status: "abandoned" },
					{ content: "also dropped", status: "abandoned" },
				],
			},
		]);
	});

	it("normalizes multiple in-progress markers down to the earliest one", () => {
		// when
		const { phases } = markdownToPhases("# Phase\n- [/] first\n- [/] second\n");

		// then
		expect(phases[0]?.tasks).toEqual([
			{ content: "first", status: "in_progress" },
			{ content: "second", status: "pending" },
		]);
	});

	it("collects parse errors with line numbers instead of throwing", () => {
		// when
		const { phases, errors } = markdownToPhases("# Phase\n- [?] unknown marker\nplain prose line\n- [ ] fine\n");

		// then
		expect(errors).toEqual([
			'Line 2: unknown status marker "[?]" (use [ ], [x], [/], [-])',
			'Line 3: unrecognized syntax "plain prose line"',
		]);
		expect(phases[0]?.tasks).toEqual([{ content: "fine", status: "in_progress" }]);
	});

	it("starts tasks without a heading in the default phase", () => {
		// when
		const { phases, errors } = markdownToPhases("- [ ] orphan task\n");

		// then
		expect(errors).toEqual([]);
		expect(phases).toEqual([{ name: "Tasks", tasks: [{ content: "orphan task", status: "in_progress" }] }]);
	});

	it("round-trips a phased list losslessly", () => {
		// given
		const original: TodoPhase[] = [
			{
				name: "Alpha",
				tasks: [
					{ content: "First task", status: "completed" },
					{ content: "Second task", status: "in_progress" },
				],
			},
			{ name: "Beta", tasks: [{ content: "Third task", status: "pending" }] },
		];

		// when
		const { phases, errors } = markdownToPhases(phasesToMarkdown(original));

		// then
		expect(errors).toEqual([]);
		expect(phases).toEqual(original);
	});

	it("resolves markdown paths against the cwd", () => {
		expect(resolveTodoMarkdownPath("", "/repo")).toBe("/repo/TODO.md");
		expect(resolveTodoMarkdownPath("  docs/plan.md  ", "/repo")).toBe("/repo/docs/plan.md");
		expect(resolveTodoMarkdownPath('"quoted.md"', "/repo")).toBe("/repo/quoted.md");
		expect(resolveTodoMarkdownPath("/absolute/path.md", "/repo")).toBe("/absolute/path.md");
	});
});
