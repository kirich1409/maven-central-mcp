# developer-workflow

## Structure

```
skills/<name>/SKILL.md    # Each skill is a directory with YAML frontmatter
agents/<name>.md          # Each agent is a single .md with YAML frontmatter
agents/references/        # Shared reference material used by agents
docs/WORKFLOW.md          # Full pipeline documentation with diagrams
```

## Conventions

- 100% self-contained — no dependencies on external plugins (superpowers, code-review, etc.)
- Skills use YAML frontmatter: `name`, `description` (required), optionally `disable-model-invocation`
- Agents use YAML frontmatter: `name`, `description`, `model`, `color`, `memory`, `tools`, optionally `maxTurns`, `disallowedTools`
- `code-reviewer` agent is read-only — no Edit, Write, NotebookEdit, or Bash tools
- Workspace directories (`*-workspace/`) are runtime artifacts, not skills
- Pipeline orchestration rules live at `~/.claude/rules/dev-workflow-orchestration.md` (user-global, not in this repo)
- Quality Loop gates are defined in orchestration rules, not in any skill

## Expert Agents

Seven expert agents (architecture, build, business-analyst, devops, performance, security, ux) are specialists invoked by skills during quality loop or research. They are not meant for direct user invocation.
