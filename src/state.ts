// Ported and adapted from oh-my-pi's todo tool (MIT License).
// Copyright (c) 2025 Mario Zechner
// Copyright (c) 2025-2026 Can Bölük
// https://github.com/can1357/oh-my-pi

export type TodoStatus = "pending" | "in_progress" | "completed" | "abandoned";

export type TodoOperation = "init" | "start" | "done" | "rm" | "drop" | "append" | "view";

export type TodoItem = {
	content: string;
	status: TodoStatus;
};

export type TodoPhase = {
	name: string;
	tasks: TodoItem[];
};

export type TodoCompletionTransition = {
	phase: string;
	content: string;
};

export type TodoToolDetails = {
	op?: TodoOperation;
	phases: TodoPhase[];
	storage: "session" | "memory";
	completedTasks?: TodoCompletionTransition[];
};

export type TodoStateEntry = {
	schema: "v2";
	phases: TodoPhase[];
};

export const TODO_STATE_ENTRY_TYPE = "sanepi.todo-state";
export const DEFAULT_INIT_PHASE = "Tasks";

export type TodoPhaseInput = {
	phase: string;
	items: string[];
};

export type TodoOpEntry = {
	op: TodoOperation;
	list?: TodoPhaseInput[];
	task?: string;
	phase?: string;
	items?: string[];
};

export type TaskHit = {
	task: TodoItem;
	phase: TodoPhase;
};

export type BranchEntry = { type: string; customType?: string; data?: unknown; message?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTodoStatus(value: unknown): value is TodoStatus {
	return value === "pending" || value === "in_progress" || value === "completed" || value === "abandoned";
}

function parseTodoStatus(value: unknown): TodoStatus | undefined {
	if (value === "cancelled") return "abandoned";
	return isTodoStatus(value) ? value : undefined;
}

function parseTodoItem(value: unknown, options?: { lenient?: boolean }): TodoItem | undefined {
	if (!isRecord(value) || typeof value["content"] !== "string") return undefined;
	const status = parseTodoStatus(value["status"]) ?? (options?.lenient ? "pending" : undefined);
	return status ? { content: value["content"], status } : undefined;
}

function parseTodoPhase(value: unknown): TodoPhase | undefined {
	if (!isRecord(value) || typeof value["name"] !== "string" || !Array.isArray(value["tasks"])) return undefined;
	const tasks: TodoItem[] = [];
	for (const task of value["tasks"]) {
		const parsed = parseTodoItem(task);
		if (!parsed) return undefined;
		tasks.push(parsed);
	}
	return { name: value["name"], tasks };
}

function parsePhases(value: unknown): TodoPhase[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const phases: TodoPhase[] = [];
	for (const phase of value) {
		const parsed = parseTodoPhase(phase);
		if (!parsed) return undefined;
		phases.push(parsed);
	}
	return phases;
}

function parseLegacyTodos(value: unknown): TodoPhase[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const tasks: TodoItem[] = [];
	for (const todo of value) {
		// Legacy todowrite persisted arbitrary status strings (e.g. "blocked")
		// alongside a priority field. Preserve those entries instead of dropping
		// the whole list: unknown statuses become "pending" so the task survives
		// migration as open work, and the priority field is dropped.
		const parsed = parseTodoItem(todo, { lenient: true });
		if (!parsed) return undefined;
		tasks.push(parsed);
	}
	return [{ name: DEFAULT_INIT_PHASE, tasks }];
}

function readTodoPayload(value: unknown): TodoPhase[] | undefined {
	if (!isRecord(value)) return undefined;
	if (value["schema"] === "v2") return parsePhases(value["phases"]);
	if (Array.isArray(value["phases"])) return parsePhases(value["phases"]);
	if (Array.isArray(value["todos"])) return parseLegacyTodos(value["todos"]);
	return undefined;
}

export function findTaskByContent(phases: TodoPhase[], content: string): TaskHit | undefined {
	for (const phase of phases) {
		const task = phase.tasks.find((candidate) => candidate.content === content);
		if (task) return { task, phase };
	}
	return undefined;
}

export function findPhaseByName(phases: TodoPhase[], name: string): TodoPhase | undefined {
	return phases.find((phase) => phase.name === name);
}

export function cloneTask(task: TodoItem): TodoItem {
	return { content: task.content, status: task.status };
}

export function clonePhases(phases: readonly TodoPhase[]): TodoPhase[] {
	return phases.map((phase) => ({ name: phase.name, tasks: phase.tasks.map(cloneTask) }));
}

export function isTodoItem(value: unknown): value is TodoItem {
	// Strict guard: only the canonical TodoStatus values are accepted. Legacy
	// statuses like "cancelled" are migrated to "abandoned" by the parse path
	// (parseTodoItem/readTodoPayload), not by this guard, so a narrowed value's
	// status is always a sound TodoStatus rather than the unchanged input.
	if (!isRecord(value) || typeof value["content"] !== "string") return false;
	return isTodoStatus(value["status"]);
}

export function isTodoItemArray(value: unknown): value is TodoItem[] {
	return Array.isArray(value) && value.every(isTodoItem);
}

export function isTodoPhase(value: unknown): value is TodoPhase {
	if (!isRecord(value) || typeof value["name"] !== "string" || !Array.isArray(value["tasks"])) return false;
	return value["tasks"].every(isTodoItem);
}

export function isTodoPhaseArray(value: unknown): value is TodoPhase[] {
	return Array.isArray(value) && value.every(isTodoPhase);
}

export function getLatestPhasesFromBranchEntries(entries: BranchEntry[]): TodoPhase[] {
	let phases: TodoPhase[] = [];

	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === TODO_STATE_ENTRY_TYPE) {
			const parsed = readTodoPayload(entry.data);
			if (parsed) phases = clonePhases(parsed);
			continue;
		}

		if (entry.type !== "message" || !isRecord(entry.message)) continue;
		if (entry.message["role"] !== "toolResult") continue;
		if (entry.message["toolName"] !== "todo" && entry.message["toolName"] !== "todowrite") continue;

		const parsed = readTodoPayload(entry.message["details"]);
		if (parsed) phases = clonePhases(parsed);
	}

	return phases;
}

/** Compatibility reader for callers that still expect the old flat array. */
export function getLatestTodosFromBranchEntries(entries: BranchEntry[]): TodoItem[] {
	return getLatestPhasesFromBranchEntries(entries).flatMap((phase) => phase.tasks.map(cloneTask));
}
