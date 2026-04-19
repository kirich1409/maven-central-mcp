---
name: generate-test-plan
description: >-
  This skill should be used when the user asks to "create a test plan", "write test cases",
  "generate QA scenarios", "prepare a testing checklist", "identify what to test", "find edge cases",
  "plan testing coverage", "document test scenarios", "create a QA handoff document", "what should
  I test?", "what are the edge cases?", or "how would you test this?". Also use when the user
  describes requirements or acceptance criteria and asks how to verify them, or wants to plan testing
  before actually running tests. Produces a structured, prioritized test plan document saved to
  docs/testplans/ with risk analysis, coverage matrix, automation candidates, and proper TC format.
  Do NOT trigger when: the user wants to execute tests on a running app (use acceptance or
  bug-hunt), the user wants automated unit/integration tests written in code (out of scope),
  or the user wants to run an existing test plan (use acceptance). This skill never launches an
  app, device, or browser — it only produces a document.
---

# Generate Test Plan

Analyze a feature from its specification, design, or implementation and produce a structured,
prioritized test plan as a markdown document. No tests are executed — the output is a plan ready
for a human QA engineer or the `manual-tester` agent to pick up later.

## Output

Save every test plan to the repository:

```
docs/testplans/<slug>-test-plan.md
```

Create the `docs/testplans/` directory if it doesn't exist. The slug is the canonical
filename anchor — downstream stages (`feature-flow` Phase 1.5, `acceptance` Branch 2)
mount by exact slug match, so the filename must be slug-based regardless of invocation
mode.

Slug resolution rules (apply in order):

1. **Orchestrator invocation** — when this skill is invoked from `feature-flow`, a
   `slug` argument is passed explicitly. Use it as-is.
2. **Standalone invocation, slug provided inline** — the user or caller may supply
   a slug directly (e.g. `"slug: login-flow"`). Use it as-is.
3. **Standalone invocation, no slug** — derive one from the feature name with the
   stable kebab-case convention used elsewhere in workflow docs: lowercase the
   name, replace runs of spaces or punctuation with `-`, trim leading/trailing `-`.

Examples of derivation (rule 3): `"User authentication"` → `user-authentication`,
`"Cart & checkout"` → `cart-checkout`, `"Token refresh (auth)"` → `token-refresh-auth`.
The resulting filename is then `docs/testplans/<slug>-test-plan.md` (for example,
`docs/testplans/user-authentication-test-plan.md`).

### Receipt (orchestrator invocation)

When invoked from `feature-flow` with a slug, produce an additional **receipt** at
`swarm-report/<slug>-test-plan.md` for receipt-based gating by `multiexpert-review` and
`acceptance`. Standalone invocation without a slug skips the receipt — the permanent file
is the only artifact.

Full receipt frontmatter schema, field conventions, platform inheritance, and standalone
fallback rules live in [`references/receipt.md`](references/receipt.md). Consult that file
when generating or updating a receipt.

## Input Discovery

Determine what the user has provided and gather context accordingly.

### 1. Text specification (PRD, acceptance criteria, user story)

Read the document. Extract:
- Functional requirements (what the feature does)
- Non-functional requirements (performance, accessibility, security constraints)
- Acceptance criteria (explicit pass/fail conditions)
- User roles and permissions mentioned

When the source is a file with YAML frontmatter containing a `platform:` list, copy that
list verbatim into the receipt's `platform:` field (see
[`references/receipt.md`](references/receipt.md) §Platform inheritance).

### 2. Figma mockup

Use Figma MCP tools (`get_design_context`, `get_screenshot`) to retrieve the design.
Extract:
- Screen states (default, loading, empty, error, populated)
- Interactive elements and their expected behavior
- Navigation flows between screens
- Responsive or platform-specific variants

### 3. Existing code

When code is the primary (or only) source of truth, read the implementation thoroughly:
- Public API surface — endpoints, functions, UI entry points
- State transitions and conditional branches
- Error handling paths and fallback behavior
- Input validation rules and boundary values
- Integration points (APIs, databases, third-party services)

When deriving test cases from code alone, be explicit about assumptions. Mark any inferred
behavior that has no spec backing with `[inferred from code]` so reviewers know what to verify
against product intent.

### Combining sources

Often the user provides more than one source. Cross-reference them:
- Spec says X, but code implements Y → flag the discrepancy as a finding, write test cases for both
- Design shows a state the spec doesn't mention → note it, write a test case
- Code handles an edge case not in the spec → include it with `[inferred from code]`

### Non-UI detector — when to use the lightweight template

Not every feature has a user interface. Pure backend services, CLI tools, internal libraries,
and data pipelines should use a reduced TC format where the full Steps / Expected Result
columns add noise without signal — the behavior is fully captured by Given/When/Then.

**Detector (all must hold to trigger lightweight mode):**
- The spec or input contains **no** references to any of: mockups, wireframes, Figma frames,
  screens, screen states, UI components, Jetpack Compose composables, SwiftUI views, React /
  Vue / Svelte / HTML components, CSS selectors, navigation flows, or visible user actions
  (tap, click, scroll, swipe, type in field).
- The feature surface is API / library / CLI / background job / data transformation.
- No `ux-expert` or front-end agent was consulted during research.

If any one of the signals above **is** present, use the standard Test Plan Format
(with full Steps and Expected Result). Mixed features (backend + thin UI) default to the
standard format.

When the detector triggers, note it in the Findings section of the permanent file:
`**Lightweight template applied** — no UI surface detected; TCs use Given/When/Then only.`
For the reduced TC format itself, see
[`references/templates.md`](references/templates.md) §Lightweight Template.

## Analysis

Before writing test cases, identify:

1. **Risk areas** — parts of the feature most likely to break or cause user-visible issues.
   Consider: complexity, number of integration points, data sensitivity, new vs. changed behavior.

2. **Edge cases** — boundary values, empty/null inputs, concurrent actions, permission boundaries,
   network failures, locale/timezone effects, large datasets.

3. **State combinations** — which states interact and which transitions are possible. A simple
   matrix helps: list states on one axis, user actions on the other, mark which intersections need
   coverage.

## Test Plan Format

Every generated test plan must follow this exact structure:

```markdown
---
type: test-plan
slug: <feature-slug>
generated: YYYY-MM-DD
---

# Test Plan: [Feature Name]

| Field | Value |
|-------|-------|
| **Source** | [spec link / Figma link / code path — whatever was provided] |
| **Generated** | [YYYY-MM-DD] |
| **Scope** | [one-line summary of what is covered] |
| **Status** | Draft / Ready for Review / Approved |

The `type: test-plan` frontmatter lets `multiexpert-review` and `acceptance` identify the
artifact deterministically (Signal #1 of the classifier). `slug` matches the receipt and
any decomposition artifact for the same feature.

---

## Findings

Discrepancies, ambiguities, or assumptions discovered during analysis.
Each finding has a short title and explanation.

- **[Finding title]** — [explanation]

> Omit this section entirely if there are no findings.

---

## Risk Areas

| Area | Risk Level | Reason |
|------|-----------|--------|
| [area name] | High / Medium / Low | [why this area is risky] |

---

## Test Cases

### [Group Name]

Group related test cases by feature area, screen, or workflow
(e.g., Authentication, Cart Checkout, Error Handling).

#### TC-[N]: [Short descriptive title]

| Field | Value |
|-------|-------|
| **Priority** | P0 Critical / P1 High / P2 Medium / P3 Low |
| **Tier** | Smoke / Feature / Regression |
| **Preconditions** | What must be true before starting |
| **Steps** | 1. First step  2. Second step  3. Third step |
| **Expected Result** | Observable outcome that means the test passed |
| **Source** | Spec §section / Figma frame name / `path/to/file.kt:42` / [inferred from code] |

---

## Edge Cases & Negative Scenarios

Same TC format as above. Grouped separately for visibility.
Includes: boundary values, invalid inputs, error states, permission denials,
network failures, empty/null data, concurrent operations.

---

## Coverage Matrix

| Requirement / Screen / Flow | Test Cases | Risk |
|-----------------------------|-----------|------|
| [requirement or screen name] | TC-1, TC-3 | High |
| [another requirement] | TC-2 | Low |

---

## Suggested Automation Candidates

Test cases that are good candidates for automated testing.

| Test Case | Rationale |
|-----------|-----------|
| TC-[N] | [why this is a good automation candidate] |

> Omit this section if no test cases are suitable for automation.
```

### Variants — phase segmentation and lightweight TCs

Two variants apply on top of the format above:

- **Phase segmentation** — when `decompose-feature` produced two or more phases and TCs
  group cleanly by the phase that introduces the behavior, split `## Test Cases` into
  per-phase subsections. The permanent file stays as one document.
- **Lightweight TC template** — when the non-UI detector triggers (see above), TC blocks
  collapse Steps and Expected Result into a single Given/When/Then row. All other sections
  remain unchanged.

Full worked examples for both variants live in
[`references/templates.md`](references/templates.md). Consult it before emitting either
variant so the TC shape matches what downstream stages expect.

## Field Definitions

### Priority

| Priority | Meaning | Guideline |
|----------|---------|-----------|
| **P0 Critical** | Core happy path | If this fails, the feature is unusable |
| **P1 High** | Important flows | Security, data integrity, key user journeys |
| **P2 Medium** | Secondary flows | Edge cases with moderate impact |
| **P3 Low** | Minor scenarios | Cosmetic, rare edge cases, minor UX |

### Tier

| Tier | Meaning | Guideline |
|------|---------|-----------|
| **Smoke** | Is it alive? | Minimum set to confirm the feature works at all (3-5 tests max) |
| **Feature** | Does it work correctly? | Thorough coverage of the feature's behavior |
| **Regression** | Did we break anything? | Guards against breaking existing functionality |

### Source

| Source type | Format | Example |
|-------------|--------|---------|
| Spec section | `Spec §[section]` | `Spec §3.2 — Login flow` |
| Figma frame | `Figma: [frame name]` | `Figma: Login / Error State` |
| Code path | backtick-wrapped path with line | `src/auth/LoginViewModel.kt:87` |
| Inferred | `[inferred from code]` | Behavior derived from code with no spec backing |

## Guidelines

- Number test cases sequentially: TC-1, TC-2, TC-3, ...
  (the manual-tester agent will assign session-scoped IDs when executing)
- Each test case tests exactly one thing — split multi-outcome verifications
- Steps must be concrete and actionable — a QA engineer unfamiliar with the feature
  should follow them without asking questions
- Expected results describe observable behavior, not implementation details:
  "user sees error toast with message 'Invalid email'" not "catch block executes"
- Mark inferred behavior with `[inferred from code]` so reviewers can verify against
  product intent
- Target 15-30 test cases for a medium feature; fewer for simple changes, more for
  complex flows — every test case should earn its place

## Additional Resources

- [`references/receipt.md`](references/receipt.md) — receipt frontmatter schema, field
  conventions, platform inheritance, standalone fallback rules.
- [`references/templates.md`](references/templates.md) — worked examples for phase
  segmentation and the lightweight (non-UI) TC template.
