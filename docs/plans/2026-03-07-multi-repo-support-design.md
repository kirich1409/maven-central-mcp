# Design: Multi-Repository Support

## Overview

Extend maven-central-mcp to work with any Maven repository, not just Maven Central. Repositories are auto-discovered from project build files (Gradle/Maven). Maven Central remains the default fallback.

## Sources of Repositories

1. **Build files** — server scans project directory for `build.gradle.kts`, `build.gradle`, `settings.gradle.kts`, `settings.gradle`, `pom.xml` and extracts declared repositories.
2. **Maven Central** — always present as the last fallback.

Authentication is out of scope (public repos only).

## Architecture

```
src/
  index.ts                          — entry point, MCP server setup
  tools/                            — tool implementations (API unchanged)
  maven/
    types.ts                        — types (MavenMetadata etc.)
    repository.ts                   — MavenRepository interface + HttpMavenRepository
    resolver.ts                     — resolveFirst / resolveAll strategies
  discovery/
    types.ts                        — RepositoryConfig, DiscoveryResult
    discover.ts                     — main function: finds build files, calls parsers
    gradle-parser.ts                — parses build.gradle[.kts], settings.gradle[.kts]
    maven-parser.ts                 — parses pom.xml
  project/
    find-project-root.ts            — walks up from cwd to find project root
```

## Key Interfaces

```typescript
// maven/repository.ts
interface MavenRepository {
  readonly name: string;
  readonly url: string;
  fetchMetadata(groupId: string, artifactId: string): Promise<MavenMetadata>;
}

class HttpMavenRepository implements MavenRepository {
  constructor(name: string, url: string) {}
}

const MAVEN_CENTRAL = new HttpMavenRepository(
  "Maven Central",
  "https://repo1.maven.org/maven2"
);
```

```typescript
// maven/resolver.ts
resolveFirst(repos, groupId, artifactId): Promise<{metadata: MavenMetadata, repository: MavenRepository} | null>
resolveAll(repos, groupId, artifactId): Promise<MavenMetadata>  // merged + deduplicated versions
```

```typescript
// discovery/types.ts
interface RepositoryConfig {
  name: string;
  url: string;
}

interface DiscoveryResult {
  repositories: RepositoryConfig[];
  buildSystem: "gradle" | "maven" | "unknown";
  projectRoot: string;
}
```

## Build File Parsing

### Gradle (regex-based, no Gradle execution)

Recognized patterns in `repositories { ... }` blocks:

```kotlin
// Kotlin DSL
mavenCentral()                          // https://repo1.maven.org/maven2
google()                                // https://maven.google.com
gradlePluginPortal()                    // https://plugins.gradle.org/m2
maven("https://jitpack.io")
maven(url = "https://...")
maven { url = uri("https://...") }
```

```groovy
// Groovy DSL
maven { url 'https://...' }
maven { url "https://..." }
```

### Maven (pom.xml)

Extract `<url>` from each `<repository>` inside `<repositories>`. Regex-based parsing (same approach as maven-metadata.xml).

### Project Root Discovery

Walk up from cwd looking for first marker: `settings.gradle.kts` > `settings.gradle` > `build.gradle.kts` > `build.gradle` > `pom.xml`.

## Tool Strategies

| Tool | Strategy | Logic |
|------|----------|-------|
| `get_latest_version` | `resolveAll` | Aggregate versions from all repos, pick best by filter |
| `check_version_exists` | `resolveFirst` | Sequential search, return first repo where version found |
| `check_multiple_dependencies` | `resolveAll` | Aggregate per dependency |
| `compare_dependency_versions` | `resolveAll` | Aggregate for comparison |

Response fields enriched with `repository` (name/URL of the source repo).

## Initialization

Lazy discovery on first tool call. Result cached in memory for the session. Maven Central always appended last as fallback.

## Error Handling

- **Repo unavailable** (timeout, 5xx) — skip, move to next. Error only if all repos fail.
- **Artifact not found** (404) — not an error, just absent in this repo.
- **No build files found** — not an error. Use Maven Central only.
- **Build file parse failure** — log to stderr, use what was parsed + Maven Central.
- **Fetch timeout** — 10 seconds per repo. `resolveAll` runs requests in parallel.
