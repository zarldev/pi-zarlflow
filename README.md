# Zarlflow for Pi

Zarlflow adds a clean `/zarl` workflow surface to Pi: planning, subagents, verified execution, safer edits, and session handoff.

> Pi extensions execute inside the Pi process with your local user permissions. Review and trust packages before installing them.

## Install

From npm, once published:

```bash
pi install npm:@zarldev/pi-zarlflow
```

For local development from this repository:

```bash
git clone https://github.com/zarldev/pi-zarlflow.git
pi install ./pi-zarlflow
```

For one-off testing without writing settings:

```bash
pi -e ./pi-zarlflow
```

## Quickstart

```text
/zarl help
/zarl plan
/zarl pursue --check "npm test" fix the failing test
/zarl handoff continue with release prep
```

## Slash commands

All user-facing commands are namespaced under `/zarl`.

```text
/zarl help                              Show command help
/zarl doctor                            Check package/runtime health
/zarl config                            Show effective Zarlflow config
/zarl plan                              Toggle read-only planning mode
/zarl todos                             Show current plan progress
/zarl agents [user|project|both]        List available subagent profiles
/zarl agent <name> [user|project|both]  Show one subagent profile
/zarl pursue --check "cmd" <task>       Run verified completion attempts
/zarl pursue-go <module> [pkg] -- <task> Run verified completion with go test
/zarl handoff <goal>                    Prepare a fresh-session handoff prompt
```

## Model-callable tools

Zarlflow also exposes tools the model can use during normal Pi work:

- `subagent` — delegate to isolated child Pi runs using named agent profiles.
- `pursue` — retry an agent task until a verifier command succeeds.
- `hash_read` — read files as `LINE:HASH|text` rows for anchored edits.
- `hash_edit` — edit by line/hash anchors and fail with `STALE_ANCHOR` on stale reads.
- `program` — bounded JavaScript orchestration backed by Pi `codemode`.

## Typical workflows

### Plan first

```text
/zarl plan
```

Ask Pi to inspect the code and produce a numbered plan. Zarlflow disables built-in write tools while plan mode is active and tracks plan items when execution begins.

### Verify work with a real command

```text
/zarl pursue --check "npm test" fix the failing test
```

Zarlflow runs isolated Pi attempts, executes the verifier after each attempt, and feeds verifier failures into the next attempt until the check passes or the attempt budget is exhausted.

### Delegate investigation

```text
/zarl agents
/zarl agent researcher
```

Then ask Pi to use the `subagent` tool for one or more focused reviews.

### Handoff to a fresh session

```text
/zarl handoff implement phase two of the plan
```

Zarlflow summarizes the relevant session context into an editable prompt for a fresh Pi session.

## Agent profiles

Subagents are Markdown files under `~/.pi/agent/agents/*.md` or project-local `.pi/agents/*.md`.

```md
---
name: researcher
description: Read-only codebase investigation.
mode: explore
tools: read, grep, find, ls
model: openai-codex/gpt-5.5
---

Profile instructions go here.
```

Modes:

- `explore` — read-only tools.
- `verify` — read tools plus bounded shell checks.
- `implement` — normal inherited/default implementation access.

Project-local agents are opt-in via `agentScope: "project"` or `"both"`.

## Configuration

Edit `config.json` in the package directory:

```json
{
  "subagents": {
    "maxParallelTasks": 8,
    "maxConcurrency": 4,
    "defaultAgentScope": "user"
  },
  "pursue": {
    "maxAttempts": 3,
    "attemptTimeoutSeconds": 900,
    "checkTimeoutSeconds": 120
  }
}
```

## Development

```bash
npm run check
npm run pack:dry
```

The package intentionally keeps Pi host packages in `peerDependencies`; do not move them to runtime `dependencies`.

## Current limitations

- Subagents are child Pi processes, not first-class Pi core sessions.
- Work-mode enforcement is tool-list based.
- `program` is JavaScript/codemode-backed rather than Starlark-backed.
- `pursue` threads verifier feedback rather than full child transcripts.

## License

MIT
