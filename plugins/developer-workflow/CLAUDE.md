# developer-workflow (core)

## Non-negotiables

Rules that are not open for discussion. Violating these is an error, not a judgment call.

- **Non-QA skills must not hardcode MCP tool names.** They must run (with reduced capability) when an MCP server is absent. Exception: QA-execution skills (`manual-tester`, live parts of `acceptance`, `bug-hunt`) that require real device/browser automation may fail fast with an install/enable message — graceful degradation is impossible there.
- **Tier-3 hard-dep escalation requires explicit user approval per change.** Proposing is allowed; editing `plugin.json` `dependencies` or `.mcp.json` without explicit go-ahead is not.
- **The author of a change that breaks tests fixes those tests in the same PR.** No `--skip-test-fix`, no "TODO fix later", no "merge red". `/check` is the gate. The only escape hatch is an explicit, justified test skip-marker plus a follow-up issue — treated as an exception, not a routine. Detailed disambiguation (intentional behaviour change vs unintentional break vs pre-existing failure) lives in [`docs/TESTING-STRATEGY.md`](docs/TESTING-STRATEGY.md#author-fixes-broken-tests-non-negotiable).

## Structure

```
skills/<name>/SKILL.md         # 12 on-demand skills, each a directory with YAML frontmatter
agents/manual-tester.md        # only agent in core (QA executor)
docs/TESTING-STRATEGY.md       # test types, framework detection, coverage audit, skip rules
```

## Plugin family

This plugin is part of a split family. Depending on the task, Claude Code will have access to agents from sibling plugins:

| Plugin | Contributes |
|---|---|
| `developer-workflow` (this) | 12 on-demand skills + `manual-tester` |
| `developer-workflow-experts` | `code-reviewer`, `architecture-expert`, `security-expert`, `performance-expert`, `ux-expert`, `build-engineer`, `devops-expert`, `business-analyst`, `debugging-expert` — required, auto-installed as a dependency |
| `developer-workflow-kotlin` | `kotlin-engineer`, `compose-developer`; skills `kmp-migration`, `migrate-to-compose`, `snapshot` — install for Kotlin/Android/KMP work |
| `developer-workflow-swift` | `swift-engineer`, `swiftui-developer` — install for Swift/iOS/macOS work |

Skills in this plugin delegate to engineer agents (kotlin-engineer / compose-developer / swift-engineer / swiftui-developer) by short name via the Task tool. Agent names are unique across the family, so short-name resolution works as long as the corresponding platform plugin is installed. If `write-tests` is invoked and the referenced engineer is not installed, the Task call will fail with a clear message — install the matching platform plugin and retry.

## Conventions

- Self-contained core: on-demand workflow skills only. No platform-specific engineers live here.
- **Dependency policy (three tiers):**
  1. **Built-in Claude Code features** (`/simplify`, Agent tool, Plan Mode, Bash, skills framework) — always allowed, used freely.
  2. **Sibling plugins in this family** (`developer-workflow-experts`, `-kotlin`, `-swift`) — declared normally via `dependencies` in plugin.json.
  3. **External plugins and MCP servers** — default is **soft-reference**: mention in README as recommended, detect-and-use in agent prompts, non-QA skills must still run (with reduced capability) when they are absent. Escalation to **hard dependency** (plugin.json `dependencies`) or **MCP server declaration** (.mcp.json) requires **explicit user approval per change** — propose first, wait, then edit.
  - **QA-execution exception:** `manual-tester` and the live-execution parts of `acceptance` / `bug-hunt` perform real device/browser automation through the `mobile` / `playwright` MCP servers. Those flows reference the MCP tool by name and may fail fast with an install/enable message when the capability is unavailable — graceful degradation is impossible when real automation is required. This is a documented exception, not a license for other skills to hardcode tool names.
- **MCP servers:** `mobile` MCP is pre-approved for testing and required for live mobile QA; `playwright` is documented as a recommended dependency for browser-based QA (see `developer-workflow/README.md`). Non-QA skills (research, multiexpert-review, documentation lookup, etc.) must NOT hardcode MCP tool names and must keep working without them — describe the task, not the tool.
- **External tools:** if a capability requires something the user may not have installed, describe what is needed (one short line in README's "Recommended" section) and let the user decide. For the QA-execution exception above, the skill may stop with a clear install/enable message instead of attempting to continue without the required MCP.
- Skills use YAML frontmatter: `name`, `description` (≤ 1024 chars), optionally `disable-model-invocation`.
- `code-reviewer` (in `developer-workflow-experts`) is read-only — no Edit, Write, NotebookEdit, or Bash tools.
- Workspace directories (`*-workspace/`) are runtime artifacts, not skills. Gitignored.
- Test coverage policy (single-phase, test types, framework detection, audit, skip rules, "author fixes broken tests") is documented in [`docs/TESTING-STRATEGY.md`](docs/TESTING-STRATEGY.md). `write-tests`, `generate-test-plan`, `finalize`, and `acceptance` read from there.

## Skills roster (12)

- Planning / research: `research`, `write-spec`, `reverse-spec`, `multiexpert-review`
- Implementation utility: `write-tests` (retroactive + regression mode), `check` (mechanical build + lint + typecheck + tests)
- Code-quality pass: `finalize` — multi-round review-and-fix loop (code-reviewer → /simplify → optional pr-review-toolkit trio → expert reviews). The `pr-review-toolkit` trio is a soft-reference: installed → Phase C runs; absent → Phase C is skipped with a log entry.
- QA: `generate-test-plan`, `acceptance`, `bug-hunt`
- PR: `create-pr`, `drive-to-merge`
