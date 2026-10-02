import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadWorkflowConfig } from "../config.ts";
import { registerZarlSubcommand } from "../zarl/registry.ts";

interface AttemptRecord {
	attempt: number;
	prompt: string;
	assistantOutput: string;
	checkCommand: string;
	checkExitCode: number | null;
	checkOutput: string;
	verified: boolean;
}

interface RunResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

function piInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(execName)) return { command: process.execPath, args };
	return { command: "pi", args };
}

function runProcess(
	command: string,
	args: string[],
	options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
): Promise<RunResult> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, { cwd: options.cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		const finish = (exitCode: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ exitCode, stdout, stderr, timedOut });
		};
		const kill = () => {
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, 3000).unref?.();
		};
		const timer = setTimeout(() => {
			timedOut = true;
			kill();
		}, options.timeoutMs);
		proc.stdout.on("data", (data) => (stdout += data.toString()));
		proc.stderr.on("data", (data) => (stderr += data.toString()));
		proc.on("close", (code) => finish(code));
		proc.on("error", () => finish(1));
		if (options.signal) {
			if (options.signal.aborted) kill();
			else options.signal.addEventListener("abort", kill, { once: true });
		}
	});
}

async function runPiAttempt(params: {
	cwd: string;
	prompt: string;
	model?: string;
	thinking?: string;
	timeoutMs: number;
	signal?: AbortSignal;
}): Promise<RunResult> {
	const args = ["--print", "--no-session"];
	if (params.model) args.push("--model", params.model);
	if (params.thinking) args.push("--thinking", params.thinking);
	args.push(params.prompt);
	const invocation = piInvocation(args);
	return runProcess(invocation.command, invocation.args, {
		cwd: params.cwd,
		timeoutMs: params.timeoutMs,
		signal: params.signal,
	});
}

async function runCheck(cwd: string, command: string, timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
	return runProcess("bash", ["-lc", command], { cwd, timeoutMs, signal });
}

function checkText(result: RunResult): string {
	const chunks = [];
	if (result.stdout.trim()) chunks.push(result.stdout.trim());
	if (result.stderr.trim()) chunks.push(result.stderr.trim());
	if (result.timedOut) chunks.push("[check timed out]");
	return chunks.join("\n");
}

function retryPrompt(originalTask: string, previous: AttemptRecord): string {
	return `Continue the same task. Do not restart from scratch; inspect the current workspace state and fix the remaining verification failure.

Original task:
${originalTask}

Previous assistant output:
${previous.assistantOutput || "(no assistant output captured)"}

Verification command:
${previous.checkCommand}

Verification output:
${previous.checkOutput || `(exit ${previous.checkExitCode})`}

Resolve the failure, then stop when the task is ready for verification.`;
}

async function drivePursue(params: {
	cwd: string;
	task: string;
	check: string;
	attempts: number;
	attemptTimeoutMs: number;
	checkTimeoutMs: number;
	model?: string;
	thinking?: string;
	signal?: AbortSignal;
	onAttempt?: (record: AttemptRecord) => void;
}): Promise<AttemptRecord[]> {
	const records: AttemptRecord[] = [];
	let prompt = params.task;
	for (let attempt = 1; attempt <= params.attempts; attempt++) {
		const agent = await runPiAttempt({
			cwd: params.cwd,
			prompt,
			model: params.model,
			thinking: params.thinking,
			timeoutMs: params.attemptTimeoutMs,
			signal: params.signal,
		});
		const check = await runCheck(params.cwd, params.check, params.checkTimeoutMs, params.signal);
		const record: AttemptRecord = {
			attempt,
			prompt,
			assistantOutput: [agent.stdout.trim(), agent.stderr.trim()].filter(Boolean).join("\n"),
			checkCommand: params.check,
			checkExitCode: check.exitCode,
			checkOutput: checkText(check),
			verified: check.exitCode === 0 && !check.timedOut,
		};
		records.push(record);
		params.onAttempt?.(record);
		if (record.verified || params.signal?.aborted) break;
		prompt = retryPrompt(params.task, record);
	}
	return records;
}

function summarize(records: AttemptRecord[]): string {
	const last = records[records.length - 1];
	if (!last) return "No pursue attempts ran.";
	const lines = records.map((r) =>
		`Attempt ${r.attempt}: ${r.verified ? "verified" : `check failed${r.checkExitCode === null ? "" : ` (exit ${r.checkExitCode})`}`}`,
	);
	if (last.verified) return `Verified after ${last.attempt} attempt${last.attempt === 1 ? "" : "s"}.\n\n${lines.join("\n")}`;
	return `Gave up after ${records.length} attempt${records.length === 1 ? "" : "s"}; verification still fails.\n\n${lines.join("\n")}\n\nLast verification output:\n${last.checkOutput}`;
}

function parseCommand(raw: string): { task: string; check: string; attempts?: number } | undefined {
	const tokens = raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
	let check = "";
	let attempts: number | undefined;
	const taskParts: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "--check" && i + 1 < tokens.length) {
			check = tokens[++i].replace(/^(['"])(.*)\1$/s, "$2");
			continue;
		}
		if (token === "--attempts" && i + 1 < tokens.length) {
			attempts = Number(tokens[++i].replace(/^(['"])(.*)\1$/s, "$2"));
			continue;
		}
		taskParts.push(token.replace(/^(['"])(.*)\1$/s, "$2"));
	}
	const task = taskParts.join(" ").trim();
	if (!task || !check) return undefined;
	return { task, check, attempts: Number.isFinite(attempts) ? attempts : undefined };
}

export default function zarlPursue(pi: ExtensionAPI) {
	pi.registerTool({
		name: "pursue",
		label: "Pursue",
		description:
			"Run a task in isolated Pi attempts until a real verifier command succeeds or the attempt budget is exhausted. Use when success must be checked by tests, builds, scripts, or other world-state commands.",
		parameters: Type.Object({
			task: Type.String({ description: "Task to pursue." }),
			check: Type.String({ description: "Shell command that verifies success. Exit 0 means done." }),
			attempts: Type.Optional(Type.Number({ description: "Maximum attempts. Default 3." })),
			cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to current Pi cwd." })),
			attemptTimeoutSeconds: Type.Optional(Type.Number({ description: "Per-attempt timeout. Default 900." })),
			checkTimeoutSeconds: Type.Optional(Type.Number({ description: "Verifier timeout. Default 120." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const config = loadWorkflowConfig();
			const attempts = Math.max(1, Math.min(10, Math.trunc(params.attempts ?? config.pursue.maxAttempts)));
			const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			const liveRecords: AttemptRecord[] = [];
			const records = await drivePursue({
				cwd: params.cwd ?? ctx.cwd,
				task: params.task,
				check: params.check,
				attempts,
				attemptTimeoutMs: Math.max(1, params.attemptTimeoutSeconds ?? config.pursue.attemptTimeoutSeconds) * 1000,
				checkTimeoutMs: Math.max(1, params.checkTimeoutSeconds ?? config.pursue.checkTimeoutSeconds) * 1000,
				model,
				thinking: ctx.thinkingLevel,
				signal,
				onAttempt: (record) => {
					liveRecords.push(record);
					onUpdate?.({
						content: [{ type: "text", text: `Attempt ${record.attempt}/${attempts}: ${record.verified ? "verified" : "check failed"}` }],
						details: { records: liveRecords },
					});
				},
			});
			const last = records[records.length - 1];
			return { content: [{ type: "text", text: summarize(records) }], details: { records }, isError: !last?.verified };
		},
	});

	registerZarlSubcommand("pursue", {
		description: "Run verified completion attempts",
		usage: "/zarl pursue --check \"cmd\" <task>".padEnd(27),
		handler: async (args, ctx) => {
			const parsed = parseCommand(args.trim());
			if (!parsed) {
				ctx.ui.notify('Usage: /zarl pursue [--check "verification command"] [--attempts N] <task>', "error");
				return;
			}
			const config = loadWorkflowConfig();
			const attempts = Math.max(1, Math.min(10, Math.trunc(parsed.attempts ?? config.pursue.maxAttempts)));
			ctx.ui.notify(`Pursue started (${attempts} attempts max): ${parsed.check}`, "info");
			const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			const records = await drivePursue({
				cwd: ctx.cwd,
				task: parsed.task,
				check: parsed.check,
				attempts,
				attemptTimeoutMs: config.pursue.attemptTimeoutSeconds * 1000,
				checkTimeoutMs: config.pursue.checkTimeoutSeconds * 1000,
				model,
				thinking: ctx.thinkingLevel,
				onAttempt: (record) => ctx.ui.notify(`Attempt ${record.attempt}: ${record.verified ? "verified" : "check failed"}`, record.verified ? "info" : "warning"),
			});
			ctx.ui.setEditorText(summarize(records));
		},
	});

	registerZarlSubcommand("pursue-go", {
		description: "Run verified completion with a Go test verifier",
		usage: "/zarl pursue-go <module> [pkg] -- <task>".padEnd(27),
		handler: async (args, ctx) => {
			const [left, ...taskParts] = args.split(/\s+--\s+/);
			const [module, pkg = "./..."] = left.trim().split(/\s+/);
			const task = taskParts.join(" -- ").trim();
			if (!module || !task) {
				ctx.ui.notify('Usage: /zarl pursue-go <module> [package] -- <task>', "error");
				return;
			}
			const config = loadWorkflowConfig();
			const check = `go test -C ${module} ${pkg}`;
			ctx.ui.notify(`Pursue started (${config.pursue.maxAttempts} attempts max): ${check}`, "info");
			const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			const records = await drivePursue({
				cwd: ctx.cwd,
				task,
				check,
				attempts: config.pursue.maxAttempts,
				attemptTimeoutMs: config.pursue.attemptTimeoutSeconds * 1000,
				checkTimeoutMs: config.pursue.checkTimeoutSeconds * 1000,
				model,
				thinking: ctx.thinkingLevel,
				onAttempt: (record) => ctx.ui.notify(`Attempt ${record.attempt}: ${record.verified ? "verified" : "check failed"}`, record.verified ? "info" : "warning"),
			});
			ctx.ui.setEditorText(summarize(records));
		},
	});
}
