---
name: implement-task
description: >-
  Thin orchestrator for feature tasks — sequences modular skills through the full pipeline.
  Invoke when the user gives a feature task and wants it done end-to-end autonomously.
  Trigger on: "/implement-task", "implement this feature", "сделай эту фичу от начала до конца",
  "full cycle", "autonomous implementation".
  Do NOT use for: bug fixes (use bugfix), research-only (use research), single quick change
  (invoke implement directly).
---

# Implement Task — Feature Orchestrator

Thin orchestrator that routes a feature task through modular skills. Contains no implementation
logic — each stage is a separate skill invocation.

---

## Phase 0: Setup

### 0.1 Worktree

Create an isolated worktree for the task:
1. From the default branch, create a worktree in `.worktrees/<branch-name>`
2. Branch naming: `feature/short-description` — kebab-case
3. If already in a fitting worktree — stay

### 0.2 Understand the task

Extract from the user's input:
- **What** needs to change
- **Why** (context)
- **Done criteria**

Generate a slug: kebab-case, 2-4 words.

Ask **one clarifying question** if ambiguous. Otherwise proceed.

### 0.3 Profile check

If the task is trivial (single-file, obvious change) — skip to Phase 2 (Implement) directly.
If it's a bug — tell the user to use `/bugfix` instead.

---

## Phase 1: Research and Planning

### 1.1 Research

Invoke `developer-workflow:research` with the task description and constraints.
Wait for `swarm-report/<slug>-research.md`.

Skip if the task is well-understood and doesn't touch external APIs, unfamiliar libraries,
or architectural decisions.

### 1.2 Decompose (optional)

If the task is large enough to split into independent sub-tasks:
- Invoke `developer-workflow:decompose-feature` with the research artifact
- Wait for `swarm-report/<slug>-decomposition.md`

Skip for single-task features.

### 1.3 Plan review (optional)

If a plan or decomposition was produced:
- Invoke `developer-workflow:plan-review`
- If FAIL → back to 1.1 Research with the gaps identified
- If CONDITIONAL → proceed with noted concerns
- If PASS → proceed

---

## Phase 2: Implement and Verify (per task)

For each task (or the single task if no decomposition):

### 2.1 Implement

Invoke `developer-workflow:implement` with:
- Task description
- Slug
- Paths to available artifacts (`research.md`, `plan.md`, `decomposition.md`)

Wait for `swarm-report/<slug>-implement.md` + `swarm-report/<slug>-quality.md`.

### 2.2 Acceptance

Invoke `developer-workflow:acceptance` with:
- Spec source: requirements from the task / plan / decomposition
- The running app

Wait for `swarm-report/<slug>-acceptance.md`.

**Route by result:**
- VERIFIED → proceed to Phase 3
- FAILED (P0/P1) → back to 2.1 Implement with bug list. Max 3 round-trips.
- FAILED (unclear cause) → invoke `developer-workflow:debug` first, then 2.1
- PARTIAL (P2/P3) → ask user: fix now or ship as-is
- Out-of-scope bugs → create issues, don't block

---

## Phase 3: PR

### 3.1 Create PR

Invoke `developer-workflow:create-pr`.

**PR granularity** (when decomposed):
- Independent tasks → one PR per task (invoke create-pr after each task's acceptance)
- Tightly coupled tasks → bundled PR after all tasks pass acceptance

### 3.2 Drive to merge

Invoke `developer-workflow:pr-drive-to-merge`.

This skill handles CI monitoring, bot review polling, and review feedback.
When it stops for human review — **this orchestrator also stops**.

Resume when the user says to continue.

---

## Backward Transitions

| From | To | Trigger | Max |
|------|----|---------|-----|
| Plan review | Research | FAIL — knowledge gaps | 2 |
| Acceptance | Implement | FAILED bugs | 3 |
| Acceptance | Debug | P0/P1 with unclear cause | 1 |
| PR review | Implement | Significant code changes requested | 2 |

Each backward transition:
1. Log reason in the current artifact
2. Re-read original task + all artifacts (re-anchor)
3. If max reached → escalate to user

---

## Stop Points

The orchestrator **stops and waits for the user** at:
- Human PR review (via pr-drive-to-merge)
- PARTIAL acceptance verdict (user decides: fix or ship)
- Escalation (scope explosion, repeated failures, architectural decision needed)
- Merge confirmation
