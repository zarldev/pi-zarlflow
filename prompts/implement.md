---
description: Scout, plan, then implement a scoped coding task using subagents when useful
argument-hint: "<task>"
---
Task: $ARGUMENTS

Workflow:
1. If the change is non-trivial, use subagent researcher for focused discovery.
2. Present a concise implementation plan and risks.
3. Implement the agreed/sensible minimal change directly. Prefer `hash_read` → `hash_edit` for file edits when available; if anchors are stale, re-read and retry with fresh anchors. Use `program`/`codemode` when batching reads/searches or applying controlled anchored edit sequences is simpler and safer than many separate tool calls.
4. Run focused verification.
5. Report changed files, checks, and residual risk.

Do not routine-check-in unless a material design/scope issue appears.
