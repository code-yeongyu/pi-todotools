import { describe, expect, it } from "vitest";
import {
	appendItems,
	applyOpsToPhases,
	applyParams,
	getCompletionTransitions,
	initPhases,
	nextActionableTask,
	normalizeInProgressTask,
	removeTasks,
	resolveTaskOrError,
} from "../src/operations.js";
import type { TodoOpEntry, TodoPhase } from "../src/state.js";

function phased(tasks: Array<[string, TodoPhase["tasks"][number]["status"]]>): TodoPhase[] {
	return [{ name: "Tasks", tasks: tasks.map(([content, status]) => ({ content, status })) }];
}

describe("todo init operation", () => {
	it("initializes multi-phase and flattened lists with automatic promotion", () => {
		// when a phased init is applied
		const multi = applyParams([], {
			op: "init",
			list: [
				{ phase: "Foundation", items: ["Scaffold workspace", "Wire entrypoint"] },
				{ phase: "Verification", items: ["Run focused tests"] },
			],
		});

		// then the earliest task is promoted
		expect(multi.errors).toEqual([]);
		expect(multi.phases).toEqual([
			{
				name: "Foundation",
				tasks: [
					{ content: "Scaffold workspace", status: "in_progress" },
					{ content: "Wire entrypoint", status: "pending" },
				],
			},
			{ name: "Verification", tasks: [{ content: "Run focused tests", status: "pending" }] },
		]);

		// and a flat init becomes the default phase
		const flat = applyParams([], { op: "init", items: ["Single phase task"] });
		expect(flat.errors).toEqual([]);
		expect(flat.phases).toEqual([
			{ name: "Tasks", tasks: [{ content: "Single phase task", status: "in_progress" }] },
		]);
	});

	it("rejects duplicate phases, duplicate tasks, and empty phases", () => {
		// given
		const errors: string[] = [];

		// when
		initPhases(
			{
				op: "init",
				list: [
					{ phase: "Repeat", items: ["one"] },
					{ phase: "Repeat", items: ["two"] },
				],
			},
			errors,
		);
		initPhases(
			{
				op: "init",
				list: [
					{ phase: "A", items: ["same"] },
					{ phase: "B", items: ["same"] },
				],
			},
			errors,
		);
		initPhases({ op: "init", list: [{ phase: "Empty", items: [] }] }, errors);
		initPhases({ op: "init" }, errors);

		// then
		expect(errors).toEqual([
			'Duplicate phase "Repeat" in init list',
			'Duplicate task "same" in init list',
			'Phase "Empty" has no tasks in init list',
			"Missing list for init operation",
		]);
	});
});

describe("todo start/done/drop operations", () => {
	it("start demotes the previously active task", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["First task", "Second task"] }).phases;

		// when
		const started = applyParams(initialized, { op: "start", task: "Second task" });

		// then
		expect(started.errors).toEqual([]);
		expect(started.phases).toEqual(
			phased([
				["First task", "pending"],
				["Second task", "in_progress"],
			]),
		);
	});

	it("done supports task and phase targets and promotes the earliest open task", () => {
		// given work completed out of phase order
		const initialized = applyParams([], {
			op: "init",
			list: [
				{ phase: "Foundation", items: ["Build core", "Add edge cases"] },
				{ phase: "Verification", items: ["Run tests", "Write docs"] },
			],
		}).phases;

		// when the later phase completes first
		const afterPhase = applyParams(initialized, { op: "done", phase: "Verification" });

		// then the pointer moves back to the earliest open task
		expect(afterPhase.phases).toEqual([
			{
				name: "Foundation",
				tasks: [
					{ content: "Build core", status: "in_progress" },
					{ content: "Add edge cases", status: "pending" },
				],
			},
			{
				name: "Verification",
				tasks: [
					{ content: "Run tests", status: "completed" },
					{ content: "Write docs", status: "completed" },
				],
			},
		]);

		// and completing the active task advances within the phase
		const afterTask = applyParams(afterPhase.phases, { op: "done", task: "Build core" });
		expect(afterTask.phases[0]?.tasks).toEqual([
			{ content: "Build core", status: "completed" },
			{ content: "Add edge cases", status: "in_progress" },
		]);
	});

	it("drop marks tasks abandoned", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["Blocked work"] }).phases;

		// when
		const dropped = applyParams(initialized, { op: "drop", task: "Blocked work" });

		// then
		expect(dropped.errors).toEqual([]);
		expect(dropped.phases).toEqual(phased([["Blocked work", "abandoned"]]));
	});

	it("rejects missing targets with helpful errors", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["Stable task"] }).phases;

		// when
		const missingTask = applyParams(initialized, { op: "done", task: "Unknown task" });
		const missingPhase = applyParams(initialized, { op: "drop", phase: "Unknown phase" });
		const missingContent = applyParams(initialized, { op: "start" });

		// then the state is untouched
		expect(missingTask.errors).toEqual(['Task "Unknown task" not found']);
		expect(missingPhase.errors).toEqual(['Phase "Unknown phase" not found']);
		expect(missingContent.errors).toEqual(["Missing task content"]);
		expect(missingTask.phases).toEqual(initialized);
		expect(missingPhase.phases).toEqual(initialized);
	});

	it("explains that task-N identifiers do not exist", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["Real task"] }).phases;
		const errors: string[] = [];

		// when
		const hit = resolveTaskOrError(initialized, "task-1", errors);

		// then
		expect(hit).toBeUndefined();
		expect(errors[0]).toContain('Task "task-1" not found');
		expect(errors[0]).toContain("referenced by content, not by IDs");
	});
});

describe("todo rm operation", () => {
	it("removes a task, a phase's tasks, and all tasks", () => {
		// given
		const initialized = applyParams([], {
			op: "init",
			list: [
				{ phase: "One", items: ["Keep", "Remove me"] },
				{ phase: "Two", items: ["Clear phase"] },
			],
		}).phases;

		// when each rm target is applied
		const afterTask = applyParams(initialized, { op: "rm", task: "Remove me" });
		expect(afterTask.phases[0]?.tasks).toEqual([{ content: "Keep", status: "in_progress" }]);
		const afterPhase = applyParams(afterTask.phases, { op: "rm", phase: "Two" });
		const afterAll = applyParams(afterPhase.phases, { op: "rm" });

		// then phase containers remain but hold no tasks
		expect(afterAll.errors).toEqual([]);
		expect(afterAll.phases).toEqual([
			{ name: "One", tasks: [] },
			{ name: "Two", tasks: [] },
		]);
	});

	it("rejects unknown rm targets without mutating state", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["Stable"] }).phases;
		const errors: string[] = [];

		// when
		const next = removeTasks(initialized, { op: "rm", task: "Ghost" }, errors);

		// then
		expect(errors).toEqual(['Task "Ghost" not found']);
		expect(next).toEqual(initialized);
	});
});

describe("todo append operation", () => {
	it("lazily creates a missing phase and promotes the new task", () => {
		// given one abandoned task
		const initialized = applyParams([], { op: "init", items: ["Blocked work"] }).phases;
		const dropped = applyParams(initialized, { op: "drop", task: "Blocked work" }).phases;

		// when
		const appended = applyParams(dropped, { op: "append", phase: "Follow-up", items: ["New work"] });

		// then
		expect(appended.errors).toEqual([]);
		expect(appended.phases).toEqual([
			{ name: "Tasks", tasks: [{ content: "Blocked work", status: "abandoned" }] },
			{ name: "Follow-up", tasks: [{ content: "New work", status: "in_progress" }] },
		]);
	});

	it("rejects duplicates against the list and within the batch", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["Existing"] }).phases;

		// when
		const againstList = applyParams(initialized, { op: "append", phase: "Tasks", items: ["Existing"] });
		const withinBatch = applyParams(initialized, { op: "append", phase: "Tasks", items: ["Fresh", "Fresh"] });

		// then
		expect(againstList.errors).toEqual(['Task "Existing" already exists']);
		expect(withinBatch.errors).toEqual(['Task "Fresh" already exists']);
		expect(againstList.phases).toEqual(initialized);
		expect(withinBatch.phases).toEqual(initialized);
	});

	it("requires a phase name and items", () => {
		// given
		const errors: string[] = [];

		// when
		appendItems([], { op: "append", items: ["x"] }, errors);
		appendItems([], { op: "append", phase: "P" }, errors);

		// then
		expect(errors).toEqual(["Missing phase name for append operation", "Missing items for append operation"]);
	});
});

describe("todo mutation semantics", () => {
	it("applies operations atomically: a failing batch restores the original state", () => {
		// given
		const initialized = applyParams([], { op: "init", items: ["Keep me"] }).phases;
		const ops: TodoOpEntry[] = [
			{ op: "append", phase: "Extra", items: ["Added"] },
			{ op: "done", task: "Does not exist" },
		];

		// when
		const result = applyOpsToPhases(initialized, ops);

		// then the whole batch is rejected
		expect(result.errors).toEqual(['Task "Does not exist" not found']);
		expect(result.phases).toEqual(initialized);
	});

	it("tracks only newly completed tasks, keyed per phase", () => {
		// given the same content string in two phases
		const before: TodoPhase[] = [
			{
				name: "One",
				tasks: [
					{ content: "Shared", status: "completed" },
					{ content: "Unique", status: "in_progress" },
				],
			},
			{ name: "Two", tasks: [{ content: "Shared", status: "pending" }] },
		];
		const after: TodoPhase[] = [
			{
				name: "One",
				tasks: [
					{ content: "Shared", status: "completed" },
					{ content: "Unique", status: "completed" },
				],
			},
			{ name: "Two", tasks: [{ content: "Shared", status: "completed" }] },
		];

		// when
		const transitions = getCompletionTransitions(before, after);

		// then previously completed tasks are not re-reported
		expect(transitions).toEqual([
			{ phase: "One", content: "Unique" },
			{ phase: "Two", content: "Shared" },
		]);
	});

	it("prefers an in-progress task over earlier pending tasks", () => {
		// given
		const phases: TodoPhase[] = [
			{
				name: "Phase",
				tasks: [
					{ content: "Pending first", status: "pending" },
					{ content: "Active", status: "in_progress" },
				],
			},
		];

		// when / then
		expect(nextActionableTask(phases)?.content).toBe("Active");
		expect(nextActionableTask([{ name: "Empty", tasks: [] }])).toBeUndefined();
	});

	it("normalizes to exactly one in-progress task", () => {
		// given illegally duplicated in-progress tasks
		const duplicated: TodoPhase[] = [
			{
				name: "Phase",
				tasks: [
					{ content: "First", status: "in_progress" },
					{ content: "Second", status: "in_progress" },
				],
			},
		];

		// when
		normalizeInProgressTask(duplicated);

		// then the earliest one wins
		expect(duplicated[0]?.tasks).toEqual([
			{ content: "First", status: "in_progress" },
			{ content: "Second", status: "pending" },
		]);

		// and with none in progress, the earliest pending task promotes
		const noneActive: TodoPhase[] = [
			{
				name: "Phase",
				tasks: [
					{ content: "Closed", status: "completed" },
					{ content: "Open", status: "pending" },
				],
			},
		];
		normalizeInProgressTask(noneActive);
		expect(noneActive[0]?.tasks[1]?.status).toBe("in_progress");
	});

	it("view is a no-op that skips normalization", () => {
		// given invalid state with two in-progress tasks
		const invalid: TodoPhase[] = [
			{
				name: "Phase",
				tasks: [
					{ content: "First", status: "in_progress" },
					{ content: "Second", status: "in_progress" },
				],
			},
		];

		// when
		const viewed = applyParams(invalid, { op: "view" });

		// then
		expect(viewed.errors).toEqual([]);
		expect(viewed.phases).toEqual(invalid);
	});
});
