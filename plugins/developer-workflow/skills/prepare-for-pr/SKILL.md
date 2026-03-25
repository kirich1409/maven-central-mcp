---
name: prepare-for-pr
description: Use when implementation is complete and the branch needs to be quality-checked before creating a PR — runs build, simplify, self-review, and lint/tests in a loop until only minor or no issues remain.
---

# Prepare for PR

## Overview

Runs a quality loop over the current branch changes until the code is clean enough to expose in a PR.

**Core principle:** Fix only what belongs to the current changes. If a problem is caused by something outside the current scope and the fix isn't obvious — ask the user.

## Quality Loop

Repeat until only minor issues remain or none at all. Record issues found at each step before fixing.

```dot
digraph prepare_for_pr {
    rankdir=TB;

    start [label="Implementation complete", shape=doublecircle];
    build [label="Build", shape=box];
    build_ok [label="Build passes?", shape=diamond];
    build_scope [label="Caused by\ncurrent changes?", shape=diamond];
    ask_build [label="Ask user", shape=box];
    fix_build [label="Fix", shape=box];
    simplify [label="Simplify\n(skill: simplify)", shape=box];
    selfrev [label="Self-review all diffs", shape=box];
    issues_found [label="Non-minor issues?", shape=diamond];
    in_scope [label="In current scope?", shape=diamond];
    ask_scope [label="Ask user", shape=box];
    fix [label="Fix", shape=box];
    lint [label="Lint + Tests", shape=box];
    lint_fail [label="Failures?", shape=diamond];
    lint_scope [label="In current scope?", shape=diamond];
    ask_lint [label="Ask user", shape=box];
    fix_lint [label="Fix", shape=box];
    done [label="Ready for PR", shape=doublecircle];

    start -> build;
    build -> build_ok;
    build_ok -> simplify [label="yes"];
    build_ok -> build_scope [label="no"];
    build_scope -> fix_build [label="yes"];
    build_scope -> ask_build [label="no — stop"];
    fix_build -> build;

    simplify -> selfrev;
    selfrev -> issues_found;
    issues_found -> lint [label="no"];
    issues_found -> in_scope [label="yes"];
    in_scope -> fix [label="yes"];
    in_scope -> ask_scope [label="no — stop"];
    fix -> build;

    lint -> lint_fail;
    lint_fail -> done [label="no failures"];
    lint_fail -> lint_scope [label="yes"];
    lint_scope -> fix_lint [label="yes"];
    lint_scope -> ask_lint [label="no — stop"];
    fix_lint -> build;
}
```

## Scope Decision

**In scope — fix autonomously:**
- Bugs introduced by current changes
- Tests broken by current changes
- Lint errors in changed files
- Logic errors in current implementation

**Out of scope — ask user only if fix isn't obvious:**
- Pre-existing failures unrelated to this PR
- Test failures in files not touched
- Build errors from dependency issues or unrelated commits

When asking, include: what the issue is, why it seems unrelated, and options (fix here / ignore / open separate issue).

## What "Minor" Means

**Minor (exit loop — code is ready):** style preferences, optional naming, cosmetic suggestions with no correctness impact.

**Non-minor (keep looping):** bugs, broken tests, lint errors, security issues, incorrect logic.

## Output

When the loop exits, report:
- Issues found per step and what was fixed
- Any items escalated to user
- Confirmation: **"Code is ready for PR"**
