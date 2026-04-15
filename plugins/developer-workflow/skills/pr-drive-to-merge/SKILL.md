---
name: pr-drive-to-merge
description: >-
  Pure mechanics of PR lifecycle — creates or updates a PR, pushes commits, monitors CI status,
  and executes merge when all conditions are met. Does NOT classify feedback, fix code, or
  route issues — that is feedback-stage's responsibility.
  Triggered by feedback-stage when merge conditions are satisfied, or directly when the user
  wants to push and merge without feedback routing.
  Do NOT use for: reading or acting on review comments (use feedback-stage), fixing code
  (use implement), QA (use acceptance).
---

# PR Drive to Merge — Merge Mechanics

Handles the mechanical side of the PR lifecycle: push, undraft, monitor CI, merge.
All feedback analysis and routing is handled by `feedback-stage` before this skill is called.

---

## Phase 1: Setup

### 1.1 Detect platform

```bash
REMOTE_URL=$(git remote get-url origin)
# Contains github.com → GitHub (gh CLI)
# Contains gitlab     → GitLab (glab CLI)
```

### 1.2 Fetch PR/MR state

```bash
# GitHub
PR_INFO=$(gh pr view --json number,baseRefName,headRefName,title,isDraft,state,
  statusCheckRollup,reviewDecision,mergeable,mergeStateStatus,url)
PR_NUMBER=$(echo "$PR_INFO" | jq -r .number)
IS_DRAFT=$(echo "$PR_INFO" | jq -r .isDraft)
BASE=$(echo "$PR_INFO" | jq -r .baseRefName)
HEAD=$(echo "$PR_INFO" | jq -r .headRefName)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(echo "$REPO" | cut -d/ -f1)
REPO_NAME=$(echo "$REPO" | cut -d/ -f2)

# GitLab
MR_INFO=$(glab mr view --output json)
MR_IID=$(echo "$MR_INFO" | jq -r .iid)
IS_DRAFT=$(echo "$MR_INFO" | jq -r '.title | startswith("Draft:")')
BASE=$(echo "$MR_INFO" | jq -r .target_branch)
PROJECT=$(glab repo view --output json | jq -r '.path_with_namespace | @uri')
```

### 1.3 Validate

- PR/MR exists and is open
- Current branch matches the PR head
- Local is up to date with remote

---

## Phase 2: Push

If there are local commits not yet on remote:

```bash
git push origin "$HEAD"
```

---

## Phase 3: Monitor CI

### 3.1 Wait for checks

```bash
# GitHub
gh pr checks "$PR_NUMBER" --watch --fail-fast

# GitLab
glab ci status --live
```

Fallback poll loop (if watch unavailable):

```bash
while true; do
  PENDING=$(gh pr checks "$PR_NUMBER" --json state \
    --jq '[.[] | select(.state != "COMPLETED")] | length')
  FAILED=$(gh pr checks "$PR_NUMBER" --json conclusion \
    --jq '[.[] | select(.conclusion | test("FAILURE|CANCELLED|TIMED_OUT"))] | length')
  [ "$PENDING" -eq 0 ] && break
  sleep 60
done
```

### 3.2 CI result

- **All green** → proceed to Phase 4
- **Failures** → report raw CI output to `feedback-stage` and stop. Do not fix code here.

---

## Phase 4: Undraft (if applicable)

If PR is a draft and CI is green:

```bash
# GitHub
gh pr ready "$PR_NUMBER"

# GitLab
glab mr update "$MR_IID" --remove-draft
```

---

## Phase 5: Merge

### 5.1 Pre-merge checklist

All must be true before merging:
- CI: all checks green
- Review: approved (or not required)
- Unresolved threads: 0
- Merge conflicts: none
- PR is not a draft

### 5.2 Update branch if behind

```bash
# GitHub — API update first
gh api "repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/update-branch" \
  --method PUT -f expected_head_oid="$(git rev-parse HEAD)"

# Fallback: local rebase
git fetch origin "$BASE"
git rebase "origin/$BASE"
# Conflicts within PR scope → resolve and push, return to Phase 3
# Conflicts outside PR scope → escalate to user
```

After updating — return to Phase 3 (CI must re-run on the updated branch).

### 5.3 Merge confirmation

Ask the user unless pre-approved ("merge when ready"):

```
## Ready to merge

PR: <title> (<url>)
CI: all checks passing
Reviews: approved by <reviewers>
Unresolved threads: 0
Branch: up to date with <base>

Proceed with merge?
```

### 5.4 Execute merge

```bash
# GitHub
gh pr merge "$PR_NUMBER" --squash --delete-branch

# GitLab
glab mr merge "$MR_IID" --squash --remove-source-branch --yes
```

### 5.5 Post-merge cleanup

```bash
git checkout "$BASE"
git pull origin "$BASE"
# Remove worktree if applicable
git worktree remove ".worktrees/$HEAD" 2>/dev/null
git branch -d "$HEAD" 2>/dev/null
```

---

## Escalation

Stop and report to the caller (`feedback-stage` or user) when:

| Condition | Action |
|-----------|--------|
| CI failures | Return raw CI output — do not fix |
| Rebase conflicts outside PR scope | Report conflicting files, ask for resolution |
| Branch protection rule blocks merge | Report which rule, ask how to proceed |
| 3+ CI runs failing after pushes | Escalate — something systemic is wrong |
