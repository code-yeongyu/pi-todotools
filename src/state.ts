import stripAnsi from "strip-ansi";
import { isRecord, isTodoStateEntry, isTodoWriteDetails } from "./guards.js";

export { isRecord, isTodoItem, isTodoItemArray, isTodoStateEntry, isTodoWriteDetails } from "./guards.js";

export type TodoItem = {
	content: string;
	status: TodoStatus;
	priority: TodoPriority;
};

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type TodoPriority = "high" | "medium" | "low";

export type TodoWriteDetails = {
	todos: TodoItem[];
};

export type TodoStateEntry = {
	todos: TodoItem[];
};

type BranchEntry = { type: string; customType?: string; data?: unknown; message?: unknown };

export const TODO_STATE_ENTRY_TYPE = "sanepi.todo-state";

export function isTerminalTodoStatus(status: string): boolean {
	return status === "completed" || status === "cancelled";
}

export function isIncompleteTodo(todo: TodoItem): boolean {
	return !isTerminalTodoStatus(todo.status);
}

function countOpenTodos(todos: TodoItem[]): number {
	return todos.filter(isIncompleteTodo).length;
}

export function sanitizeTodoText(text: string): string {
	return stripAnsi(text)
		.replace(/[\r\n]+/g, " ")
		.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function getTodoMarker(status: string): string {
	if (status === "completed") return "[✓]";
	if (status === "in_progress") return "[•]";
	if (status === "cancelled") return "[×]";
	return "[ ]";
}

export function getTodoWidgetLines(todos: TodoItem[]): string[] | undefined {
	if (todos.length === 0 || !todos.some(isIncompleteTodo)) {
		return undefined;
	}
	return ["Todo", ...todos.map((todo) => `${getTodoMarker(todo.status)} ${sanitizeTodoText(todo.content)}`)];
}

export function getTodoResultLines(todos: TodoItem[]): string[] {
	return [
		`${countOpenTodos(todos)} todos`,
		...todos.map((todo) => `${getTodoMarker(todo.status)} ${sanitizeTodoText(todo.content)}`),
	];
}

export function getLatestTodosFromBranchEntries(entries: BranchEntry[]): TodoItem[] {
	let todos: TodoItem[] = [];

	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === TODO_STATE_ENTRY_TYPE) {
			if (isTodoStateEntry(entry.data)) {
				const data = entry.data;
				todos = data.todos.map((todo) => ({ ...todo }));
			}
			continue;
		}

		if (entry.type !== "message" || !isRecord(entry.message)) {
			continue;
		}

		const message = entry.message;
		if (message["role"] !== "toolResult" || message["toolName"] !== "todowrite") {
			continue;
		}

		const messageDetails = message["details"];
		if (isTodoWriteDetails(messageDetails)) {
			const details = messageDetails;
			todos = details.todos.map((todo) => ({ ...todo }));
		}
	}

	return todos;
}
