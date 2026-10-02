import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadWorkflowConfig } from "../config.ts";
import { getZarlSubcommands } from "./registry.ts";

function helpText(): string {
	const commands = getZarlSubcommands();
	const rows = [
		"Zarlflow commands:",
		"",
		"/zarl help                 Show this help",
		"/zarl doctor               Check package/runtime health",
		"/zarl config               Show effective config",
	];
	for (const [name, command] of [...commands.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		rows.push(`${command.usage ?? `/zarl ${name}`.padEnd(27)} ${command.description}`);
	}
	return rows.join("\n");
}

function configText(): string {
	return JSON.stringify(loadWorkflowConfig(), null, 2);
}

export default function zarlflowCommand(pi: ExtensionAPI) {
	pi.registerCommand("zarl", {
		description: "Zarlflow workflow commands for Pi",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const [name = "help", ...rest] = trimmed.split(/\s+/);
			const subArgs = rest.join(" ");

			if (name === "help" || name === "") {
				ctx.ui.notify(helpText(), "info");
				return;
			}

			if (name === "config") {
				ctx.ui.notify(`Zarlflow config:\n${configText()}`, "info");
				return;
			}

			if (name === "doctor") {
				const commands = [...getZarlSubcommands().keys()].sort();
				ctx.ui.notify(
					[
						"Zarlflow doctor: OK",
						`cwd: ${ctx.cwd}`,
						`registered subcommands: ${commands.join(", ") || "none"}`,
						`config: ${configText()}`,
					].join("\n"),
					"info",
				);
				return;
			}

			const command = getZarlSubcommands().get(name);
			if (!command) {
				ctx.ui.notify(`Unknown /zarl command: ${name}\n\n${helpText()}`, "error");
				return;
			}
			await command.handler(subArgs, ctx);
		},
	});

	pi.on("before_agent_start", async () => ({
		guidelines: [
			"Zarlflow is available through `/zarl ...` commands for planning, subagents, verified execution, and handoff workflows.",
		],
	}));
}
