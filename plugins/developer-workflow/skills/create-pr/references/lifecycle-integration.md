# Lifecycle integration

Background on how this skill fits into the wider orchestrator pipelines. Informational — execution semantics live in SKILL.md.

## Pipeline milestones

Orchestrators (`feature-flow`, `bugfix-flow`) invoke `create-pr` at these milestones:

```
implement first pass → push → /create-pr --draft
finalize (runs after implement, before acceptance — multi-round code-quality loop)
acceptance
all local checks PASS → /create-pr --promote
```

## Current wiring

Both orchestrators call:

- `/create-pr --draft` after `implement`
- `/create-pr --promote` after `acceptance` passes

Mid-flow `--refresh` calls (e.g., after each finalize round, after fix loops) are not currently wired in. The user or orchestrator can invoke `/create-pr --refresh` manually when the PR body should reflect intermediate progress.

## Responsibility split

- The **orchestrator** owns deciding *when* to invoke this skill.
- This **skill** owns *how* the PR lifecycle action executes.
