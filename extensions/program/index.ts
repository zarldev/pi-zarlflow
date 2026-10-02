import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type ProgramParams = {
	script: string;
};

function renderOutcome(outcome: any): string {
	if (!outcome) return "program: nested codemode returned no result";
	const result = outcome.result ?? outcome;
	if (typeof result === "string") return result;
	if (Array.isArray(result.content)) {
		return result.content
			.map((part: any) => {
				if (part?.type === "text") return String(part.text ?? "");
				return JSON.stringify(part);
			})
			.join("\n");
	}
	if (typeof result.text === "string") return result.text;
	if (typeof result.output === "string") return result.output;
	return JSON.stringify(result, null, 2);
}

export default function programAlias(pi: ExtensionAPI) {
	pi.registerTool({
		name: "program",
		label: "Program",
		description: `Run bounded programmatic tool orchestration through Pi codemode.

Input is JavaScript source in \`script\` (not a markdown fence). It runs in Pi's QuickJS codemode sandbox: no Node APIs, filesystem, network, environment, imports, or timers. The script reaches the outside world only through guarded tool calls such as \`await tools.read({ path })\`, \`await tools.grep({ pattern })\`, \`await tools.hash_read({ path })\`, and \`await tools.hash_edit({ path, edits })\`.

Use this for batched reads/searches, local filtering, parallel independent tool calls with \`Promise.allSettled\`, and controlled hashline edit sequences. Nested calls go through Pi's normal validation, hooks, permissions, and guardrails. Prefer \`hash_read\`/\`hash_edit\` inside scripts for edits.

Useful globals: \`tools.<name>(args)\`, \`text(value)\`, \`console.log(...)\`, top-level \`return value\`, \`ALL_TOOLS\`, \`searchTools(query)\`, and \`describeTool(name)\`. Optional first line: \`// @options: {"timeout_ms": 60000, "max_output_tokens": 10000}\`.

This is a compatibility alias for zarl-style programmatic tooling; implementation delegates to Pi's built-in \`codemode\` tool.`,
		parameters: Type.Object({
			script: Type.String({ description: "Raw JavaScript source to run in the codemode sandbox." }),
		}),
		async execute(_toolCallId, params: ProgramParams, signal, onUpdate, ctx) {
			const outcome = await ctx.executeTool("codemode", { code: params.script }, { signal, onUpdate });
			const isError = Boolean((outcome as any)?.isError ?? (outcome as any)?.error);
			return {
				isError,
				content: [{ type: "text", text: renderOutcome(outcome) }],
				details: { delegated_to: "codemode" },
			};
		},
	});

	pi.on("before_agent_start", async () => ({
		guidelines: [
			"Use `program`/`codemode` to batch independent tool calls, chain tool calls, or filter large outputs locally. Prefer hashline editing (`hash_read`/`hash_edit`) inside programmatic scripts for file modifications.",
		],
	}));
}
