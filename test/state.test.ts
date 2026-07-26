import { describe, expect, it } from "vitest";
import {
	clonePhases,
	DEFAULT_INIT_PHASE,
	findPhaseByName,
	findTaskByContent,
	getLatestPhasesFromBranchEntries,
	getLatestTodosFromBranchEntries,
	isTodoItem,
	isTodoPhase,
	TODO_STATE_ENTRY_TYPE,
	type TodoPhase,
} from "../src/state.js";

function firstOf<T>(items: T[]): T {
	const value = items[0];
	if (value === undefined) throw new Error("expected at least one item");
	return value;
}

const foundation: TodoPhase = {
	name: "Foundation",
	tasks: [
		{ content: "Scaffold workspace", status: "completed" },
		{ content: "Wire entrypoint", status: "in_progress" },
	],
};

describe("todo state", () => {
	it("keeps the historical sanepi state entry key", () => {
		expect(TODO_STATE_ENTRY_TYPE).toBe("sanepi.todo-state");
		expect(DEFAULT_INIT_PHASE).toBe("Tasks");
	});

	it("finds tasks and phases by their content keys", () => {
		// given
		const phases: TodoPhase[] = [
			foundation,
			{ name: "Verification", tasks: [{ content: "Run tests", status: "pending" }] },
		];

		// when / then
		const hit = findTaskByContent(phases, "Wire entrypoint");
		expect(hit?.task.status).toBe("in_progress");
		expect(hit?.phase.name).toBe("Foundation");
		expect(findTaskByContent(phases, "Missing task")).toBeUndefined();
		expect(findPhaseByName(phases, "Verification")?.tasks).toHaveLength(1);
		expect(findPhaseByName(phases, "Missing phase")).toBeUndefined();
	});

	it("clones phases deeply so mutations never leak into snapshots", () => {
		// when
		const copy = clonePhases([foundation]);

		// then
		expect(copy).toEqual([foundation]);
		const copiedPhase = firstOf(copy);
		expect(copiedPhase).not.toBe(foundation);
		expect(firstOf(copiedPhase.tasks)).not.toBe(firstOf(foundation.tasks));
	});

	it("accepts canonical v2 statuses and rejects malformed items", () => {
		// when / then
		for (const status of ["pending", "in_progress", "completed", "abandoned"]) {
			expect(isTodoItem({ content: `task ${status}`, status })).toBe(true);
		}
		expect(isTodoItem({ content: "legacy cancelled", status: "cancelled" })).toBe(true);
		expect(isTodoItem({ content: "unknown", status: "blocked" })).toBe(false);
		expect(isTodoItem({ status: "pending" })).toBe(false);
		expect(isTodoItem({ content: "no priority leak", status: "pending", priority: "high" })).toBe(true);
		expect(isTodoPhase({ name: "Phase", tasks: [{ content: "task", status: "pending" }] })).toBe(true);
		expect(isTodoPhase({ name: "Phase", tasks: [{ content: "task", status: "blocked" }] })).toBe(false);
	});

	it("reconstructs the latest phases from v2 custom entries", () => {
		// given
		const first: TodoPhase[] = [{ name: "One", tasks: [{ content: "First", status: "pending" }] }];
		const second: TodoPhase[] = [{ name: "Two", tasks: [{ content: "Second", status: "in_progress" }] }];

		// when
		const phases = getLatestPhasesFromBranchEntries([
			{ type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { schema: "v2", phases: first } },
			{ type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { schema: "v2", phases: second } },
		]);

		// then
		expect(phases).toEqual(second);
		expect(firstOf(phases)).not.toBe(firstOf(second));
	});

	it("recovers a legacy flat todowrite-era entry as the latest recoverable snapshot", () => {
		// given a branch whose NEWEST state entry is a legacy flat todowrite payload
		const entries = [
			{
				type: "custom",
				customType: TODO_STATE_ENTRY_TYPE,
				data: {
					schema: "v2",
					phases: [{ name: "Modern", tasks: [{ content: "New work", status: "pending" }] }],
				},
			},
			{
				type: "custom",
				customType: TODO_STATE_ENTRY_TYPE,
				data: {
					todos: [
						{ content: "Legacy done", status: "completed", priority: "high" },
						{ content: "Legacy cancelled", status: "cancelled", priority: "low" },
						{ content: "Legacy blocked", status: "blocked", priority: "medium" },
					],
				},
			},
		];

		// when the branch state is read
		const phases = getLatestPhasesFromBranchEntries(entries);

		// then the legacy payload wins and migrates into a single phase
		expect(phases).toEqual([
			{
				name: DEFAULT_INIT_PHASE,
				tasks: [
					{ content: "Legacy done", status: "completed" },
					{ content: "Legacy cancelled", status: "abandoned" },
					{ content: "Legacy blocked", status: "pending" },
				],
			},
		]);
	});

	it("recovers state from historical todowrite and todo tool results", () => {
		// given
		const legacyTodos = [{ content: "From todowrite", status: "completed", priority: "high" }];
		const phased: TodoPhase[] = [{ name: "Phase", tasks: [{ content: "From todo", status: "pending" }] }];

		// when
		const phases = getLatestPhasesFromBranchEntries([
			{
				type: "message",
				message: { role: "toolResult", toolName: "todowrite", details: { todos: legacyTodos } },
			},
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todo",
					details: { op: "init", phases: phased, storage: "session" },
				},
			},
			{
				type: "message",
				message: { role: "toolResult", toolName: "todoread", details: { todos: legacyTodos } },
			},
		]);

		// then todoread results are ignored and the newest todo result wins
		expect(phases).toEqual(phased);
	});

	it("skips malformed persisted entries instead of coercing them", () => {
		// given
		const valid: TodoPhase[] = [{ name: "Valid", tasks: [{ content: "Keep", status: "pending" }] }];

		// when
		const phases = getLatestPhasesFromBranchEntries([
			{ type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { schema: "v2", phases: valid } },
			{ type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { schema: "v2", phases: "not-an-array" } },
			{
				type: "custom",
				customType: TODO_STATE_ENTRY_TYPE,
				data: { todos: [{ content: "bad", status: "pending", priority: 1 }, "garbage"] },
			},
		]);

		// then
		expect(phases).toEqual(valid);
	});

	it("flattens the latest phases for legacy flat-array consumers", () => {
		// given
		const phased: TodoPhase[] = [
			{ name: "One", tasks: [{ content: "A", status: "completed" }] },
			{ name: "Two", tasks: [{ content: "B", status: "pending" }] },
		];

		// when
		const todos = getLatestTodosFromBranchEntries([
			{ type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { schema: "v2", phases: phased } },
		]);

		// then
		expect(todos).toEqual([
			{ content: "A", status: "completed" },
			{ content: "B", status: "pending" },
		]);
	});
});
