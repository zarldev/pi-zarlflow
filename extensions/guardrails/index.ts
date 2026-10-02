import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const protectedPathFragments = [
	".env",
	".env.",
	".git/",
	"/.git",
	"node_modules/",
	".pi/agent/auth.json",
	".pi/agent/mcp-auth.json",
];

const destructiveBashPatterns = [
	/\brm\s+(-[^\s]*[rf][^\s]*|-r|-f|--recursive|--force)/i,
	/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\b|rebase\b|checkout\s+--|restore\b|revert\b)/i,
	/\bsudo\b/i,
	/\bchmod\s+-R\b/i,
	/\bchown\s+-R\b/i,
	/\bkill(all)?\b/i,
	/\bshutdown\b|\breboot\b/i,
];

function candidatePath(input: Record<string, unknown>): string {
	return String(input.path ?? input.file_path ?? input.root ?? "");
}

function isProtected(p: string): boolean {
	const normalized = p.replaceAll("\\", "/");
	return protectedPathFragments.some((fragment) => normalized.includes(fragment));
}

export default function zarlGuardrails(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			const p = candidatePath(event.input as Record<string, unknown>);
			if (p && isProtected(p)) {
				ctx.ui.notify(`Blocked write to protected path: ${p}`, "warning");
				return { block: true, reason: `Path ${JSON.stringify(p)} is protected by zarl workflow guardrails.` };
			}
		}

		if (event.toolName === "bash") {
			const command = String((event.input as Record<string, unknown>).command ?? "");
			if (!command) return undefined;
			const risky = destructiveBashPatterns.some((pattern) => pattern.test(command));
			if (!risky) return undefined;
			if (!ctx.hasUI) {
				return { block: true, reason: `Risky shell command requires interactive approval: ${command}` };
			}
			const ok = await ctx.ui.confirm("Allow risky shell command?", command);
			if (!ok) return { block: true, reason: `Risky shell command was not approved: ${command}` };
		}
		return undefined;
	});
}
