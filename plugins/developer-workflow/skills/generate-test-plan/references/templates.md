# Test Plan Templates — Extended Examples

Use this reference when applying the phase segmentation or lightweight (non-UI) template
in a generated test plan. Keep the SKILL.md Test Plan Format as the base — these are
additive variants.

## Phase Segmentation

When the feature reaches this skill via `decompose-feature` with phases (e.g. T-1..T-3 in
Phase 1, T-4..T-6 in Phase 2), the permanent file splits the `## Test Cases` section by
phase so each phase can ship and be re-verified independently. One permanent document per
feature remains the rule — phases are sections inside it, not separate files.

Apply segmentation when the decomposition artifact contains two or more phases **and** test
cases can be grouped by which phase introduces the behavior they cover. Otherwise keep a
single flat `## Test Cases` section.

Example for a feature with two phases:

```markdown
## Test Cases

### Phase 1 (T-1..T-3) — Core login flow

#### TC-1: Successful login with valid credentials
| Field | Value |
|-------|-------|
| **Priority** | P0 Critical |
| **Tier** | Smoke |
| **Preconditions** | User account exists, email is verified |
| **Steps** | 1. Open login screen  2. Enter email  3. Enter password  4. Tap Login |
| **Expected Result** | Home screen is shown, session token stored |
| **Source** | Spec §2.1 |

#### TC-2: Invalid password shows inline error
...

#### TC-3: Rate-limit after 5 failed attempts
...

### Phase 2 (T-4..T-6) — Password reset flow

#### TC-4: Request reset email from login screen
| Field | Value |
|-------|-------|
| **Priority** | P0 Critical |
| **Tier** | Feature |
| **Preconditions** | User account exists |
| **Steps** | 1. Tap "Forgot password?"  2. Enter email  3. Submit |
| **Expected Result** | Confirmation screen shown, reset email dispatched |
| **Source** | Spec §3.2 |

#### TC-5: Reset link expires after 15 minutes
...

#### TC-6: Reset flow rejects reused link
...
```

When segmentation is applied, the receipt's `phase_coverage` field lists the phase labels
present (e.g. `[Phase 1, Phase 2]`), and the TC ranges covered by each phase appear in the
receipt's Phase Coverage section.

## Lightweight Template (Non-UI Features)

When the non-UI detector triggers (see SKILL.md §Input Discovery), use this reduced TC
format in place of the standard one. The entire behavior of each TC is captured in
Given/When/Then — no numbered Steps, no separate Expected Result field, since both collapse
into the Then clause for non-interactive surfaces.

```markdown
#### TC-[N]: [Short title]
| **Priority** | P0/P1/P2/P3 |
| **Tier** | Smoke/Feature/Regression |
| **Preconditions** | [state] |
| **Scenario (Given/When/Then)** | Given X, When Y, Then Z |
| **Source** | [Spec §section / inferred from code] |
```

Example:

```markdown
#### TC-3: Token refresh succeeds before expiry
| **Priority** | P0 Critical |
| **Tier** | Feature |
| **Preconditions** | Valid refresh token stored, access token within 60s of expiry |
| **Scenario (Given/When/Then)** | Given an access token with <60s TTL, When the client calls `refresh()`, Then a new access token is returned with the original refresh-token scope preserved |
| **Source** | `src/auth/TokenManager.kt:142` |
```

All other sections of the Test Plan Format (front-matter table, Findings, Risk Areas,
Coverage Matrix, Suggested Automation Candidates, Phase Segmentation when applicable) are
used unchanged — only the TC blocks switch to this reduced form.
