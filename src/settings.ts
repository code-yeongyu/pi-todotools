import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord } from "./guards.js";

export interface TodoSettingsPair {
	globalSettings: Record<string, unknown>;
	projectSettings: Record<string, unknown>;
}

function readJsonObject(path: string): Record<string, unknown> {
	if (!existsSync(path)) {
		return {};
	}

	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function mergeSettings(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const current = merged[key];
		if (isRecord(current) && isRecord(value)) {
			merged[key] = mergeSettings(current, value);
			continue;
		}
		merged[key] = value;
	}
	return merged;
}

function unique(paths: string[]): string[] {
	return [...new Set(paths)];
}

function getGlobalSettingsPaths(): string[] {
	const paths: string[] = [];
	const piAgentDir = process.env["PI_CODING_AGENT_DIR"];
	const senpiAgentDir = process.env["SENPI_CODING_AGENT_DIR"];
	if (piAgentDir) paths.push(join(piAgentDir, "settings.json"));
	if (senpiAgentDir) paths.push(join(senpiAgentDir, "settings.json"));
	paths.push(join(homedir(), ".pi", "agent", "settings.json"));
	paths.push(join(homedir(), ".senpi", "agent", "settings.json"));
	return unique(paths);
}

function getProjectSettingsPaths(cwd: string): string[] {
	return [join(cwd, ".pi", "settings.json"), join(cwd, ".senpi", "settings.json")];
}

function readMergedSettings(paths: string[]): Record<string, unknown> {
	return paths.reduce<Record<string, unknown>>((settings, path) => mergeSettings(settings, readJsonObject(path)), {});
}

export function readTodoSettings(cwd: string): TodoSettingsPair {
	return {
		globalSettings: readMergedSettings(getGlobalSettingsPaths()),
		projectSettings: readMergedSettings(getProjectSettingsPaths(cwd)),
	};
}
