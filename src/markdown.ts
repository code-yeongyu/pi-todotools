// Markdown round-trip for the phased todo model.
//
// Ported and adapted from oh-my-pi's `packages/coding-agent/src/tools/todo.ts`
// (MIT — see NOTICE). Phases render as `# <name>` headings and tasks as
// checklist rows whose marker encodes status: `[ ]` pending, `[/]` in_progress,
// `[x]` completed, `[-]` abandoned.
// Copyright (c) 2025 Mario Zechner
// Copyright (c) 2025-2026 Can Bölük

import { isAbsolute, resolve } from "node:path";
import { normalizeInProgressTask } from "./operations.js";
import { DEFAULT_INIT_PHASE, type TodoPhase, type TodoStatus } from "./state.js";

const STATUS_TO_MARKER: Record<TodoStatus, string> = {
	pending: " ",
	in_progress: "/",
	completed: "x",
	abandoned: "-",
};

const MARKER_TO_STATUS: Record<string, TodoStatus> = {
	" ": "pending",
	"": "pending",
	x: "completed",
	X: "completed",
	"/": "in_progress",
	">": "in_progress",
	"-": "abandoned",
	"~": "abandoned",
};

/** Default file name for todo markdown export and import. */
export const DEFAULT_TODO_MARKDOWN_FILE = "TODO.md";

/** Resolve a user-supplied path argument against cwd; empty input -> TODO.md. */
export function resolveTodoMarkdownPath(input: string, cwd: string): string {
	const raw = input.trim().replace(/^["']|["']$/g, "") || DEFAULT_TODO_MARKDOWN_FILE;
	return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

/** Render todo phases as a Markdown checklist suitable for editing/copying. */
export function phasesToMarkdown(phases: readonly TodoPhase[]): string {
	if (phases.length === 0) return `# ${DEFAULT_INIT_PHASE}\n`;
	const out: string[] = [];
	for (let index = 0; index < phases.length; index += 1) {
		const phase = phases[index];
		if (!phase) continue;
		if (index > 0) out.push("");
		out.push(`# ${phase.name}`);
		for (const task of phase.tasks) {
			out.push(`- [${STATUS_TO_MARKER[task.status]}] ${task.content}`);
		}
	}
	return `${out.join("\n")}\n`;
}

/** Parse a Markdown checklist back into todo phases. */
export function markdownToPhases(markdown: string): { phases: TodoPhase[]; errors: string[] } {
	const errors: string[] = [];
	const phases: TodoPhase[] = [];
	let currentPhase: TodoPhase | undefined;

	const lines = markdown.split(/\r?\n/);
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
		const line = lines[lineNumber];
		if (line === undefined) continue;
		const trimmed = line.trim();
		if (!trimmed) continue;

		const headingMatch = /^#{1,6}\s+(.+?)\s*$/.exec(trimmed);
		const heading = headingMatch?.[1];
		if (headingMatch && heading !== undefined) {
			currentPhase = { name: heading.trim(), tasks: [] };
			phases.push(currentPhase);
			continue;
		}

		const taskMatch = /^[-*+]\s*\[(.?)\]\s+(.+?)\s*$/.exec(trimmed);
		const marker = taskMatch?.[1];
		const content = taskMatch?.[2];
		if (taskMatch && marker !== undefined && content !== undefined) {
			if (!currentPhase) {
				currentPhase = { name: DEFAULT_INIT_PHASE, tasks: [] };
				phases.push(currentPhase);
			}
			const status = MARKER_TO_STATUS[marker];
			if (!status) {
				errors.push(`Line ${lineNumber + 1}: unknown status marker "[${marker}]" (use [ ], [x], [/], [-])`);
				continue;
			}
			currentPhase.tasks.push({ content: content.trim(), status });
			continue;
		}

		errors.push(`Line ${lineNumber + 1}: unrecognized syntax "${trimmed}"`);
	}

	normalizeInProgressTask(phases);
	return { phases, errors };
}
