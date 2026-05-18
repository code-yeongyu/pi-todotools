import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const SANEPI_SYSTEM_PREFIX = "[system:sanepi]";
export const SANEPI_CONVERSATION_EVENT = "sanepi:conversation";

export type TodoSystemMessageRoute = "todotools.continuation";
export type TodoConversationAction = "injected" | "failed";

export interface TodoConversationEvent {
	version: 1;
	source: "builtin";
	action: TodoConversationAction;
	route: TodoSystemMessageRoute;
	sessionId?: string;
	timestamp: number;
	conversation: {
		prefix: typeof SANEPI_SYSTEM_PREFIX;
		kind: "user_message";
		deliverAs?: "steer" | "followUp";
	};
	text: string;
	errorMessage?: string;
}

export interface TodoUserMessageOptions {
	sessionId?: string;
	deliverAs?: "steer" | "followUp";
}

function prefixText(text: string): string {
	return text.startsWith(SANEPI_SYSTEM_PREFIX) ? text : `${SANEPI_SYSTEM_PREFIX}\n${text}`;
}

function prefixContent(content: string | (TextContent | ImageContent)[]): string | (TextContent | ImageContent)[] {
	if (typeof content === "string") {
		return prefixText(content);
	}

	const firstTextIndex = content.findIndex((part) => part.type === "text");
	if (firstTextIndex === -1) {
		return [{ type: "text", text: SANEPI_SYSTEM_PREFIX }, ...content];
	}

	return content.map((part, index) => {
		if (part.type !== "text" || index !== firstTextIndex) {
			return part;
		}

		return {
			...part,
			text: prefixText(part.text),
		};
	});
}

function extractText(content: string | (TextContent | ImageContent)[]): string {
	if (typeof content === "string") {
		return content;
	}

	return content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function emitTodoConversationEvent(pi: ExtensionAPI, event: TodoConversationEvent): void {
	pi.events.emit(SANEPI_CONVERSATION_EVENT, event);
}

function createBaseEvent(args: {
	action: TodoConversationAction;
	route: TodoSystemMessageRoute;
	sessionId?: string;
	deliverAs?: "steer" | "followUp";
	text: string;
	errorMessage?: string;
}): TodoConversationEvent {
	const event: TodoConversationEvent = {
		version: 1,
		source: "builtin",
		action: args.action,
		route: args.route,
		timestamp: Date.now(),
		conversation: {
			prefix: SANEPI_SYSTEM_PREFIX,
			kind: "user_message",
		},
		text: args.text,
	};
	if (args.sessionId !== undefined) event.sessionId = args.sessionId;
	if (args.deliverAs !== undefined) event.conversation.deliverAs = args.deliverAs;
	if (args.errorMessage !== undefined) event.errorMessage = args.errorMessage;
	return event;
}

function hasUserMessageOptions(
	options: TodoUserMessageOptions | undefined,
): options is TodoUserMessageOptions & { deliverAs: "steer" | "followUp" } {
	return options?.deliverAs !== undefined;
}

export function sendTodoUserMessage(
	pi: ExtensionAPI,
	route: TodoSystemMessageRoute,
	content: string | (TextContent | ImageContent)[],
	options?: TodoUserMessageOptions,
): void {
	const prefixedContent = prefixContent(content);

	emitTodoConversationEvent(
		pi,
		createBaseEvent({
			action: "injected",
			route,
			text: extractText(prefixedContent),
			...(options?.sessionId === undefined ? {} : { sessionId: options.sessionId }),
			...(options?.deliverAs === undefined ? {} : { deliverAs: options.deliverAs }),
		}),
	);

	if (hasUserMessageOptions(options)) {
		pi.sendUserMessage(prefixedContent, { deliverAs: options.deliverAs });
		return;
	}

	pi.sendUserMessage(prefixedContent);
}

export function emitTodoSystemMessageFailure(
	pi: ExtensionAPI,
	args: {
		route: TodoSystemMessageRoute;
		sessionId?: string;
		content: string | (TextContent | ImageContent)[];
		deliverAs?: "steer" | "followUp";
		errorMessage: string;
	},
): void {
	const prefixedContent = prefixContent(args.content);

	emitTodoConversationEvent(
		pi,
		createBaseEvent({
			action: "failed",
			route: args.route,
			text: extractText(prefixedContent),
			errorMessage: args.errorMessage,
			...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
			...(args.deliverAs === undefined ? {} : { deliverAs: args.deliverAs }),
		}),
	);
}
