import * as fs from "node:fs";
import * as path from "node:path";

export interface WorkflowConfig {
	subagents: {
		maxParallelTasks: number;
		maxConcurrency: number;
		defaultAgentScope: "user" | "project" | "both";
	};
	pursue: {
		maxAttempts: number;
		attemptTimeoutSeconds: number;
		checkTimeoutSeconds: number;
	};
}

const defaults: WorkflowConfig = {
	subagents: { maxParallelTasks: 8, maxConcurrency: 4, defaultAgentScope: "user" },
	pursue: { maxAttempts: 3, attemptTimeoutSeconds: 900, checkTimeoutSeconds: 120 },
};

function numberValue(value: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, Math.trunc(value)));
}

function scopeValue(value: unknown, fallback: "user" | "project" | "both"): "user" | "project" | "both" {
	return value === "user" || value === "project" || value === "both" ? value : fallback;
}

export function loadWorkflowConfig(): WorkflowConfig {
	const configPath = path.resolve(import.meta.dirname, "..", "config.json");
	let raw: any = {};
	try {
		raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	} catch {
		return defaults;
	}
	return {
		subagents: {
			maxParallelTasks: numberValue(raw?.subagents?.maxParallelTasks, defaults.subagents.maxParallelTasks, 1, 32),
			maxConcurrency: numberValue(raw?.subagents?.maxConcurrency, defaults.subagents.maxConcurrency, 1, 16),
			defaultAgentScope: scopeValue(raw?.subagents?.defaultAgentScope, defaults.subagents.defaultAgentScope),
		},
		pursue: {
			maxAttempts: numberValue(raw?.pursue?.maxAttempts, defaults.pursue.maxAttempts, 1, 10),
			attemptTimeoutSeconds: numberValue(raw?.pursue?.attemptTimeoutSeconds, defaults.pursue.attemptTimeoutSeconds, 1),
			checkTimeoutSeconds: numberValue(raw?.pursue?.checkTimeoutSeconds, defaults.pursue.checkTimeoutSeconds, 1),
		},
	};
}
