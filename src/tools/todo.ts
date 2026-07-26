// Ported and adapted from oh-my-pi's todo tool (MIT License).
// Copyright (c) 2025 Mario Zechner
// Copyright (c) 2025-2026 Can Bölük
// https://github.com/can1357/oh-my-pi

import type { AgentToolResult, ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { applyParams, getCompletionTransitions } from "../operations.js";
import { TODO_TOOL_DESCRIPTION } from "../prompt.js";
import { formatSummary } from "../rendering.js";
import {
	clonePhases,
	TODO_STATE_ENTRY_TYPE,
	type TodoPhase,
	type TodoStateEntry,
	type TodoToolDetails,
} from "../state.js";
import { renderTodoCall, renderTodoResult } from "./render.js";

const TodoOperationSchema = Type.Union([
	Type.Literal("init"),
	Type.Literal("start"),
	Type.Literal("done"),
	Type.Literal("rm"),
	Type.Literal("drop"),
	Type.Literal("append"),
	Type.Literal("view"),
]);

const TodoPhaseInputSchema = Type.Object({
	phase: Type.String({ description: "Phase name" }),
	items: Type.Array(Type.String({ description: "Task content" }), {
		description: "Tasks for this phase",
		minItems: 1,
	}),
});

export const TODO_PARAMS_SCHEMA = Type.Object({
	op: TodoOperationSchema,
	list: Type.Optional(Type.Array(TodoPhaseInputSchema, { description: "Phased task list for init" })),
	task: Type.Optional(Type.String({ description: "Task content" })),
	phase: Type.Optional(Type.String({ description: "Phase name" })),
	// Keep this unconstrained at the schema boundary. init and append return
	// operation-specific errors, while unrelated operations may ignore it.
	items: Type.Optional(Type.Array(Type.String({ description: "Task content" }), { description: "Tasks to append" })),
});

type TodoAccessors = {
	getCurrentPhases: () => TodoPhase[];
	setCurrentPhases: (phases: TodoPhase[]) => void;
	syncWidget: (ctx: ExtensionContext) => void;
};

type TodoToolResult = AgentToolResult<TodoToolDetails> & {
	isError?: boolean;
};

export { phaseRomanNumeral } from "./render.js";

export function registerTodoTool(pi: ExtensionAPI, accessors: TodoAccessors): void {
	const tool: ToolDefinition<typeof TODO_PARAMS_SCHEMA, TodoToolDetails, unknown> = {
		name: "todo",
		label: "Todo",
		description: TODO_TOOL_DESCRIPTION,
		promptSnippet: "Track phased tasks with one op-based todo tool; reference tasks by their exact content.",
		promptGuidelines: [
			"Use one todo operation at a time; batch it with the real work rather than making a solo todo turn.",
			"Reference tasks and phases by their exact content/name; use view when the text is uncertain.",
			"Mark work done immediately and use drop for tasks that are no longer needed.",
		],
		parameters: TODO_PARAMS_SCHEMA,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<TodoToolResult> {
			const previousPhases = clonePhases(accessors.getCurrentPhases());
			const readOnly = params.op === "view";
			const errors: string[] = [];
			const applied = readOnly
				? { phases: previousPhases, errors }
				: applyParams(clonePhases(previousPhases), params);
			const failed = applied.errors.length > 0;
			const effective = failed ? previousPhases : applied.phases;
			const completedTasks = readOnly || failed ? [] : getCompletionTransitions(previousPhases, applied.phases);
			if (!readOnly && !failed) {
				pi.appendEntry(TODO_STATE_ENTRY_TYPE, {
					schema: "v2",
					phases: clonePhases(applied.phases),
				} satisfies TodoStateEntry);
				accessors.setCurrentPhases(clonePhases(applied.phases));
				accessors.syncWidget(ctx);
			}

			const details: TodoToolDetails = {
				op: params.op,
				phases: clonePhases(effective),
				storage: ctx.sessionManager.getSessionFile() ? "session" : "memory",
			};
			if (completedTasks.length > 0) details.completedTasks = completedTasks;

			return {
				content: [{ type: "text", text: formatSummary(effective, applied.errors, readOnly) }],
				details,
				...(failed ? { isError: true } : {}),
			};
		},
		renderCall(args, theme) {
			return renderTodoCall(args, theme);
		},
		renderResult(result, options, theme, context) {
			return renderTodoResult(result, options, theme, context.args, isTodoToolError(result) || context.isError);
		},
	};

	pi.registerTool(tool);
}

function isTodoToolError(result: AgentToolResult<TodoToolDetails>): result is TodoToolResult {
	return "isError" in result && result.isError === true;
}
