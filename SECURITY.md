# Security Policy

Pi extensions run inside the Pi process with the permissions of the local user. This package can inspect prompts, files, tool calls, and session state depending on which extension is active.

## Supported versions

Security fixes are provided for the latest released minor version.

## Reporting a vulnerability

Please report security issues privately to `steve@zarl.dev` rather than opening a public issue.

Include:

- Affected version or commit.
- Reproduction steps.
- Impact assessment.
- Any suggested mitigation.

## Security expectations

- Do not install this package from untrusted forks.
- Review project-local agents before allowing `agentScope: "project"` or `"both"`.
- Review verifier commands passed to `pursue`; they execute in a shell.
- Review child Pi work carefully when granting broad tool access.
