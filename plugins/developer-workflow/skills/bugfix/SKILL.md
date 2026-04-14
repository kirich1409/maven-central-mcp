---
name: bugfix
description: >-
  Thin orchestrator for bug fix tasks — sequences modular skills: debug → implement → acceptance → PR.
  Invoke when the user reports a bug and wants it fixed end-to-end.
  Trigger on: "/bugfix", "fix this bug", "исправь баг", "почини", "это сломалось, почини",
  "fix and ship", "find and fix", "debug and fix".
  Do NOT use for: feature implementation (use implement-task), investigation without fix (use debug),
  quick obvious fix that doesn't need diagnosis (invoke implement directly).
---

# Bugfix — Bug Fix Orchestrator

Thin orchestrator that routes a bug through diagnosis, fix, verification, and PR.
Contains no implementation logic — each stage is a separate skill invocation.

---

## Phase 0: Setup

### 0.1 Worktree

Create an isolated worktree:
1. From the default branch, create a worktree in `.worktrees/<branch-name>`
2. Branch naming: `fix/short-description` — kebab-case
3. If already in a fitting worktree — stay

### 0.2 Understand the bug

Extract from the user's input:
- **Symptom** — what's broken
- **How to reproduce** (if known)
- **Expected vs actual behavior**
- **Source** — issue URL, error log, user description

Generate a slug: kebab-case, 2-4 words.

If the bug is trivially obvious (typo, missing null check, off-by-one) — skip to Phase 2
(Implement) directly. No need to run the full debug pipeline for a one-liner.

---

## Phase 1: Debug

Invoke `developer-workflow:debug` with the bug description and any reproduction info.

Wait for `swarm-report/<slug>-debug.md`.

Check the status:
- **Diagnosed** → proceed to Phase 2 with root cause and fix direction
- **Not Reproducible** → report to user, ask for more information. Stop.
- **Escalated** → report findings, stop. The bug needs user decision.

---

## Phase 2: Implement Fix

Invoke `developer-workflow:implement` with:
- Task: fix description based on debug findings
- Slug
- Path to `swarm-report/<slug>-debug.md`

Wait for `swarm-report/<slug>-implement.md` + `swarm-report/<slug>-quality.md`.

---

## Phase 3: Acceptance

Invoke `developer-workflow:acceptance` with:
- Spec source: `swarm-report/<slug>-debug.md` (reproduction steps = acceptance criteria)
- The running app
- Explicit instruction: verify the reproduction steps no longer trigger the bug

Wait for `swarm-report/<slug>-acceptance.md`.

**Route by result:**

| Result | Action |
|--------|--------|
| VERIFIED (bug gone) | Proceed to Phase 4 |
| FAILED — same bug reproduces | Back to Phase 2. If 2nd failure → back to Phase 1 (re-diagnose) |
| FAILED — new/different bug | Route each new bug: trivial → Phase 2, complex → Phase 1 |
| PARTIAL — bug gone but minor issues | Ask user: fix or ship as-is |

---

## Phase 4: PR

### 4.1 Create PR

Invoke `developer-workflow:create-pr`.

### 4.2 Drive to merge

Invoke `developer-workflow:pr-drive-to-merge`.

When it stops for human review — **this orchestrator also stops**.
Resume when the user says to continue.

---

## Backward Transitions

| From | To | Trigger | Max |
|------|----|---------|-----|
| Implement | Debug | Fix didn't address root cause (acceptance fails twice) | 1 |
| Acceptance | Implement | Bug still reproduces or new bugs found | 3 |
| PR review | Implement | Review feedback requires code changes | 2 |

Each backward transition:
1. Log reason in the current artifact
2. Re-read original bug report + all artifacts (re-anchor)
3. If max reached → escalate to user

---

## Stop Points

The orchestrator **stops and waits for the user** at:
- Bug not reproducible (need more info)
- Debug escalation (architectural issue, needs decision)
- Human PR review
- PARTIAL acceptance verdict
- Merge confirmation
