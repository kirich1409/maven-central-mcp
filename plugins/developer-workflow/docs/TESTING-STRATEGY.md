# Testing Strategy

The contract that ties together how the developer-workflow toolbox produces, audits, and maintains test coverage. Skills (`write-tests`, `generate-test-plan`, `finalize`, `acceptance`, `check`) read from this document; engineer agents (`kotlin-engineer`, `swift-engineer`, `compose-developer`, `swiftui-developer`) follow it when picking frameworks and types.

## Position

**Single-phase: tests live alongside the production code that introduces them.** Engineer agents own production code AND its tests in the same change. There is no separate "lock-in tests" stage — coverage auditing happens after the fact via Finalize Phase D's conditional `test-coverage-expert` trigger.

Acceptance is not the source of truth for correctness — the source is `spec.md` / `<slug>-test-plan.md` / acceptance criteria. Tests written alongside the change run against the same source, so consistency with Acceptance follows naturally; divergence is healed by re-running acceptance after fixes.

## Test types

Picked per acceptance criterion using the [Selection heuristic](#selection-heuristic) below. The pyramid bias is real: many `unit`, fewer `integration`, fewer `ui-instrumentation`, occasional `screenshot`, rare `e2e`.

| Type | Scope | Use when |
|---|---|---|
| **unit** | One class or function with mocked collaborators | Pure logic, domain rules, mappers, parsers, validators, state holders with mocked dependencies |
| **integration** | Several classes plus real or in-memory dependencies | Repositories + in-memory DB, services + test API, data pipelines |
| **ui-instrumentation** | Single UI component inside its framework | Compose UI tests (Android), XCUITest / ViewInspector (iOS) — one screen / component at a time |
| **screenshot** | Visual render | Visual-regression coverage (Paparazzi, swift-snapshot-testing) — only where visual fidelity is part of the contract |
| **e2e / application** | Whole application | Release-critical user journeys (UIAutomator on Android, full XCUITest on iOS). Keep the count small. |

## Selection heuristic

For every acceptance criterion, take the **smallest scope that catches a real failure of that criterion**, then climb only when needed.

| AC shape | Type |
|---|---|
| "Given X, when Y, then Z" — pure transform | `unit` |
| "Component A and B together yield Z" | `integration` |
| "User taps / sees / types on screen X" | `ui-instrumentation` |
| "Full journey across N screens" | `e2e` |
| "Visual regression matters" | `screenshot` (additive, not a replacement) |
| "Release-critical end-to-end flow" | `e2e` (use sparingly) |

The `generate-test-plan` skill records the chosen `type` per test case so reviewers can see the rationale.

## Framework detection

The engineer agent picks the testing framework. Detection order:

1. **Build file evidence.** Inspect `build.gradle.kts`, `Package.swift`, `pom.xml`, `Cargo.toml`, etc. — existing test dependencies are the source of truth.
2. **Existing test files.** Read `src/test/`, `Tests/`, etc. — match the framework already in use.
3. **Same as existing tests.** If multiple frameworks coexist, follow the one used in the module being modified.
4. **Platform default.** Apply only when no signal exists in the project.

Platform defaults:

| Platform | Default |
|---|---|
| Android / Kotlin | JUnit 5 + MockK |
| Kotlin Multiplatform | `kotlin.test` |
| iOS / Swift | XCTest (or `swift-testing` when toolchain ≥ 5.9) |
| Compose UI | `androidx.compose.ui:ui-test-junit4` |
| SwiftUI | XCUITest or ViewInspector |

The `write-tests` skill documents the algorithm in detail. Engineer agents (`kotlin-engineer`, `swift-engineer`, `compose-developer`, `swiftui-developer`) cross-reference that section.

## Coverage audit

The engineer agent is the producer. Audit happens later, conditionally:

- **Phase D `test-coverage-expert` trigger** in `finalize` — fires when the diff introduces new public APIs without matching tests, when `<slug>-test-plan.md` declares cases that have no corresponding test file, or when an explicit `--coverage-audit` override is set.

There is no numerical coverage threshold. The criterion is "every acceptance criterion has a test that would catch its failure"; numbers are a side effect, not the contract.

## Skip rules

- **Trivial diff.** Single file, < 50 LOC, pure refactor with no new public API → no new tests required. The Phase D audit honours this.
- **`--skip-coverage-audit`** override on `finalize` Phase D — used only when the user has consciously accepted the trade-off; recorded in the finalize report.
- **No test infrastructure** in the affected module → short-circuit with a follow-up issue ("add test harness for X"), not silent skip.

## Author fixes broken tests (non-negotiable)

A change that breaks tests is fixed by the author of the change in the same PR. `/check` is the gate. There is no `--skip-test-fix`, no "TODO fix later", no "merge red". The only escape hatch is an explicit, justified skip-marker on a single test plus a follow-up issue — treated as an exception, not a routine.

This rule lives in `CLAUDE.md` (project) and is reinforced in `finalize` and `write-tests` SKILLs.

## Non-goals

- No numerical coverage threshold — the contract is per-AC, not per-percentage.
- Acceptance is not replaced or downgraded — it remains the one-time manual / agent-driven verification before PR.
