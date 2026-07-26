// Ported and adapted from oh-my-pi's todo tool (MIT License).
// Copyright (c) 2025 Mario Zechner
// Copyright (c) 2025-2026 Can Bölük
// https://github.com/can1357/oh-my-pi

import stripAnsi from "strip-ansi";
import { nextActionableTask } from "./operations.js";
import type { TodoItem, TodoPhase } from "./state.js";

export function sanitizeTodoText(text: string): string {
	return stripAnsi(text)
		.replace(/[\r\n]+/g, " ")
		.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function isTerminalTodoStatus(status: string): boolean {
	return status === "completed" || status === "abandoned" || status === "cancelled";
}

export function isIncompleteTodo(todo: TodoItem): boolean {
	return !isTerminalTodoStatus(todo.status);
}

export function getTodoMarker(status: string): string {
	if (status === "completed") return "[✓]";
	if (status === "in_progress") return "[•]";
	if (status === "abandoned" || status === "cancelled") return "[×]";
	return "[ ]";
}

function getActivePhase(phases: readonly TodoPhase[]): TodoPhase | undefined {
	const activeTask = nextActionableTask(phases);
	if (!activeTask) return undefined;
	return phases.find((phase) => phase.tasks.includes(activeTask));
}

export function getTodoWidgetLines(phases: readonly TodoPhase[]): string[] | undefined {
	const activePhase = getActivePhase(phases);
	if (!activePhase) return undefined;
	return [
		"Todo",
		sanitizeTodoText(activePhase.name),
		...activePhase.tasks.map((todo) => `${getTodoMarker(todo.status)} ${sanitizeTodoText(todo.content)}`),
	];
}

export function getTodoResultLines(phases: readonly TodoPhase[]): string[] {
	const tasks = phases.flatMap((phase) => phase.tasks);
	return [
		`${tasks.filter(isIncompleteTodo).length} todos`,
		...phases.flatMap((phase) => [
			`${sanitizeTodoText(phase.name)}:`,
			...phase.tasks.map((todo) => `${getTodoMarker(todo.status)} ${sanitizeTodoText(todo.content)}`),
		]),
	];
}

export function formatSummary(phases: readonly TodoPhase[], errors: readonly string[], readOnly = false): string {
	const tasks = phases.flatMap((phase) => phase.tasks);
	if (tasks.length === 0) {
		if (errors.length > 0) return `Errors: ${errors.join("; ")}`;
		return readOnly ? "Todo list is empty." : "Todo list cleared.";
	}

	const remainingByPhase = phases
		.map((phase) => ({
			name: phase.name,
			tasks: phase.tasks.filter((task) => task.status === "pending" || task.status === "in_progress"),
		}))
		.filter((phase) => phase.tasks.length > 0);
	const remainingTasks = remainingByPhase.flatMap((phase) =>
		phase.tasks.map((task) => ({ ...task, phase: phase.name })),
	);

	let currentIdx = phases.findIndex((phase) =>
		phase.tasks.some((task) => task.status === "pending" || task.status === "in_progress"),
	);
	if (currentIdx === -1) currentIdx = phases.length - 1;
	const current = phases[currentIdx];
	if (!current) return errors.length > 0 ? `Errors: ${errors.join("; ")}` : "Todo list is empty.";
	const done = current.tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length;

	const lines: string[] = [];
	if (errors.length > 0) lines.push(`Errors: ${errors.join("; ")}`);
	if (remainingTasks.length === 0) {
		lines.push("Remaining items: none.");
	} else {
		lines.push(`Remaining items (${remainingTasks.length}):`);
		for (const task of remainingTasks) lines.push(`  - ${task.content} [${task.status}] (${task.phase})`);
	}

	const closedAll = tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length;
	const workedAhead = phases.some(
		(phase, index) =>
			index > currentIdx && phase.tasks.some((task) => task.status === "completed" || task.status === "abandoned"),
	);
	lines.push(`Overall: ${closedAll}/${tasks.length} done, ${remainingTasks.length} open.`);
	lines.push(
		`Active phase ${currentIdx + 1}/${phases.length} "${current.name}" (${done}/${current.tasks.length})${
			workedAhead
				? " — earliest phase with open tasks; the in-progress pointer auto-advances to the earliest open task on each completion, so it can sit behind out-of-order work (nothing was un-completed)."
				: "."
		}`,
	);
	for (const phase of phases) {
		lines.push(`  ${phase.name}:`);
		for (const task of phase.tasks) {
			const checkbox = task.status === "completed" ? "[X]" : "[ ]";
			const tag = task.status === "in_progress" ? " (in progress)" : task.status === "abandoned" ? " (dropped)" : "";
			lines.push(`    - ${checkbox} ${task.content}${tag}`);
		}
	}
	return lines.join("\n");
}
