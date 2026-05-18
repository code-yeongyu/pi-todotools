import type { TodoItem, TodoPriority, TodoStateEntry, TodoStatus, TodoWriteDetails } from "./state.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTodoStatus(value: unknown): value is TodoStatus {
	return value === "pending" || value === "in_progress" || value === "completed" || value === "cancelled";
}

export function isTodoPriority(value: unknown): value is TodoPriority {
	return value === "high" || value === "medium" || value === "low";
}

export function isTodoItem(value: unknown): value is TodoItem {
	return (
		isRecord(value) &&
		typeof value["content"] === "string" &&
		isTodoStatus(value["status"]) &&
		isTodoPriority(value["priority"])
	);
}

export function isTodoItemArray(value: unknown): value is TodoItem[] {
	return Array.isArray(value) && value.every(isTodoItem);
}

export function isTodoStateEntry(value: unknown): value is TodoStateEntry {
	return isRecord(value) && isTodoItemArray(value["todos"]);
}

export function isTodoWriteDetails(value: unknown): value is TodoWriteDetails {
	return isRecord(value) && isTodoItemArray(value["todos"]);
}
