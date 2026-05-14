import { describe, expect, it } from "vitest";
import {
	getLatestTodosFromBranchEntries,
	getTodoResultLines,
	getTodoWidgetLines,
	isIncompleteTodo,
	isTodoItem,
	sanitizeTodoText,
	TODO_STATE_ENTRY_TYPE,
	type TodoItem,
} from "../src/state.js";

describe("todo state", () => {
	it("builds sidebar and result lines from the current todo state", () => {
		const todos: TodoItem[] = [
			{ content: "Active task", status: "in_progress", priority: "high" },
			{ content: "Done task", status: "completed", priority: "low" },
			{ content: "Cancelled task", status: "cancelled", priority: "low" },
			{ content: "Queued task", status: "pending", priority: "medium" },
		];

		expect(getTodoWidgetLines(todos)).toEqual([
			"Todo",
			"[•] Active task",
			"[✓] Done task",
			"[×] Cancelled task",
			"[ ] Queued task",
		]);
		expect(getTodoResultLines(todos)).toEqual([
			"2 todos",
			"[•] Active task",
			"[✓] Done task",
			"[×] Cancelled task",
			"[ ] Queued task",
		]);
	});

	it("treats completed and cancelled todos as terminal", () => {
		const todos: TodoItem[] = [
			{ content: "Done task", status: "completed", priority: "low" },
			{ content: "Cancelled task", status: "cancelled", priority: "low" },
		];

		expect(todos.map(isIncompleteTodo)).toEqual([false, false]);
		expect(getTodoWidgetLines(todos)).toBeUndefined();
		expect(getTodoResultLines(todos)).toEqual(["0 todos", "[✓] Done task", "[×] Cancelled task"]);
	});

	it("accepts the canonical todo status and priority values", () => {
		const statuses = ["pending", "in_progress", "completed", "cancelled"];
		const priorities = ["high", "medium", "low"];

		for (const status of statuses) {
			for (const priority of priorities) {
				expect(isTodoItem({ content: `${status}:${priority}`, status, priority })).toBe(true);
			}
		}
	});

	it("rejects non-canonical todo status and priority values", () => {
		expect(isTodoItem({ content: "Bad status", status: "blocked", priority: "high" })).toBe(false);
		expect(isTodoItem({ content: "Bad priority", status: "pending", priority: "urgent" })).toBe(false);
	});

	it("sanitizes todo text before rendering", () => {
		expect(sanitizeTodoText("Unsafe\u001b[31m text\nnext\tline")).toBe("Unsafe text next line");
		expect(
			getTodoWidgetLines([{ content: "Unsafe\u001b[31m text\nnext line", status: "pending", priority: "high" }]),
		).toEqual(["Todo", "[ ] Unsafe text next line"]);
	});

	it("reconstructs latest todos from custom entries and historical todowrite results", () => {
		const firstTodos: TodoItem[] = [{ content: "From tool result", status: "pending", priority: "medium" }];
		const secondTodos: TodoItem[] = [{ content: "From custom entry", status: "in_progress", priority: "high" }];

		const todos = getLatestTodosFromBranchEntries([
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todowrite",
					details: { todos: firstTodos },
				},
			},
			{
				type: "custom",
				customType: TODO_STATE_ENTRY_TYPE,
				data: { todos: secondTodos },
			},
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todoread",
					details: { todos: [{ content: "Ignored", status: "pending", priority: "low" }] },
				},
			},
		]);

		expect(todos).toEqual(secondTodos);
		expect(todos).not.toBe(secondTodos);
		expect(todos[0]).not.toBe(secondTodos[0]);
	});

	it("rejects malformed persisted entries instead of coercing them", () => {
		const validTodos: TodoItem[] = [{ content: "Valid", status: "pending", priority: "high" }];

		const todos = getLatestTodosFromBranchEntries([
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todowrite",
					details: { todos: validTodos },
				},
			},
			{
				type: "custom",
				customType: TODO_STATE_ENTRY_TYPE,
				data: { todos: [{ content: "Missing priority", status: "pending" }] },
			},
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todowrite",
					details: { todos: [{ content: "Bad details", status: "completed", priority: 1 }] },
				},
			},
		]);

		expect(todos).toEqual(validTodos);
	});
});
