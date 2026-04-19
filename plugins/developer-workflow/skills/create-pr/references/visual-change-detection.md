# Visual-change detection patterns

Heuristics for deciding whether a PR includes UI changes and therefore warrants a "Screenshots / demo" section plus a prompt to attach images.

Match against paths from `git diff --name-only $BASE...HEAD`.

## File-path patterns by stack

- **Android / Jetpack Compose:** `*Screen.kt`, `*Composable.kt`, `res/layout/`, `res/drawable/`
- **Compose Multiplatform:** Kotlin UI patterns (as for Android) combined with `commonMain` UI directories
- **Web:** `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `*.html`
- **iOS:** `*.swift` (SwiftUI screens), `*.xib`, `*.storyboard`

Additional signals (optional): files under directories named `ui/`, `views/`, `screens/`, `components/`, or theme/design-token files.

## Behaviour when a match is found

- `--draft` — include the Screenshots / demo section as a placeholder and prompt the user for attachments.
- `--promote` — verify that the Screenshots / demo section is filled; prompt for attachments if still empty.
- `--refresh` — preserve whatever is already in the Screenshots / demo section verbatim; do not re-prompt.
- default — include the section and prompt for attachments.

## Behaviour when no match is found

Omit the Screenshots / demo section entirely. Do not add a placeholder "N/A" — an absent section communicates "no visual changes" more cleanly.
