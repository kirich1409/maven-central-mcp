# developer-workflow

Lifecycle pipeline for the full developer workflow — from research through implementation to PR merge. Platform-neutral; pair with `developer-workflow-kotlin` or `developer-workflow-swift` for platform-specific engineering.

This plugin is the **core** of the `developer-workflow` family:

```
                 developer-workflow-experts
                 (9 review/consult agents)
                          ▲
                          │ depends on
                          │
                 developer-workflow (core)  ◀── you are here
                          ▲
                          │ depends on
                          │
        ┌─────────────────┴─────────────────┐
developer-workflow-kotlin          developer-workflow-swift
(kotlin-engineer, compose-         (swift-engineer,
 developer, migrations)             swiftui-developer)
```

Installing this plugin automatically pulls `developer-workflow-experts`. Installing `-kotlin` or `-swift` additionally pulls this plugin.

## Skills (14)

### Planning / research
| Skill | Purpose |
|---|---|
| `/research` | Parallel expert investigation (up to 5 agents) — codebase, web, docs, dependencies, architecture |
| `/decompose-feature` | Break an idea or PRD into a structured task list with dependencies, ACs, complexity |
| `/write-spec` | Specification-Driven Development — multi-round interview producing an exhaustive spec |
| `/plan-review` | Panel of LLM evaluators (PoLL) review of an implementation plan |

### Implementation
| Skill | Purpose |
|---|---|
| `/implement` | Master orchestrator — delegates to engineers, runs quality loop |
| `/debug` | Read-only root cause analysis (via `debugging-expert` from `-experts`) |
| `/write-tests` | Retroactive tests for existing code — delegates test generation to engineers |

### QA / testing
| Skill | Purpose |
|---|---|
| `/generate-test-plan` | Produce a prioritized test plan document (no execution) |
| `/acceptance` | Verify feature against spec on a running app (via `manual-tester` + mobile MCP) |
| `/bug-hunt` | Undirected exploratory QA / bug hunting on a running app |

### PR workflow
| Skill | Purpose |
|---|---|
| `/create-pr` | Create a draft or ready GitHub PR / GitLab MR with generated metadata |
| `/triage-feedback` | Analyze and prioritize review comments or pasted feedback; optional post-triage reply/resolve |

### Orchestrators
| Skill | Purpose |
|---|---|
| `/feature-flow` | End-to-end feature pipeline: research → decompose → plan-review → implement → acceptance → create-pr |
| `/bugfix-flow` | End-to-end bug fix: debug → implement → acceptance → create-pr |

## Agents (1)

| Agent | Source | Purpose |
|---|---|---|
| `manual-tester` | this plugin | Real-device QA via mobile/browser MCP (disallowed Edit/Write/NotebookEdit) |

Agents from sibling plugins invoked by skills in this plugin:
- From [`developer-workflow-experts`](../developer-workflow-experts/): `code-reviewer`, `architecture-expert`, `security-expert`, `performance-expert`, `ux-expert`, `build-engineer`, `devops-expert`, `business-analyst`, `debugging-expert`
- From [`developer-workflow-kotlin`](../developer-workflow-kotlin/): `kotlin-engineer`, `compose-developer`
- From [`developer-workflow-swift`](../developer-workflow-swift/): `swift-engineer`, `swiftui-developer`

Skills invoke these by short name. If a platform plugin is not installed and you invoke a skill that needs its engineer (e.g., `/implement` on Kotlin code without `developer-workflow-kotlin`), the Task tool will error with a clear missing-agent message — install the matching platform plugin and retry.

## Installation

```
/plugin marketplace add kirich1409/krozov-ai-tools
/plugin install developer-workflow@krozov-ai-tools
```

`developer-workflow-experts` installs automatically as a declared dependency. Add platform plugins as needed:

```
/plugin install developer-workflow-kotlin@krozov-ai-tools
/plugin install developer-workflow-swift@krozov-ai-tools
```

## Pipeline documentation

Full pipeline with diagrams and gate-level detail:
- [`docs/WORKFLOW.md`](docs/WORKFLOW.md)
- [`docs/ORCHESTRATORS.md`](docs/ORCHESTRATORS.md) — feature-flow and bugfix-flow state diagrams

Pipeline orchestration rules (re-anchoring, receipts, Quality Loop) live at `~/.claude/rules/dev-workflow-orchestration.md` — user-global, not shipped with this plugin.

## License

See the [root README](../../README.md) of the monorepo.
