// Ported and adapted from oh-my-pi's todo tool (MIT License).
// Copyright (c) 2025 Mario Zechner
// Copyright (c) 2025-2026 Can Bölük
// https://github.com/can1357/oh-my-pi

import {
	clonePhases,
	DEFAULT_INIT_PHASE,
	findPhaseByName,
	findTaskByContent,
	type TaskHit,
	type TodoCompletionTransition,
	type TodoItem,
	type TodoOpEntry,
	type TodoPhase,
	type TodoStatus,
} from "./state.js";

export function normalizeInProgressTask(phases: TodoPhase[]): void {
	const orderedTasks = phases.flatMap((phase) => phase.tasks);
	if (orderedTasks.length === 0) return;

	const inProgressTasks = orderedTasks.filter((task) => task.status === "in_progress");
	if (inProgressTasks.length > 1) {
		for (const task of inProgressTasks.slice(1)) task.status = "pending";
	}

	if (inProgressTasks.length > 0) return;

	const firstPendingTask = orderedTasks.find((task) => task.status === "pending");
	if (firstPendingTask) firstPendingTask.status = "in_progress";
}

/** Return the active task, preferring an in-progress item over the first pending item. */
export function nextActionableTask(phases: readonly TodoPhase[]): TodoItem | undefined {
	let firstPending: TodoItem | undefined;
	for (const phase of phases) {
		for (const task of phase.tasks) {
			if (task.status === "in_progress") return task;
			if (!firstPending && task.status === "pending") firstPending = task;
		}
	}
	return firstPending;
}

export function getCompletionTransitions(
	previous: readonly TodoPhase[],
	updated: readonly TodoPhase[],
): TodoCompletionTransition[] {
	const previousStatuses = new Map<string, TodoStatus>();
	for (const phase of previous) {
		for (const task of phase.tasks) previousStatuses.set(`${phase.name}\u0000${task.content}`, task.status);
	}

	const transitions: TodoCompletionTransition[] = [];
	for (const phase of updated) {
		for (const task of phase.tasks) {
			if (task.status !== "completed") continue;
			const previousStatus = previousStatuses.get(`${phase.name}\u0000${task.content}`);
			if (previousStatus && previousStatus !== "completed") {
				transitions.push({ phase: phase.name, content: task.content });
			}
		}
	}
	return transitions;
}

export function resolveTaskOrError(
	phases: TodoPhase[],
	content: string | undefined,
	errors: string[],
): TaskHit | undefined {
	if (!content) {
		errors.push("Missing task content");
		return undefined;
	}
	const hit = findTaskByContent(phases, content);
	if (!hit) {
		if (/^task-\d+$/.test(content)) {
			errors.push(
				`Task "${content}" not found. Tasks are referenced by content, not by IDs — pass the task's full text from the previous result.`,
			);
		} else {
			const totalTasks = phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
			const hint = totalTasks === 0 ? " (todo list is empty — was it replaced or not yet created?)" : "";
			errors.push(`Task "${content}" not found${hint}`);
		}
	}
	return hit;
}

export function resolvePhaseOrError(
	phases: TodoPhase[],
	name: string | undefined,
	errors: string[],
): TodoPhase | undefined {
	if (!name) {
		errors.push("Missing phase name");
		return undefined;
	}
	const phase = findPhaseByName(phases, name);
	if (!phase) errors.push(`Phase "${name}" not found`);
	return phase;
}

export function getTaskTargets(phases: TodoPhase[], entry: TodoOpEntry, errors: string[]): TodoItem[] {
	if (entry.task) {
		const hit = resolveTaskOrError(phases, entry.task, errors);
		return hit ? [hit.task] : [];
	}
	if (entry.phase) {
		const phase = resolvePhaseOrError(phases, entry.phase, errors);
		return phase ? [...phase.tasks] : [];
	}
	return phases.flatMap((phase) => phase.tasks);
}

export function initPhases(entry: TodoOpEntry, errors: string[]): TodoPhase[] {
	const list =
		entry.list ??
		(entry.items && entry.items.length > 0
			? [{ phase: entry.phase ?? DEFAULT_INIT_PHASE, items: entry.items }]
			: undefined);
	if (!list) {
		errors.push("Missing list for init operation");
		return [];
	}

	const seenPhases = new Set<string>();
	const seenTasks = new Set<string>();
	for (const listEntry of list) {
		if (seenPhases.has(listEntry.phase)) errors.push(`Duplicate phase "${listEntry.phase}" in init list`);
		seenPhases.add(listEntry.phase);
		if (listEntry.items.length === 0) errors.push(`Phase "${listEntry.phase}" has no tasks in init list`);
		for (const content of listEntry.items) {
			if (seenTasks.has(content)) errors.push(`Duplicate task "${content}" in init list`);
			seenTasks.add(content);
		}
	}

	return list.map((listEntry) => ({
		name: listEntry.phase,
		tasks: listEntry.items.map((content) => ({ content, status: "pending" as const })),
	}));
}

export function appendItems(phases: TodoPhase[], entry: TodoOpEntry, errors: string[]): TodoPhase[] {
	if (!entry.phase) {
		errors.push("Missing phase name for append operation");
		return phases;
	}
	if (!entry.items || entry.items.length === 0) {
		errors.push("Missing items for append operation");
		return phases;
	}

	const seen = new Set<string>();
	let hasDuplicate = false;
	for (const content of entry.items) {
		if (seen.has(content) || findTaskByContent(phases, content)) {
			errors.push(`Task "${content}" already exists`);
			hasDuplicate = true;
		}
		seen.add(content);
	}
	if (hasDuplicate) return phases;

	let phase = findPhaseByName(phases, entry.phase);
	if (!phase) {
		phase = { name: entry.phase, tasks: [] };
		phases.push(phase);
	}

	for (const content of entry.items) phase.tasks.push({ content, status: "pending" });
	return phases;
}

export function removeTasks(phases: TodoPhase[], entry: TodoOpEntry, errors: string[]): TodoPhase[] {
	if (entry.task) {
		const hit = resolveTaskOrError(phases, entry.task, errors);
		if (!hit) return phases;
		hit.phase.tasks = hit.phase.tasks.filter((candidate) => candidate !== hit.task);
		return phases;
	}
	if (entry.phase) {
		const phase = resolvePhaseOrError(phases, entry.phase, errors);
		if (!phase) return phases;
		phase.tasks = [];
		return phases;
	}
	for (const phase of phases) phase.tasks = [];
	return phases;
}

export function applyEntry(phases: TodoPhase[], entry: TodoOpEntry, errors: string[]): TodoPhase[] {
	switch (entry.op) {
		case "init":
			return initPhases(entry, errors);
		case "start": {
			const hit = resolveTaskOrError(phases, entry.task, errors);
			if (!hit) return phases;
			for (const phase of phases) {
				for (const candidate of phase.tasks) {
					if (candidate.status === "in_progress" && candidate !== hit.task) candidate.status = "pending";
				}
			}
			hit.task.status = "in_progress";
			return phases;
		}
		case "done":
			for (const task of getTaskTargets(phases, entry, errors)) task.status = "completed";
			return phases;
		case "drop":
			for (const task of getTaskTargets(phases, entry, errors)) task.status = "abandoned";
			return phases;
		case "rm":
			return removeTasks(phases, entry, errors);
		case "append":
			return appendItems(phases, entry, errors);
		case "view":
			return phases;
	}
}

export function applyParams(phases: TodoPhase[], params: TodoOpEntry): { phases: TodoPhase[]; errors: string[] } {
	if (params.op === "view") return { phases, errors: [] };
	const original = clonePhases(phases);
	const errors: string[] = [];
	const next = applyEntry(phases, params, errors);
	if (errors.length > 0) return { phases: original, errors };
	normalizeInProgressTask(next);
	return { phases: next, errors };
}

export function applyOpsToPhases(
	currentPhases: readonly TodoPhase[],
	ops: readonly TodoOpEntry[],
): { phases: TodoPhase[]; errors: string[] } {
	const errors: string[] = [];
	let next = clonePhases(currentPhases);
	for (const op of ops) next = applyEntry(next, op, errors);
	if (errors.length > 0) return { phases: clonePhases(currentPhases), errors };
	normalizeInProgressTask(next);
	return { phases: next, errors };
}
