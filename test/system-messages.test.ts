import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { SANEPI_CONVERSATION_EVENT, SANEPI_SYSTEM_PREFIX, sendTodoUserMessage } from "../src/system-messages.js";

function createMockPi(): ExtensionAPI {
	return {
		on: vi.fn(),
		registerTool: vi.fn(),
		registerCommand: vi.fn(),
		registerShortcut: vi.fn(),
		registerFlag: vi.fn(),
		getFlag: vi.fn(),
		registerMessageRenderer: vi.fn(),
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		setSessionName: vi.fn(),
		getSessionName: vi.fn(),
		setLabel: vi.fn(),
		exec: vi.fn(),
		getActiveTools: vi.fn(),
		getAllTools: vi.fn(),
		setActiveTools: vi.fn(),
		getCommands: vi.fn(),
		setModel: vi.fn(),
		getThinkingLevel: vi.fn(),
		setThinkingLevel: vi.fn(),
		registerProvider: vi.fn(),
		unregisterProvider: vi.fn(),
		events: {
			emit: vi.fn(),
			on: vi.fn(),
		},
	};
}

describe("todo system messages", () => {
	it("prefixes string user messages and emits conversation metadata", () => {
		const pi = createMockPi();

		sendTodoUserMessage(pi, "todotools.continuation", "continue", { sessionId: "session-1" });

		expect(pi.sendUserMessage).toHaveBeenCalledWith(`${SANEPI_SYSTEM_PREFIX}\ncontinue`);
		expect(pi.events.emit).toHaveBeenCalledWith(
			SANEPI_CONVERSATION_EVENT,
			expect.objectContaining({
				action: "injected",
				route: "todotools.continuation",
				sessionId: "session-1",
				text: `${SANEPI_SYSTEM_PREFIX}\ncontinue`,
			}),
		);
	});

	it("does not duplicate the system prefix", () => {
		const pi = createMockPi();

		sendTodoUserMessage(pi, "todotools.continuation", `${SANEPI_SYSTEM_PREFIX}\ncontinue`);

		expect(pi.sendUserMessage).toHaveBeenCalledWith(`${SANEPI_SYSTEM_PREFIX}\ncontinue`);
	});
});
