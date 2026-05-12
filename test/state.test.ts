import { describe, expect, it } from "vitest";
import {
	getLatestTodosFromBranchEntries,
	getTodoResultLines,
	getTodoWidgetLines,
	isIncompleteTodo,
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
});
