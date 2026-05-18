import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTodoSettings } from "../src/settings.js";

const ORIGINAL_PI_CODING_AGENT_DIR = process.env["PI_CODING_AGENT_DIR"];
const ORIGINAL_SENPI_CODING_AGENT_DIR = process.env["SENPI_CODING_AGENT_DIR"];

function createTemporaryDirectory(): string {
	return mkdtempSync(join(tmpdir(), "pi-todotools-"));
}

describe("todo settings", () => {
	afterEach(() => {
		if (ORIGINAL_PI_CODING_AGENT_DIR === undefined) {
			delete process.env["PI_CODING_AGENT_DIR"];
		} else {
			process.env["PI_CODING_AGENT_DIR"] = ORIGINAL_PI_CODING_AGENT_DIR;
		}
		if (ORIGINAL_SENPI_CODING_AGENT_DIR === undefined) {
			delete process.env["SENPI_CODING_AGENT_DIR"];
		} else {
			process.env["SENPI_CODING_AGENT_DIR"] = ORIGINAL_SENPI_CODING_AGENT_DIR;
		}
	});

	it("reads global and project settings with later files taking precedence", () => {
		const root = createTemporaryDirectory();
		try {
			const piAgentDirectory = join(root, "pi-agent");
			const senpiAgentDirectory = join(root, "senpi-agent");
			const cwd = join(root, "project");
			mkdirSync(piAgentDirectory, { recursive: true });
			mkdirSync(senpiAgentDirectory, { recursive: true });
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			mkdirSync(join(cwd, ".senpi"), { recursive: true });
			process.env["PI_CODING_AGENT_DIR"] = piAgentDirectory;
			process.env["SENPI_CODING_AGENT_DIR"] = senpiAgentDirectory;

			writeFileSync(
				join(piAgentDirectory, "settings.json"),
				JSON.stringify({ todotools: { continuation: { enabled: false } } }),
			);
			writeFileSync(
				join(senpiAgentDirectory, "settings.json"),
				JSON.stringify({ todotools: { continuation: { limit: 3 } } }),
			);
			writeFileSync(
				join(cwd, ".pi", "settings.json"),
				JSON.stringify({ todotools: { continuation: { enabled: false } } }),
			);
			writeFileSync(
				join(cwd, ".senpi", "settings.json"),
				JSON.stringify({ todotools: { continuation: { enabled: true } } }),
			);

			const settings = readTodoSettings(cwd);

			expect(settings.globalSettings).toMatchObject({
				todotools: { continuation: { enabled: false, limit: 3 } },
			});
			expect(settings.projectSettings).toEqual({ todotools: { continuation: { enabled: true } } });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("ignores malformed JSON settings files", () => {
		const root = createTemporaryDirectory();
		try {
			const cwd = join(root, "project");
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			mkdirSync(join(cwd, ".senpi"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "settings.json"), "{");
			writeFileSync(
				join(cwd, ".senpi", "settings.json"),
				JSON.stringify({ todotools: { continuation: { enabled: true } } }),
			);

			expect(readTodoSettings(cwd).projectSettings).toEqual({ todotools: { continuation: { enabled: true } } });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
