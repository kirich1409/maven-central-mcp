---
name: check-deps
description: Scan current project build files for Maven/Gradle dependencies and check for available updates. Use when user says "check deps", "check dependencies", "outdated dependencies", "update dependencies", or "/check-deps".
---

# Check Dependencies

Scan the current project for Maven/Gradle dependencies and report available updates.

## Steps

1. Find build dependency files in the project root:
   - `gradle/libs.versions.toml` (Gradle version catalog)
   - `build.gradle.kts` or `build.gradle`
   - `pom.xml`

2. Read the found files and extract ALL dependencies with their current versions.
   - For `libs.versions.toml`: parse the `[versions]` and `[libraries]` sections
   - For Gradle files: find `implementation`, `api`, `compileOnly`, `testImplementation` etc. with group:artifact:version
   - For `pom.xml`: find `<dependency>` blocks with `<groupId>`, `<artifactId>`, `<version>`

3. Call the `compare_dependency_versions` MCP tool with the extracted dependencies. Use the EXACT parameter format defined in the tool schema:

```json
{
  "dependencies": [
    {"groupId": "io.ktor", "artifactId": "ktor-client-core", "currentVersion": "3.1.2"},
    {"groupId": "androidx.compose", "artifactId": "compose-bom", "currentVersion": "2025.05.00"}
  ]
}
```

Do NOT pass dependencies as a string. Do NOT add extra parameters like `stabilityFilter` or `includeSecurityScan` — they don't exist on this tool.

4. Present results as a markdown table:

   | Artifact | Current | Latest | Upgrade |
   |----------|---------|--------|---------|
   | io.ktor:ktor-client-core | 3.1.2 | 3.1.3 | PATCH |

5. If all dependencies are up to date, say so.

## Important

- Always check `libs.versions.toml` first — it's the modern Gradle standard for version management.
- Dependencies in `libs.versions.toml` may use version references — resolve them to actual versions.
- Skip dependencies without explicit versions (e.g., BOM-managed or platform dependencies).
- **Send ALL dependencies to the MCP tool** — the server searches Maven Central, Google Maven, and Gradle Plugin Portal automatically. Do NOT skip or filter any dependencies by group ID.
- **Use the exact tool schema** — pass `dependencies` as an array of objects with `groupId`, `artifactId`, `currentVersion` fields. No other format is accepted.
