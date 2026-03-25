---
name: pr-lifecycle
description: Use when a PR/MR already exists and needs to be driven to merge — monitors CI/CD, handles multi-round code review, responds to and resolves reviewer comments, and loops until all merge requirements are met.
---

# PR Lifecycle

## Overview

Takes an existing PR/MR and drives it to merge autonomously. Loops through CI/CD monitoring and code review cycles until all requirements are satisfied.

**Core principle:** Fix only what belongs to the current PR. If a failure or comment is caused by something outside the current scope and the fix isn't obvious — ask the user.

## Phase 1: CI/CD Monitoring

```dot
digraph cicd {
    rankdir=TB;

    start [label="PR/MR exists", shape=doublecircle];
    has_ci [label="CI/CD configured?", shape=diamond];
    wait [label="Wait for checks", shape=box];
    passing [label="All checks passing?", shape=diamond];
    investigate [label="Investigate\nfailure logs", shape=box];
    our_fault [label="Caused by\ncurrent changes?", shape=diamond];
    fix [label="Fix →\nprepare-for-pr →\npush", shape=box];
    ask [label="Ask user", shape=box];
    review [label="Proceed to\nCode Review", shape=box];

    start -> has_ci;
    has_ci -> wait [label="yes"];
    has_ci -> review [label="no"];
    wait -> passing;
    passing -> review [label="yes"];
    passing -> investigate [label="no"];
    investigate -> our_fault;
    our_fault -> fix [label="yes"];
    our_fault -> ask [label="no — stop"];
    fix -> wait;
}
```

## Phase 2: Code Review Cycle

```dot
digraph review {
    rankdir=TB;

    start [label="CI/CD passing", shape=doublecircle];
    reviewers [label="Reviewers assigned?", shape=diamond];
    wait [label="Wait for review", shape=box];
    comments [label="Comments received?", shape=diamond];
    triage [label="Triage each comment", shape=box];
    all_minor [label="All minor?", shape=diamond];
    fix_major [label="Fix major →\nprepare-for-pr →\npush", shape=box];
    respond [label="Respond to every comment", shape=box];
    resolve [label="Mark all threads Resolved", shape=box];
    fixes_made [label="Fixes were made?", shape=diamond];
    rereview [label="Request re-review", shape=box];
    ci_again [label="Back to CI/CD monitoring", shape=box];
    merge_ok [label="Merge requirements met?", shape=diamond];
    done [label="MERGE", shape=doublecircle];
    no_rev [label="No reviewers path", shape=box];

    start -> reviewers;
    reviewers -> wait [label="yes"];
    reviewers -> no_rev [label="no"];
    no_rev -> merge_ok;

    wait -> comments;
    comments -> triage [label="yes"];
    comments -> merge_ok [label="approved / no comments"];
    triage -> all_minor;
    all_minor -> respond [label="yes — respond only"];
    all_minor -> fix_major [label="no"];
    fix_major -> respond;
    respond -> resolve;
    resolve -> fixes_made;
    fixes_made -> rereview [label="yes"];
    fixes_made -> merge_ok [label="no"];
    rereview -> ci_again;
    ci_again -> wait;
    merge_ok -> done [label="yes"];
    merge_ok -> wait [label="no — waiting on reviews"];
}
```

## Comment Triage Rules

Classify each comment autonomously. Respond individually to every comment — never a single summary response.

| Type | Criteria | Action |
|------|----------|--------|
| **Major** | Bug, incorrect behavior, security issue, design flaw | Fix → respond with explanation → Resolve |
| **Minor** | Style, naming preference, optional refactor, nitpick | Respond acknowledging → Resolve without fixing |
| **Question** | Needs clarification | Answer fully → Resolve |
| **Out of scope** | Requires changes outside this PR's scope, fix not obvious | Ask user before acting |

**Always respond in the same language as the PR and review comments.**

See `responding-to-pr-comments` for response templates and resolve mechanics.

## Merge Requirements Checklist

Before merging, confirm all of:
- [ ] All required CI/CD checks pass
- [ ] Required approvals received (or no reviewers assigned)
- [ ] No unresolved blocking threads
- [ ] Branch is up to date with base branch

## When to Ask the User

Ask only when:
- CI/CD failure is caused by something outside the current PR
- A reviewer comment requires changes outside the current PR scope and the right fix isn't obvious
- Merge is blocked for a reason unrelated to the PR changes

Don't ask for minor/major comment classification, standard fixes, or routine re-review requests.
