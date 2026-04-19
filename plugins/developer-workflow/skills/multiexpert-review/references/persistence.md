# Persistence — state file details

This document expands the "Persistence" section of `../SKILL.md`. The engine persists review state to a file so the workflow survives context compaction and can resume mid-cycle.

## State file path

Save to `./swarm-report/multiexpert-review-<slug>-state.md` (or `multiexpert-review-<YYYYMMDD-HHMM>-state.md` if no slug is known).

### Slug source (priority order)

1. Explicit caller args (`slug:` field)
2. Artifact frontmatter `slug:` field
3. Artifact filename without extension
4. Timestamp fallback

### Legacy read

If the slug-qualified file does not exist, try `./swarm-report/plan-review-state.md` (legacy from the pre-rename era). If found, copy content into the new slug-qualified name and continue on the new file. Do not delete the legacy file — that is the user's decision.

**Always write:** the new slug-qualified name.

## State file structure

```markdown
# Multi-Expert Review State
Source: {plan_mode | file:<path> | conversation}
Profile: {implementation-plan | test-plan | spec | ...}   # locked at cycle 1
Profile source: {caller_hint | frontmatter | path | signature | user_prompt}
Cycle: {1 | 2 | 3} of 3
Status: {detecting | reviewing | synthesizing | fixing | done}

## Artifact Summary
{goal, technologies, scope — extracted in Step 1}

## Selected Agents
- {agent1} (recommended)
- {agent2} (recommended)

## Reviews Completed
- [x] {agent1} — {severity counts: N critical, M major, K minor}
- [ ] {agent2} — pending

## Verdict History
### Cycle 1: {PASS | CONDITIONAL | FAIL | WARN}
- Blockers: {list}
- Improvements: {list}

### Cycle 2: ...
```

## Update discipline

- Update after each significant step (profile detected, agents selected, reviews collected, verdict synthesized, fix applied).
- Re-read before each action — skip completed steps. This is the compaction-resilience contract: any step marked done in the file must not be repeated.
