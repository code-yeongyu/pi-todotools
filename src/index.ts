import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TASK_MANAGEMENT_SECTION } from "./prompt.js";
import { getTodoWidgetLines } from "./rendering.js";
import { clonePhases, getLatestPhasesFromBranchEntries, type TodoPhase } from "./state.js";
import { registerTodoTool } from "./tools/todo.js";

function getLatestPhases(ctx: ExtensionContext): TodoPhase[] {
	return getLatestPhasesFromBranchEntries(ctx.sessionManager.getBranch());
}

export default function todotoolsExtension(pi: ExtensionAPI): void {
	let currentPhases: TodoPhase[] = [];

	const getCurrentPhases = (): TodoPhase[] => clonePhases(currentPhases);

	const setCurrentPhases = (phases: TodoPhase[]): void => {
		currentPhases = clonePhases(phases);
	};

	const syncWidget = (ctx: ExtensionContext): void => {
		ctx.ui.setWidget("todo-sidebar", getTodoWidgetLines(currentPhases));
	};

	const syncFromSession = (ctx: ExtensionContext): void => {
		currentPhases = getLatestPhases(ctx);
		syncWidget(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		syncFromSession(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		syncFromSession(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n${TASK_MANAGEMENT_SECTION}`,
		};
	});

	registerTodoTool(pi, { getCurrentPhases, setCurrentPhases, syncWidget });
}

export { markdownToPhases, phasesToMarkdown, resolveTodoMarkdownPath } from "./markdown.js";
export {
	appendItems,
	applyEntry,
	applyOpsToPhases,
	applyParams,
	getCompletionTransitions,
	getTaskTargets,
	initPhases,
	nextActionableTask,
	normalizeInProgressTask,
	removeTasks,
	resolvePhaseOrError,
	resolveTaskOrError,
} from "./operations.js";
export { TASK_MANAGEMENT_SECTION, TODO_TOOL_DESCRIPTION } from "./prompt.js";
export {
	formatSummary,
	getTodoMarker,
	getTodoResultLines,
	getTodoWidgetLines,
	isIncompleteTodo,
	isTerminalTodoStatus,
	sanitizeTodoText,
} from "./rendering.js";
export {
	type BranchEntry,
	clonePhases,
	cloneTask,
	DEFAULT_INIT_PHASE,
	findPhaseByName,
	findTaskByContent,
	getLatestPhasesFromBranchEntries,
	getLatestTodosFromBranchEntries,
	isTodoItem,
	isTodoItemArray,
	isTodoPhase,
	isTodoPhaseArray,
	type TaskHit,
	TODO_STATE_ENTRY_TYPE,
	type TodoCompletionTransition,
	type TodoItem,
	type TodoOpEntry,
	type TodoOperation,
	type TodoPhase,
	type TodoPhaseInput,
	type TodoStateEntry,
	type TodoStatus,
	type TodoToolDetails,
} from "./state.js";
export { phaseRomanNumeral, registerTodoTool, TODO_PARAMS_SCHEMA } from "./tools/todo.js";
