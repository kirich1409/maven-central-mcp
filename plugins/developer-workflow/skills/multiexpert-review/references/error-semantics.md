# Error semantics

All engine errors produce exactly this prefix on the first line of output:

```
[multiexpert-review ERROR] <CATEGORY>: <details>
```

Consumers (`feature-flow`, `write-spec`, etc.) detect this prefix to distinguish engine errors from ordinary review FAIL verdicts.

## Categories

| Category | Condition |
|----------|-----------|
| `UNKNOWN_PROFILE_HINT` | Caller hint not in inventory |
| `FORBIDDEN_PROFILE_FIELD` | Profile frontmatter contains forbidden field (negative-list in `../profiles/README.md`) |
| `NO_REVIEWERS_AVAILABLE` | No agents remain after discovery/filtering, or panel required but only one agent available |
| `AMBIGUOUS_REVIEWER` | Short-name resolves to multiple agent files after the family tie-break (see engine Step 2) |
| `PROFILE_INVENTORY_MISMATCH` | `profiles/README.md` inventory list disagrees with `profiles/*.md` file presence |
| `ROUTING_NOT_SUPPORTED` | Engine reached Step 5 with a source the profile declared `N/A` in `source_routing` |

## Tie-break and single-reviewer details

- **Short-name collision tie-break (Step 2):** if the same agent short-name resolves to multiple files (e.g., two plugins define `security-expert`), prefer first match in this order: (1) same-plugin as the caller skill, (2) sibling `developer-workflow-*` plugin, (3) any other source. If still ambiguous, emit `AMBIGUOUS_REVIEWER` with paths. Distinct from `NO_REVIEWERS_AVAILABLE` (which covers the "agents missing entirely" path) so consumers can branch on intent. In practice the `developer-workflow-*` family guarantees unique short-names — this guard only triggers on non-family plugin conflicts.

- **Single-reviewer guard (Step 2):**
  - `profile.allow_single_reviewer: true` — proceed. Final verdict carries a `## Review Mode: single-perspective` marker in the output text (not in any receipt — receipt schemas are profile-declared and do not include `review_mode`).
  - `profile.allow_single_reviewer: false` — emit `NO_REVIEWERS_AVAILABLE: profile <name> requires panel, only <agent> available`.
  - 0 agents — same `NO_REVIEWERS_AVAILABLE` error regardless of flag.
