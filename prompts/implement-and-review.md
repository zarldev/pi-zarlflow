---
description: Implement a task, then delegate independent review and verification
argument-hint: "<task>"
---
Task: $ARGUMENTS

Complete the task end-to-end. For non-trivial work:
1. Use researcher for focused discovery when needed.
2. Implement the smallest correct change. Prefer `hash_read` → `hash_edit` for file edits when available; if anchors are stale, re-read and retry with fresh anchors. Use `program`/`codemode` when batching reads/searches or applying controlled anchored edit sequences is simpler and safer than many separate tool calls.
3. Run focused tests/checks.
4. Use reviewer to independently review the resulting diff.
5. Use tester if behavior needs separate reproduction/verification.
6. Fix confirmed issues, rerun relevant checks, and report final status.
