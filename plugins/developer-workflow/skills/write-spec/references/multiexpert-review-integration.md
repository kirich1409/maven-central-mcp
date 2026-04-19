# multiexpert-review Integration (Phase 4.3)

How Phase 4.3 invokes the `multiexpert-review` skill on the draft spec.

## Invocation format

Run `multiexpert-review` with an **explicit `spec` profile hint**. Prepend this prefix to
the args (engine parses the first two lines as hint):

```
profile: spec
---
<rest of args: full spec content + original feature goal>
```

## Why the explicit hint (defense-in-depth)

The `spec` profile's detector declares `frontmatter_type: [spec]` and
`path_globs: ["docs/specs/**"]`. Either path would normally classify a draft that carries
`type: spec` frontmatter and lives under `docs/specs/`. The explicit hint exists because:

1. **Invocation-path robustness** — in some callsites the draft is passed as inline args
   without the frontmatter block; the engine sees only body prose and can't rely on
   frontmatter detection.
2. **Cheapest deterministic route** — Step 1 hint-match short-circuits detection before
   any YAML parse or path-glob evaluation; cost is a single-line prefix.
3. **Detector-independence** — removes the orchestrator's dependency on detector internals.
   Future detector refactors (reordering, different fallback) cannot silently re-open the
   historical spec → implementation-plan misclassification drift that this profile exists
   to close.

## Artifact source behavior

In-memory draft, so engine classifies source as `conversation` and uses the spec profile's
`source_routing.conversation: inline-revise` action for FAIL fixes (not
`file: edit-in-place` — the draft isn't saved to `docs/specs/` yet). Revise-loop
iterations happen inline in the write-spec flow.

## What the spec profile checks

Panel: `business-analyst` + `architecture-expert`. Checks:

- Falsifiability of Acceptance Criteria
- Prerequisite realism
- Explicit Out of Scope
- Decisions with rationale
- Affected modules completeness
- Open questions tagged blocking vs non-blocking
- Technical approach detail

## Verdict handling

| Severity | Action |
|----------|--------|
| No issues (PASS) | Proceed |
| Minor gaps | Fix inline, note changes |
| Major gaps (CONDITIONAL) | Surface to user, discuss, resolve |
| Contradictions | Surface to user, resolve |
| Critical (FAIL) | Engine drives revise-loop on the draft; Phase 4.3 iterates until PASS/CONDITIONAL or user escalation |
