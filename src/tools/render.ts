// Ported and adapted from oh-my-pi's todo tool (MIT License).
// Copyright (c) 2025 Mario Zechner
// Copyright (c) 2025-2026 Can Bölük
// https://github.com/can1357/oh-my-pi

import type { AgentToolResult, Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { nextActionableTask } from "../operations.js";
import { getTodoMarker, sanitizeTodoText } from "../rendering.js";
import {
	findTaskByContent,
	type TodoCompletionTransition,
	type TodoOpEntry,
	type TodoPhase,
	type TodoToolDetails,
} from "../state.js";

function countInitItems(params: TodoOpEntry): { phases: number; tasks: number } {
	if (params.list) {
		return {
			phases: params.list.length,
			tasks: params.list.reduce((total, phase) => total + phase.items.length, 0),
		};
	}
	if (params.items) return { phases: params.items.length > 0 ? 1 : 0, tasks: params.items.length };
	return { phases: 0, tasks: 0 };
}

function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function renderCallLabel(params: TodoOpEntry): string {
	switch (params.op) {
		case "init": {
			const counts = countInitItems(params);
			return `todo init (${countLabel(counts.phases, "phase")}, ${countLabel(counts.tasks, "task")})`;
		}
		case "append":
			return `todo append: ${sanitizeTodoText(params.phase ?? "") || "(missing phase)"} (${countLabel(
				params.items?.length ?? 0,
				"item",
			)})`;
		case "start":
		case "done":
		case "drop":
			return `todo ${params.op}: ${sanitizeTodoText(params.task ?? params.phase ?? "") || "(missing target)"}`;
		case "rm":
			return `todo rm: ${sanitizeTodoText(params.task ?? params.phase ?? "all") || "all"}`;
		case "view":
			return "todo view";
	}
}

export function phaseRomanNumeral(oneBasedIndex: number): string {
	if (oneBasedIndex <= 0) return "";
	const pairs: ReadonlyArray<readonly [number, string]> = [
		[1000, "M"],
		[900, "CM"],
		[500, "D"],
		[400, "CD"],
		[100, "C"],
		[90, "XC"],
		[50, "L"],
		[40, "XL"],
		[10, "X"],
		[9, "IX"],
		[5, "V"],
		[4, "IV"],
		[1, "I"],
	];
	let remaining = oneBasedIndex;
	let output = "";
	for (const [value, symbol] of pairs) {
		while (remaining >= value) {
			output += symbol;
			remaining -= value;
		}
	}
	return output;
}

function formatPhaseHeader(name: string, index: number, theme: Theme): string {
	return theme.fg("accent", theme.bold(`${phaseRomanNumeral(index)}. ${sanitizeTodoText(name)}`));
}

function formatPhaseSummary(phase: TodoPhase, index: number, theme: Theme): string {
	const closed = phase.tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length;
	return theme.fg(
		"dim",
		`${phaseRomanNumeral(index)}. ${sanitizeTodoText(phase.name)} — ${closed}/${phase.tasks.length} done`,
	);
}

function formatTaskLine(task: TodoPhase["tasks"][number], theme: Theme): string {
	const line = `${getTodoMarker(task.status)} ${sanitizeTodoText(task.content)}`;
	switch (task.status) {
		case "completed":
			return theme.fg("dim", theme.strikethrough(line));
		case "in_progress":
			return theme.fg("accent", theme.bold(line));
		case "abandoned":
			return theme.fg("dim", line);
		case "pending":
			return line;
	}
}

function computeTouchedPhases(
	args: TodoOpEntry,
	phases: readonly TodoPhase[],
	completedTasks: readonly TodoCompletionTransition[],
): Set<string> | null {
	const touched = new Set<string>();
	const activeTask = nextActionableTask(phases);
	if (activeTask) {
		const activePhase = phases.find((phase) => phase.tasks.includes(activeTask));
		if (activePhase) touched.add(activePhase.name);
	}
	for (const transition of completedTasks) touched.add(transition.phase);
	if (args.op === "init") {
		for (const phase of phases) touched.add(phase.name);
	} else {
		if (args.phase) {
			const phase = phases.find((candidate) => candidate.name === args.phase);
			if (phase) touched.add(phase.name);
		}
		if (args.task) {
			const hit = findTaskByContent([...phases], args.task);
			if (hit) touched.add(hit.phase.name);
		}
	}
	return touched.size > 0 ? touched : null;
}

function renderTodoPhases(
	phases: readonly TodoPhase[],
	completedTasks: readonly TodoCompletionTransition[],
	options: ToolRenderResultOptions,
	args: TodoOpEntry,
	theme: Theme,
): string {
	const visiblePhases = phases.filter((phase) => phase.tasks.length > 0);
	if (visiblePhases.length === 0) return "";

	const touched =
		options.expanded || visiblePhases.length === 1 ? null : computeTouchedPhases(args, visiblePhases, completedTasks);
	const lines: string[] = [];
	for (let index = 0; index < visiblePhases.length; index += 1) {
		const phase = visiblePhases[index];
		if (!phase) continue;
		const oneBasedIndex = index + 1;
		if (touched && !touched.has(phase.name)) {
			lines.push(formatPhaseSummary(phase, oneBasedIndex, theme));
			continue;
		}
		lines.push(formatPhaseHeader(phase.name, oneBasedIndex, theme));
		for (const task of phase.tasks) lines.push(`  ${formatTaskLine(task, theme)}`);
	}
	return lines.join("\n");
}

function getTextContent(result: AgentToolResult<TodoToolDetails>): string {
	return result.content
		.filter(
			(content): content is { type: "text"; text: string } =>
				content.type === "text" && typeof content.text === "string",
		)
		.map((content) => content.text)
		.join("\n");
}

export function renderTodoCall(args: TodoOpEntry, theme: Theme): Text {
	return new Text(theme.fg("toolTitle", theme.bold(renderCallLabel(args))), 0, 0);
}

export function renderTodoResult(
	result: AgentToolResult<TodoToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	args: TodoOpEntry,
	isError: boolean,
): Text {
	if (isError) {
		return new Text(theme.fg("toolOutput", getTextContent(result)), 0, 0);
	}
	const phases = result.details?.phases ?? [];
	const rendered = renderTodoPhases(phases, result.details?.completedTasks ?? [], options, args, theme);
	const text = rendered || getTextContent(result) || "Todo list is empty.";
	return new Text(text, 0, 0);
}
