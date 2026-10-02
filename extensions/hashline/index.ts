import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Line = { start: number; end: number; content: string; raw: string };
type Edit = {
	start_line: number;
	start_hash: string;
	end_line?: number;
	end_hash?: string;
	new_string?: string;
	mode?: "replace" | "delete" | "insert_before" | "insert_after";
};

const HASH_LEN = 4;
const MAX_EDITS = 64;

function lineHash(content: string, len = HASH_LEN): string {
	return createHash("sha256").update(content).digest("base64").slice(0, len);
}

function splitLines(body: string): Line[] {
	const matches = body.match(/.*(?:\r?\n|$)/g) ?? [];
	const rawLines = matches.length > 0 && matches[matches.length - 1] === "" ? matches.slice(0, -1) : matches;
	let pos = 0;
	return rawLines.map((raw) => {
		const start = pos;
		pos += raw.length;
		let content = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
		if (content.endsWith("\r")) content = content.slice(0, -1);
		return { start, end: pos, content, raw };
	});
}

function resolveWorkspacePath(cwd: string, requested: string): string {
	const abs = path.resolve(cwd, requested.replace(/^~(?=\/)/, process.env.HOME ?? ""));
	const root = path.resolve(cwd);
	if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`path escapes workspace: ${requested}`);
	return abs;
}

function staleWindow(lines: Line[], lineNo: number, hashLen: number): string {
	const center = Math.max(0, Math.min(lines.length - 1, lineNo - 1));
	const start = Math.max(0, center - 3);
	const end = Math.min(lines.length, center + 4);
	const rows = lines.slice(start, end).map((line, idx) => {
		const n = start + idx + 1;
		return `${n}:${lineHash(line.content, hashLen)}|${line.content}`;
	});
	return `current anchors near requested line:\n${rows.join("\n")}`;
}

function verifyAnchor(pathLabel: string, lines: Line[], lineNo: number, hash: string, label: string): Line {
	if (!/^[-+/A-Za-z0-9]{3,4}$/.test(hash)) throw new Error(`${label}_hash must be a 3/4 character base64 SHA-256 prefix`);
	if (lineNo >= 1 && lineNo <= lines.length && lineHash(lines[lineNo - 1].content, hash.length) === hash) {
		return lines[lineNo - 1];
	}
	const matches = lines.map((line, idx) => ({ line, idx })).filter(({ line }) => lineHash(line.content, hash.length) === hash);
	if (matches.length === 1) return matches[0].line;
	throw new Error(
		`STALE_ANCHOR: ${pathLabel}: ${label}_line ${lineNo} no longer matches hash ${hash}. Re-read and retry with fresh anchors.\n${staleWindow(lines, lineNo, hash.length)}`,
	);
}

function applyEdits(body: string, edits: Edit[], pathLabel: string): { body: string; summary: string } {
	if (edits.length === 0) throw new Error("at least one edit is required");
	if (edits.length > MAX_EDITS) throw new Error(`too many edits; max ${MAX_EDITS}`);
	const lines = splitLines(body);
	const resolved = edits.map((edit, index) => {
		const mode = edit.mode ?? "replace";
		const start = verifyAnchor(pathLabel, lines, edit.start_line, edit.start_hash, "start");
		const endLine = edit.end_line ?? edit.start_line;
		const endHash = edit.end_hash ?? edit.start_hash;
		const end = verifyAnchor(pathLabel, lines, endLine, endHash, "end");
		let spliceStart = start.start;
		let spliceEnd = end.end;
		let replacement = edit.new_string ?? "";
		if (mode === "delete") replacement = "";
		if (mode === "insert_before") spliceEnd = spliceStart;
		if (mode === "insert_after") spliceStart = spliceEnd;
		if (spliceStart > spliceEnd) throw new Error(`edit ${index}: start must be before end`);
		return { index, mode, spliceStart, spliceEnd, replacement };
	});
	resolved.sort((a, b) => a.spliceStart - b.spliceStart || a.spliceEnd - b.spliceEnd);
	for (let i = 1; i < resolved.length; i++) {
		if (resolved[i].spliceStart < resolved[i - 1].spliceEnd) throw new Error(`edit ${resolved[i].index}: overlaps previous edit`);
	}
	let out = "";
	let cursor = 0;
	for (const edit of resolved) {
		out += body.slice(cursor, edit.spliceStart) + edit.replacement;
		cursor = edit.spliceEnd;
	}
	out += body.slice(cursor);
	return { body: out, summary: `${resolved.length} hashline edit${resolved.length === 1 ? "" : "s"}` };
}

function anchorWindow(body: string, edits: Edit[]): string {
	const lines = splitLines(body);
	const wanted = new Set<number>();
	for (const edit of edits) {
		for (let n = Math.max(1, edit.start_line - 3); n <= Math.min(lines.length, edit.start_line + 3); n++) wanted.add(n);
	}
	return Array.from(wanted)
		.sort((a, b) => a - b)
		.slice(0, 80)
		.map((n) => `${n}:${lineHash(lines[n - 1].content)}|${lines[n - 1].content}`)
		.join("\n");
}

export default function hashlineTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "hash_read",
		label: "Hash Read",
		description: "Read a file as LINE:HASH|text rows for reliable hashline anchored edits. Use before hash_edit.",
		parameters: Type.Object({
			path: Type.String({ description: "Path inside the current workspace." }),
			offset: Type.Optional(Type.Number({ description: "Zero-based line offset." })),
			limit: Type.Optional(Type.Number({ description: "Maximum lines. Default 2000." })),
			hash_len: Type.Optional(Type.Number({ description: "Hash prefix length, 3 or 4. Default 4." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const abs = resolveWorkspacePath(ctx.cwd, params.path);
			const body = await fs.readFile(abs, "utf-8");
			const lines = splitLines(body);
			const offset = Math.max(0, Math.trunc(params.offset ?? 0));
			const limit = Math.max(1, Math.trunc(params.limit ?? 2000));
			const hashLen = params.hash_len === 3 ? 3 : 4;
			const rows = lines.slice(offset, offset + limit).map((line, i) => `${offset + i + 1}:${lineHash(line.content, hashLen)}|${line.content}`);
			if (offset + limit < lines.length) rows.push(`... truncated at line ${offset + limit} of ${lines.length}; continue with offset=${offset + limit}`);
			return { content: [{ type: "text", text: rows.join("\n") }], details: { path: params.path, lines: lines.length } };
		},
	});

	pi.registerTool({
		name: "hash_edit",
		label: "Hash Edit",
		description: "Atomically edit a workspace file with line/hash anchors from hash_read. Fails with STALE_ANCHOR when the file changed; re-read and retry.",
		parameters: Type.Object({
			path: Type.String({ description: "Path inside the current workspace." }),
			edits: Type.Array(
				Type.Object({
					start_line: Type.Number(),
					start_hash: Type.String(),
					end_line: Type.Optional(Type.Number()),
					end_hash: Type.Optional(Type.String()),
					new_string: Type.Optional(Type.String()),
					mode: Type.Optional(Type.Union([Type.Literal("replace"), Type.Literal("delete"), Type.Literal("insert_before"), Type.Literal("insert_after")])),
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const abs = resolveWorkspacePath(ctx.cwd, params.path);
			const before = await fs.readFile(abs, "utf-8");
			const { body, summary } = applyEdits(before, params.edits, params.path);
			await fs.writeFile(abs, body, "utf-8");
			const anchors = anchorWindow(body, params.edits);
			return { content: [{ type: "text", text: `edited ${params.path} (${summary}, anchors verified)\n\nfresh anchors:\n${anchors}` }], details: { path: params.path, edits: params.edits.length } };
		},
	});

	pi.on("before_agent_start", async () => ({
		guidelines: [
			"For file edits, prefer hash_read followed by hash_edit over exact-string edit when available. Hashline anchors reduce stale writes; after STALE_ANCHOR, re-read and retry with fresh anchors.",
		],
	}));
}
