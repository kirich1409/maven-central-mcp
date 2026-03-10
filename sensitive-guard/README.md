# sensitive-guard

Claude Code plugin that prevents sensitive data (secrets, PII) from reaching AI servers by scanning files before they are read into the conversation.

## How it works

A PreToolUse hook intercepts `Read`, `Grep`, and `Bash` tool calls. Before the tool executes, it scans target files for:

- **Secrets** — API keys, tokens, passwords, private keys (via [gitleaks](https://github.com/gitleaks/gitleaks))
- **PII** — emails, SSNs, credit cards, IBANs (via built-in regex patterns)

If sensitive data is found, you choose per item: pass once, add to allowlist, or block the tool call entirely. If blocked, the data never enters the conversation and never reaches the API.

## Prerequisites

- **jq** (required) — JSON processing
- **gitleaks** (recommended) — secret detection. Install:
  - macOS: `brew install gitleaks`
  - Linux: [github.com/gitleaks/gitleaks/releases](https://github.com/gitleaks/gitleaks/releases)
  - Any OS: `go install github.com/gitleaks/gitleaks/v8@latest`

If gitleaks is not installed, the plugin runs with PII detection only.

## Installation

```bash
claude plugin add /path/to/sensitive-guard
```

## Configuration

Global config at `~/.claude/sensitive-guard.json`:

```json
{
  "tools": ["Read", "Grep", "Bash"],
  "pii": {
    "enabled": true,
    "disabled": [],
    "custom": []
  },
  "gitleaks": {
    "enabled": true,
    "configPath": null
  },
  "display": {
    "maxValuePreview": 12
  }
}
```

Project-level override at `.claude/sensitive-guard.json` merges on top of global config (arrays append, scalars replace).

### Disable specific PII patterns

```json
{ "pii": { "disabled": ["ipv4", "phone"] } }
```

### Add custom PII patterns

```json
{ "pii": { "custom": [{ "id": "employee_id", "regex": "EMP-[0-9]{6}", "description": "Employee ID" }] } }
```

## Allowlists

Two scopes:
- **Project**: `.claude/sensitive-guard-allowlist.json`
- **Global**: `~/.claude/sensitive-guard-allowlist.json`

When prompted about a finding, choose:
- `p` — pass once (one-time allow)
- `a` — add to project allowlist
- `g` — add to global allowlist
- `b` — block the tool call

Allowlists store SHA-256 hashes of values, never plaintext.

## Non-interactive mode

When stdin is not a TTY (CI, headless), all findings are blocked by default.
