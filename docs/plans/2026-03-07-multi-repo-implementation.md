# Multi-Repository Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded Maven Central client with a universal `MavenRepository` abstraction, add auto-discovery of repositories from Gradle/Maven build files, and update all tools to work with multiple repositories.

**Architecture:** `MavenCentralClient` is replaced by `MavenRepository` interface with `HttpMavenRepository` implementation that works with any Maven repo via `maven-metadata.xml`. A discovery layer scans build files (Gradle Kotlin/Groovy DSL, Maven pom.xml) to extract declared repositories. A resolver layer provides two strategies: `resolveFirst` (sequential, first match) and `resolveAll` (parallel, merged results). Maven Central is always the last fallback.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `zod/v4`, `vitest` for testing

---

### Task 1: MavenRepository interface and HttpMavenRepository

**Files:**
- Create: `src/maven/repository.ts`
- Test: `src/maven/__tests__/repository.test.ts`

**Step 1: Write failing tests**

Create `src/maven/__tests__/repository.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { HttpMavenRepository, MAVEN_CENTRAL, GOOGLE_MAVEN } from "../repository.js";

describe("HttpMavenRepository", () => {
  it("builds correct metadata URL", () => {
    const repo = new HttpMavenRepository("test", "https://repo.example.com/maven2");
    const url = repo.buildMetadataUrl("io.ktor", "ktor-server-core");
    expect(url).toBe(
      "https://repo.example.com/maven2/io/ktor/ktor-server-core/maven-metadata.xml"
    );
  });

  it("builds metadata URL with trailing slash in base URL", () => {
    const repo = new HttpMavenRepository("test", "https://repo.example.com/maven2/");
    const url = repo.buildMetadataUrl("io.ktor", "ktor-server-core");
    expect(url).toBe(
      "https://repo.example.com/maven2/io/ktor/ktor-server-core/maven-metadata.xml"
    );
  });

  it("parses metadata XML correctly", () => {
    const repo = new HttpMavenRepository("test", "https://repo.example.com");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>io.ktor</groupId>
  <artifactId>ktor-server-core</artifactId>
  <versioning>
    <latest>3.1.1</latest>
    <release>3.1.1</release>
    <versions>
      <version>2.0.0</version>
      <version>3.0.0</version>
      <version>3.1.1</version>
    </versions>
    <lastUpdated>20250301</lastUpdated>
  </versioning>
</metadata>`;

    const result = repo.parseMetadataXml(xml, "io.ktor", "ktor-server-core");
    expect(result.groupId).toBe("io.ktor");
    expect(result.artifactId).toBe("ktor-server-core");
    expect(result.versions).toEqual(["2.0.0", "3.0.0", "3.1.1"]);
    expect(result.latest).toBe("3.1.1");
    expect(result.release).toBe("3.1.1");
  });

  it("exposes name and url properties", () => {
    const repo = new HttpMavenRepository("My Repo", "https://repo.example.com");
    expect(repo.name).toBe("My Repo");
    expect(repo.url).toBe("https://repo.example.com");
  });

  it("MAVEN_CENTRAL has correct values", () => {
    expect(MAVEN_CENTRAL.name).toBe("Maven Central");
    expect(MAVEN_CENTRAL.url).toBe("https://repo1.maven.org/maven2");
  });

  it("GOOGLE_MAVEN has correct values", () => {
    expect(GOOGLE_MAVEN.name).toBe("Google");
    expect(GOOGLE_MAVEN.url).toBe("https://maven.google.com");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/maven/__tests__/repository.test.ts`
Expected: FAIL — module not found

**Step 3: Implement HttpMavenRepository**

Create `src/maven/repository.ts`:

```typescript
import type { MavenMetadata } from "./types.js";

export interface MavenRepository {
  readonly name: string;
  readonly url: string;
  fetchMetadata(groupId: string, artifactId: string): Promise<MavenMetadata>;
}

export class HttpMavenRepository implements MavenRepository {
  readonly name: string;
  readonly url: string;

  constructor(name: string, url: string) {
    this.name = name;
    this.url = url.replace(/\/+$/, "");
  }

  buildMetadataUrl(groupId: string, artifactId: string): string {
    const groupPath = groupId.replace(/\./g, "/");
    return `${this.url}/${groupPath}/${artifactId}/maven-metadata.xml`;
  }

  async fetchMetadata(groupId: string, artifactId: string): Promise<MavenMetadata> {
    const url = this.buildMetadataUrl(groupId, artifactId);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`Metadata fetch failed from ${this.name}: ${response.status} ${response.statusText}`);
    }
    const xml = await response.text();
    return this.parseMetadataXml(xml, groupId, artifactId);
  }

  parseMetadataXml(xml: string, groupId: string, artifactId: string): MavenMetadata {
    const versions: string[] = [];
    const versionRegex = /<version>([^<]+)<\/version>/g;
    let match: RegExpExecArray | null;
    while ((match = versionRegex.exec(xml)) !== null) {
      versions.push(match[1]);
    }

    const latest = xml.match(/<latest>([^<]+)<\/latest>/)?.[1];
    const release = xml.match(/<release>([^<]+)<\/release>/)?.[1];
    const lastUpdated = xml.match(/<lastUpdated>([^<]+)<\/lastUpdated>/)?.[1];

    return { groupId, artifactId, versions, latest, release, lastUpdated };
  }
}

export const MAVEN_CENTRAL = new HttpMavenRepository(
  "Maven Central",
  "https://repo1.maven.org/maven2",
);

export const GOOGLE_MAVEN = new HttpMavenRepository(
  "Google",
  "https://maven.google.com",
);

export const GRADLE_PLUGIN_PORTAL = new HttpMavenRepository(
  "Gradle Plugin Portal",
  "https://plugins.gradle.org/m2",
);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/maven/__tests__/repository.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/maven/repository.ts src/maven/__tests__/repository.test.ts
git commit -m "feat: add MavenRepository interface and HttpMavenRepository"
```

---

### Task 2: Repository resolver (resolveFirst / resolveAll)

**Files:**
- Create: `src/maven/resolver.ts`
- Test: `src/maven/__tests__/resolver.test.ts`

**Step 1: Write failing tests**

Create `src/maven/__tests__/resolver.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveFirst, resolveAll } from "../resolver.js";
import type { MavenRepository } from "../repository.js";
import type { MavenMetadata } from "../types.js";

function mockRepo(name: string, versions: string[] | null): MavenRepository {
  return {
    name,
    url: `https://${name}.example.com`,
    fetchMetadata: versions === null
      ? vi.fn().mockRejectedValue(new Error("Not found"))
      : vi.fn().mockResolvedValue({
          groupId: "io.ktor",
          artifactId: "ktor-core",
          versions,
        } as MavenMetadata),
  };
}

describe("resolveFirst", () => {
  it("returns metadata from first repo that has the artifact", async () => {
    const repos = [mockRepo("empty", null), mockRepo("has-it", ["1.0.0", "2.0.0"])];
    const result = await resolveFirst(repos, "io.ktor", "ktor-core");
    expect(result).not.toBeNull();
    expect(result!.metadata.versions).toEqual(["1.0.0", "2.0.0"]);
    expect(result!.repository.name).toBe("has-it");
  });

  it("returns null when no repo has the artifact", async () => {
    const repos = [mockRepo("a", null), mockRepo("b", null)];
    const result = await resolveFirst(repos, "io.ktor", "ktor-core");
    expect(result).toBeNull();
  });

  it("stops at first successful repo", async () => {
    const repo1 = mockRepo("first", ["1.0.0"]);
    const repo2 = mockRepo("second", ["2.0.0"]);
    await resolveFirst([repo1, repo2], "io.ktor", "ktor-core");
    expect(repo1.fetchMetadata).toHaveBeenCalled();
    expect(repo2.fetchMetadata).not.toHaveBeenCalled();
  });
});

describe("resolveAll", () => {
  it("merges versions from all repos and deduplicates", async () => {
    const repos = [
      mockRepo("repo1", ["1.0.0", "2.0.0"]),
      mockRepo("repo2", ["2.0.0", "3.0.0"]),
    ];
    const result = await resolveAll(repos, "io.ktor", "ktor-core");
    expect(result.versions).toEqual(["1.0.0", "2.0.0", "3.0.0"]);
  });

  it("skips failed repos and returns versions from successful ones", async () => {
    const repos = [
      mockRepo("fails", null),
      mockRepo("works", ["1.0.0"]),
    ];
    const result = await resolveAll(repos, "io.ktor", "ktor-core");
    expect(result.versions).toEqual(["1.0.0"]);
  });

  it("throws when all repos fail", async () => {
    const repos = [mockRepo("a", null), mockRepo("b", null)];
    await expect(resolveAll(repos, "io.ktor", "ktor-core")).rejects.toThrow();
  });

  it("returns empty result for empty repos list", async () => {
    await expect(resolveAll([], "io.ktor", "ktor-core")).rejects.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/maven/__tests__/resolver.test.ts`
Expected: FAIL

**Step 3: Implement resolver**

Create `src/maven/resolver.ts`:

```typescript
import type { MavenRepository } from "./repository.js";
import type { MavenMetadata } from "./types.js";

export interface ResolveFirstResult {
  metadata: MavenMetadata;
  repository: MavenRepository;
}

export async function resolveFirst(
  repos: MavenRepository[],
  groupId: string,
  artifactId: string,
): Promise<ResolveFirstResult | null> {
  for (const repo of repos) {
    try {
      const metadata = await repo.fetchMetadata(groupId, artifactId);
      return { metadata, repository: repo };
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveAll(
  repos: MavenRepository[],
  groupId: string,
  artifactId: string,
): Promise<MavenMetadata> {
  if (repos.length === 0) {
    throw new Error(`No repositories configured to search for ${groupId}:${artifactId}`);
  }

  const results = await Promise.all(
    repos.map(async (repo) => {
      try {
        return await repo.fetchMetadata(groupId, artifactId);
      } catch {
        return null;
      }
    }),
  );

  const successful = results.filter((r): r is MavenMetadata => r !== null);
  if (successful.length === 0) {
    throw new Error(`Artifact ${groupId}:${artifactId} not found in any repository`);
  }

  const allVersions = new Set<string>();
  for (const meta of successful) {
    for (const v of meta.versions) {
      allVersions.add(v);
    }
  }

  // Preserve order: use the order from the first successful result as base,
  // then append any extra versions from other repos
  const orderedVersions: string[] = [];
  const seen = new Set<string>();
  for (const meta of successful) {
    for (const v of meta.versions) {
      if (!seen.has(v)) {
        seen.add(v);
        orderedVersions.push(v);
      }
    }
  }

  return {
    groupId,
    artifactId,
    versions: orderedVersions,
    latest: successful[0].latest,
    release: successful[0].release,
    lastUpdated: successful[0].lastUpdated,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/maven/__tests__/resolver.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/maven/resolver.ts src/maven/__tests__/resolver.test.ts
git commit -m "feat: add repository resolver with resolveFirst and resolveAll strategies"
```

---

### Task 3: Project root finder

**Files:**
- Create: `src/project/find-project-root.ts`
- Test: `src/project/__tests__/find-project-root.test.ts`

**Step 1: Write failing tests**

Create `src/project/__tests__/find-project-root.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findProjectRoot, BUILD_FILE_MARKERS } from "../find-project-root.js";
import * as fs from "node:fs";

vi.mock("node:fs");

const mockedFs = vi.mocked(fs);

describe("findProjectRoot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("finds project root with settings.gradle.kts", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return p === "/home/user/project/settings.gradle.kts";
    });

    const result = findProjectRoot("/home/user/project/src/main");
    expect(result).toBe("/home/user/project");
  });

  it("walks up directories to find project root", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return p === "/home/user/project/build.gradle.kts";
    });

    const result = findProjectRoot("/home/user/project/src/main/kotlin");
    expect(result).toBe("/home/user/project");
  });

  it("returns null when no build files found", () => {
    mockedFs.existsSync.mockReturnValue(false);

    const result = findProjectRoot("/home/user/random");
    expect(result).toBeNull();
  });

  it("prefers settings.gradle.kts over build.gradle.kts", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return (
        p === "/home/user/project/settings.gradle.kts" ||
        p === "/home/user/project/build.gradle.kts"
      );
    });

    const result = findProjectRoot("/home/user/project");
    expect(result).toBe("/home/user/project");
  });

  it("finds pom.xml project", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return p === "/home/user/maven-project/pom.xml";
    });

    const result = findProjectRoot("/home/user/maven-project/src");
    expect(result).toBe("/home/user/maven-project");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/project/__tests__/find-project-root.test.ts`
Expected: FAIL

**Step 3: Implement find-project-root**

Create `src/project/find-project-root.ts`:

```typescript
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const BUILD_FILE_MARKERS = [
  "settings.gradle.kts",
  "settings.gradle",
  "build.gradle.kts",
  "build.gradle",
  "pom.xml",
] as const;

export function findProjectRoot(startDir: string): string | null {
  let current = resolve(startDir);

  while (true) {
    for (const marker of BUILD_FILE_MARKERS) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/project/__tests__/find-project-root.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/project/
git commit -m "feat: add project root finder"
```

---

### Task 4: Gradle repository parser

**Files:**
- Create: `src/discovery/types.ts`
- Create: `src/discovery/gradle-parser.ts`
- Test: `src/discovery/__tests__/gradle-parser.test.ts`

**Step 1: Create discovery types**

Create `src/discovery/types.ts`:

```typescript
export interface RepositoryConfig {
  name: string;
  url: string;
}

export interface DiscoveryResult {
  repositories: RepositoryConfig[];
  buildSystem: "gradle" | "maven" | "unknown";
  projectRoot: string;
}
```

**Step 2: Write failing tests**

Create `src/discovery/__tests__/gradle-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseGradleRepositories } from "../gradle-parser.js";

describe("parseGradleRepositories", () => {
  describe("Kotlin DSL", () => {
    it("parses mavenCentral()", () => {
      const content = `
        repositories {
            mavenCentral()
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "Maven Central",
        url: "https://repo1.maven.org/maven2",
      });
    });

    it("parses google()", () => {
      const content = `
        repositories {
            google()
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "Google",
        url: "https://maven.google.com",
      });
    });

    it("parses gradlePluginPortal()", () => {
      const content = `
        repositories {
            gradlePluginPortal()
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "Gradle Plugin Portal",
        url: "https://plugins.gradle.org/m2",
      });
    });

    it("parses maven(\"url\")", () => {
      const content = `
        repositories {
            maven("https://jitpack.io")
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "https://jitpack.io",
        url: "https://jitpack.io",
      });
    });

    it("parses maven(url = \"...\")", () => {
      const content = `
        repositories {
            maven(url = "https://maven.pkg.jetbrains.space/public/p/compose/dev")
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "https://maven.pkg.jetbrains.space/public/p/compose/dev",
        url: "https://maven.pkg.jetbrains.space/public/p/compose/dev",
      });
    });

    it("parses maven { url = uri(\"...\") }", () => {
      const content = `
        repositories {
            maven {
                url = uri("https://repo.spring.io/milestone")
            }
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "https://repo.spring.io/milestone",
        url: "https://repo.spring.io/milestone",
      });
    });

    it("parses multiple repositories", () => {
      const content = `
        repositories {
            google()
            mavenCentral()
            maven("https://jitpack.io")
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toHaveLength(3);
    });
  });

  describe("Groovy DSL", () => {
    it("parses maven { url 'https://...' }", () => {
      const content = `
        repositories {
            maven { url 'https://repo.spring.io/milestone' }
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "https://repo.spring.io/milestone",
        url: "https://repo.spring.io/milestone",
      });
    });

    it("parses maven { url \"https://...\" }", () => {
      const content = `
        repositories {
            maven { url "https://jitpack.io" }
        }
      `;
      const repos = parseGradleRepositories(content);
      expect(repos).toContainEqual({
        name: "https://jitpack.io",
        url: "https://jitpack.io",
      });
    });
  });

  it("deduplicates repositories", () => {
    const content = `
      repositories {
          mavenCentral()
          mavenCentral()
      }
    `;
    const repos = parseGradleRepositories(content);
    expect(repos).toHaveLength(1);
  });

  it("returns empty array for content without repositories", () => {
    const content = `
      plugins {
          id("org.jetbrains.kotlin.jvm")
      }
    `;
    const repos = parseGradleRepositories(content);
    expect(repos).toEqual([]);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/discovery/__tests__/gradle-parser.test.ts`
Expected: FAIL

**Step 4: Implement Gradle parser**

Create `src/discovery/gradle-parser.ts`:

```typescript
import type { RepositoryConfig } from "./types.js";

const WELL_KNOWN_REPOS: Record<string, RepositoryConfig> = {
  mavenCentral: { name: "Maven Central", url: "https://repo1.maven.org/maven2" },
  google: { name: "Google", url: "https://maven.google.com" },
  gradlePluginPortal: { name: "Gradle Plugin Portal", url: "https://plugins.gradle.org/m2" },
};

export function parseGradleRepositories(content: string): RepositoryConfig[] {
  const repos: RepositoryConfig[] = [];
  const seen = new Set<string>();

  function add(config: RepositoryConfig) {
    if (!seen.has(config.url)) {
      seen.add(config.url);
      repos.push(config);
    }
  }

  // Well-known: mavenCentral(), google(), gradlePluginPortal()
  for (const [funcName, config] of Object.entries(WELL_KNOWN_REPOS)) {
    const pattern = new RegExp(`\\b${funcName}\\s*\\(\\s*\\)`, "g");
    if (pattern.test(content)) {
      add(config);
    }
  }

  // maven("url") or maven('url')
  const mavenDirectRegex = /\bmaven\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = mavenDirectRegex.exec(content)) !== null) {
    add({ name: match[1], url: match[1] });
  }

  // maven(url = "url") or maven(url = 'url')
  const mavenUrlParamRegex = /\bmaven\s*\(\s*url\s*=\s*["']([^"']+)["']\s*\)/g;
  while ((match = mavenUrlParamRegex.exec(content)) !== null) {
    add({ name: match[1], url: match[1] });
  }

  // maven { url = uri("url") } or maven { url = uri('url') }
  const mavenBlockUriRegex = /\bmaven\s*\{[^}]*url\s*=\s*uri\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = mavenBlockUriRegex.exec(content)) !== null) {
    add({ name: match[1], url: match[1] });
  }

  // Groovy: maven { url 'url' } or maven { url "url" }
  const mavenBlockGroovyRegex = /\bmaven\s*\{[^}]*url\s+["']([^"']+)["']/g;
  while ((match = mavenBlockGroovyRegex.exec(content)) !== null) {
    add({ name: match[1], url: match[1] });
  }

  return repos;
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/discovery/__tests__/gradle-parser.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/discovery/
git commit -m "feat: add Gradle repository parser (Kotlin DSL + Groovy DSL)"
```

---

### Task 5: Maven (pom.xml) repository parser

**Files:**
- Create: `src/discovery/maven-parser.ts`
- Test: `src/discovery/__tests__/maven-parser.test.ts`

**Step 1: Write failing tests**

Create `src/discovery/__tests__/maven-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseMavenRepositories } from "../maven-parser.js";

describe("parseMavenRepositories", () => {
  it("parses repositories from pom.xml", () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <repositories>
    <repository>
      <id>spring-milestones</id>
      <url>https://repo.spring.io/milestone</url>
    </repository>
    <repository>
      <id>jitpack</id>
      <url>https://jitpack.io</url>
    </repository>
  </repositories>
</project>`;

    const repos = parseMavenRepositories(content);
    expect(repos).toEqual([
      { name: "spring-milestones", url: "https://repo.spring.io/milestone" },
      { name: "jitpack", url: "https://jitpack.io" },
    ]);
  });

  it("returns empty array when no repositories block", () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <groupId>com.example</groupId>
</project>`;

    const repos = parseMavenRepositories(content);
    expect(repos).toEqual([]);
  });

  it("handles repository without id", () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <repositories>
    <repository>
      <url>https://repo.spring.io/milestone</url>
    </repository>
  </repositories>
</project>`;

    const repos = parseMavenRepositories(content);
    expect(repos).toEqual([
      { name: "https://repo.spring.io/milestone", url: "https://repo.spring.io/milestone" },
    ]);
  });

  it("deduplicates by URL", () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <repositories>
    <repository>
      <id>a</id>
      <url>https://jitpack.io</url>
    </repository>
    <repository>
      <id>b</id>
      <url>https://jitpack.io</url>
    </repository>
  </repositories>
</project>`;

    const repos = parseMavenRepositories(content);
    expect(repos).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/discovery/__tests__/maven-parser.test.ts`
Expected: FAIL

**Step 3: Implement Maven parser**

Create `src/discovery/maven-parser.ts`:

```typescript
import type { RepositoryConfig } from "./types.js";

export function parseMavenRepositories(content: string): RepositoryConfig[] {
  const repos: RepositoryConfig[] = [];
  const seen = new Set<string>();

  // Match each <repository>...</repository> block inside <repositories>
  const repoBlockRegex = /<repository>([\s\S]*?)<\/repository>/g;
  let match: RegExpExecArray | null;

  while ((match = repoBlockRegex.exec(content)) !== null) {
    const block = match[1];
    const url = block.match(/<url>([^<]+)<\/url>/)?.[1]?.trim();
    if (!url) continue;

    if (seen.has(url)) continue;
    seen.add(url);

    const id = block.match(/<id>([^<]+)<\/id>/)?.[1]?.trim();
    repos.push({ name: id ?? url, url });
  }

  return repos;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/discovery/__tests__/maven-parser.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/discovery/maven-parser.ts src/discovery/__tests__/maven-parser.test.ts
git commit -m "feat: add Maven pom.xml repository parser"
```

---

### Task 6: Repository discovery orchestrator

**Files:**
- Create: `src/discovery/discover.ts`
- Test: `src/discovery/__tests__/discover.test.ts`

**Step 1: Write failing tests**

Create `src/discovery/__tests__/discover.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverRepositories } from "../discover.js";
import * as fs from "node:fs";

vi.mock("node:fs");

const mockedFs = vi.mocked(fs);

describe("discoverRepositories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("discovers repositories from settings.gradle.kts", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return p === "/project/settings.gradle.kts";
    });
    mockedFs.readFileSync.mockReturnValue(`
      dependencyResolutionManagement {
          repositories {
              google()
              mavenCentral()
          }
      }
    `);

    const result = discoverRepositories("/project");
    expect(result.buildSystem).toBe("gradle");
    expect(result.repositories).toContainEqual({
      name: "Google",
      url: "https://maven.google.com",
    });
    expect(result.repositories).toContainEqual({
      name: "Maven Central",
      url: "https://repo1.maven.org/maven2",
    });
  });

  it("discovers repositories from build.gradle.kts", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return p === "/project/build.gradle.kts";
    });
    mockedFs.readFileSync.mockReturnValue(`
      repositories {
          mavenCentral()
          maven("https://jitpack.io")
      }
    `);

    const result = discoverRepositories("/project");
    expect(result.buildSystem).toBe("gradle");
    expect(result.repositories).toHaveLength(2);
  });

  it("discovers repositories from pom.xml", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return p === "/project/pom.xml";
    });
    mockedFs.readFileSync.mockReturnValue(`
      <project>
        <repositories>
          <repository>
            <id>spring</id>
            <url>https://repo.spring.io/milestone</url>
          </repository>
        </repositories>
      </project>
    `);

    const result = discoverRepositories("/project");
    expect(result.buildSystem).toBe("maven");
    expect(result.repositories).toContainEqual({
      name: "spring",
      url: "https://repo.spring.io/milestone",
    });
  });

  it("returns unknown build system when no build files found", () => {
    mockedFs.existsSync.mockReturnValue(false);

    const result = discoverRepositories("/project");
    expect(result.buildSystem).toBe("unknown");
    expect(result.repositories).toEqual([]);
  });

  it("merges repositories from settings and build files", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return (
        p === "/project/settings.gradle.kts" ||
        p === "/project/build.gradle.kts"
      );
    });
    mockedFs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith("settings.gradle.kts")) {
        return `
          dependencyResolutionManagement {
              repositories {
                  google()
              }
          }
        `;
      }
      return `
        repositories {
            mavenCentral()
        }
      `;
    });

    const result = discoverRepositories("/project");
    expect(result.repositories).toHaveLength(2);
  });

  it("deduplicates across files", () => {
    mockedFs.existsSync.mockImplementation((p) => {
      return (
        p === "/project/settings.gradle.kts" ||
        p === "/project/build.gradle.kts"
      );
    });
    mockedFs.readFileSync.mockReturnValue(`
      repositories {
          mavenCentral()
      }
    `);

    const result = discoverRepositories("/project");
    expect(result.repositories).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/discovery/__tests__/discover.test.ts`
Expected: FAIL

**Step 3: Implement discover**

Create `src/discovery/discover.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveryResult, RepositoryConfig } from "./types.js";
import { parseGradleRepositories } from "./gradle-parser.js";
import { parseMavenRepositories } from "./maven-parser.js";

const GRADLE_FILES = [
  "settings.gradle.kts",
  "settings.gradle",
  "build.gradle.kts",
  "build.gradle",
] as const;

export function discoverRepositories(projectRoot: string): DiscoveryResult {
  const allRepos: RepositoryConfig[] = [];
  const seen = new Set<string>();
  let buildSystem: DiscoveryResult["buildSystem"] = "unknown";

  function addRepos(repos: RepositoryConfig[]) {
    for (const repo of repos) {
      if (!seen.has(repo.url)) {
        seen.add(repo.url);
        allRepos.push(repo);
      }
    }
  }

  // Try Gradle files
  for (const file of GRADLE_FILES) {
    const path = join(projectRoot, file);
    if (existsSync(path)) {
      buildSystem = "gradle";
      try {
        const content = readFileSync(path, "utf-8");
        addRepos(parseGradleRepositories(content));
      } catch {
        // Log and continue
        console.error(`Failed to parse ${path}`);
      }
    }
  }

  // Try Maven pom.xml (only if no Gradle files found)
  if (buildSystem === "unknown") {
    const pomPath = join(projectRoot, "pom.xml");
    if (existsSync(pomPath)) {
      buildSystem = "maven";
      try {
        const content = readFileSync(pomPath, "utf-8");
        addRepos(parseMavenRepositories(content));
      } catch {
        console.error(`Failed to parse ${pomPath}`);
      }
    }
  }

  return {
    repositories: allRepos,
    buildSystem,
    projectRoot,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/discovery/__tests__/discover.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/discovery/discover.ts src/discovery/__tests__/discover.test.ts
git commit -m "feat: add repository discovery orchestrator"
```

---

### Task 7: Update tools to use MavenRepository[] instead of MavenCentralClient

**Files:**
- Modify: `src/tools/get-latest-version.ts`
- Modify: `src/tools/check-version-exists.ts`
- Modify: `src/tools/check-multiple-dependencies.ts`
- Modify: `src/tools/compare-dependency-versions.ts`
- Modify: `src/tools/__tests__/get-latest-version.test.ts`
- Modify: `src/tools/__tests__/check-version-exists.test.ts`
- Modify: `src/tools/__tests__/check-multiple-dependencies.test.ts`
- Modify: `src/tools/__tests__/compare-dependency-versions.test.ts`

**Step 1: Update get-latest-version tests**

Replace `src/tools/__tests__/get-latest-version.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getLatestVersionHandler } from "../get-latest-version.js";
import type { MavenRepository } from "../../maven/repository.js";

function mockRepo(name: string, versions: string[]): MavenRepository {
  return {
    name,
    url: `https://${name}.example.com`,
    fetchMetadata: vi.fn().mockResolvedValue({
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      versions,
      latest: versions[versions.length - 1],
      release: versions[versions.length - 1],
    }),
  };
}

describe("getLatestVersionHandler", () => {
  it("returns latest stable version with STABLE_ONLY filter", async () => {
    const repos = [mockRepo("central", ["1.0.0", "2.0.0-beta1", "2.0.0-RC1", "1.5.0"])];
    const result = await getLatestVersionHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      stabilityFilter: "STABLE_ONLY",
    });
    expect(result.latestVersion).toBe("1.5.0");
    expect(result.stability).toBe("stable");
  });

  it("returns latest version with ALL filter", async () => {
    const repos = [mockRepo("central", ["1.0.0", "2.0.0-beta1", "2.0.0-RC1"])];
    const result = await getLatestVersionHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      stabilityFilter: "ALL",
    });
    expect(result.latestVersion).toBe("2.0.0-RC1");
  });

  it("prefers stable with PREFER_STABLE filter", async () => {
    const repos = [mockRepo("central", ["1.0.0", "2.0.0-beta1"])];
    const result = await getLatestVersionHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      stabilityFilter: "PREFER_STABLE",
    });
    expect(result.latestVersion).toBe("1.0.0");
    expect(result.stability).toBe("stable");
  });

  it("falls back to unstable with PREFER_STABLE when no stable exists", async () => {
    const repos = [mockRepo("central", ["1.0.0-alpha1", "2.0.0-beta1"])];
    const result = await getLatestVersionHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      stabilityFilter: "PREFER_STABLE",
    });
    expect(result.latestVersion).toBe("2.0.0-beta1");
  });

  it("aggregates versions from multiple repos", async () => {
    const repos = [
      mockRepo("google", ["1.0.0"]),
      mockRepo("central", ["1.0.0", "2.0.0"]),
    ];
    const result = await getLatestVersionHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      stabilityFilter: "ALL",
    });
    expect(result.latestVersion).toBe("2.0.0");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tools/__tests__/get-latest-version.test.ts`
Expected: FAIL — function signature changed

**Step 3: Update get-latest-version implementation**

Replace `src/tools/get-latest-version.ts`:

```typescript
import { classifyVersion } from "../version/classify.js";
import type { StabilityFilter } from "../version/types.js";
import type { MavenRepository } from "../maven/repository.js";
import { resolveAll } from "../maven/resolver.js";

export interface GetLatestVersionInput {
  groupId: string;
  artifactId: string;
  stabilityFilter?: StabilityFilter;
}

export interface GetLatestVersionResult {
  groupId: string;
  artifactId: string;
  latestVersion: string;
  stability: string;
  allVersionsCount: number;
}

export async function getLatestVersionHandler(
  repos: MavenRepository[],
  input: GetLatestVersionInput,
): Promise<GetLatestVersionResult> {
  const metadata = await resolveAll(repos, input.groupId, input.artifactId);
  const filter = input.stabilityFilter ?? "PREFER_STABLE";
  const versions = [...metadata.versions].reverse();

  let selected: string | undefined;

  if (filter === "ALL") {
    selected = versions[0];
  } else if (filter === "STABLE_ONLY") {
    selected = versions.find((v) => classifyVersion(v) === "stable");
    if (!selected) {
      throw new Error(
        `No stable version found for ${input.groupId}:${input.artifactId}`,
      );
    }
  } else {
    // PREFER_STABLE
    selected = versions.find((v) => classifyVersion(v) === "stable") ?? versions[0];
  }

  return {
    groupId: input.groupId,
    artifactId: input.artifactId,
    latestVersion: selected!,
    stability: classifyVersion(selected!),
    allVersionsCount: metadata.versions.length,
  };
}
```

**Step 4: Run get-latest-version tests**

Run: `npx vitest run src/tools/__tests__/get-latest-version.test.ts`
Expected: All PASS

**Step 5: Update check-version-exists tests**

Replace `src/tools/__tests__/check-version-exists.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { checkVersionExistsHandler } from "../check-version-exists.js";
import type { MavenRepository } from "../../maven/repository.js";

function mockRepo(name: string, versions: string[] | null): MavenRepository {
  return {
    name,
    url: `https://${name}.example.com`,
    fetchMetadata: versions === null
      ? vi.fn().mockRejectedValue(new Error("Not found"))
      : vi.fn().mockResolvedValue({
          groupId: "io.ktor",
          artifactId: "ktor-server-core",
          versions,
        }),
  };
}

describe("checkVersionExistsHandler", () => {
  it("returns true and stability for existing version", async () => {
    const repos = [mockRepo("central", ["1.0.0", "2.0.0-beta1"])];
    const result = await checkVersionExistsHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      version: "1.0.0",
    });
    expect(result.exists).toBe(true);
    expect(result.stability).toBe("stable");
    expect(result.repository).toBe("central");
  });

  it("returns false for non-existing version", async () => {
    const repos = [mockRepo("central", ["1.0.0"])];
    const result = await checkVersionExistsHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      version: "9.9.9",
    });
    expect(result.exists).toBe(false);
  });

  it("finds version in second repo", async () => {
    const repos = [
      mockRepo("google", null),
      mockRepo("central", ["1.0.0"]),
    ];
    const result = await checkVersionExistsHandler(repos, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      version: "1.0.0",
    });
    expect(result.exists).toBe(true);
    expect(result.repository).toBe("central");
  });
});
```

**Step 6: Update check-version-exists implementation**

Replace `src/tools/check-version-exists.ts`:

```typescript
import { classifyVersion } from "../version/classify.js";
import type { MavenRepository } from "../maven/repository.js";
import { resolveFirst } from "../maven/resolver.js";

export interface CheckVersionExistsInput {
  groupId: string;
  artifactId: string;
  version: string;
}

export interface CheckVersionExistsResult {
  groupId: string;
  artifactId: string;
  version: string;
  exists: boolean;
  stability?: string;
  repository?: string;
}

export async function checkVersionExistsHandler(
  repos: MavenRepository[],
  input: CheckVersionExistsInput,
): Promise<CheckVersionExistsResult> {
  const resolved = await resolveFirst(repos, input.groupId, input.artifactId);

  if (!resolved) {
    return {
      groupId: input.groupId,
      artifactId: input.artifactId,
      version: input.version,
      exists: false,
    };
  }

  const exists = resolved.metadata.versions.includes(input.version);

  return {
    groupId: input.groupId,
    artifactId: input.artifactId,
    version: input.version,
    exists,
    stability: exists ? classifyVersion(input.version) : undefined,
    repository: exists ? resolved.repository.name : undefined,
  };
}
```

**Step 7: Run check-version-exists tests**

Run: `npx vitest run src/tools/__tests__/check-version-exists.test.ts`
Expected: All PASS

**Step 8: Update check-multiple-dependencies tests**

Replace `src/tools/__tests__/check-multiple-dependencies.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { checkMultipleDependenciesHandler } from "../check-multiple-dependencies.js";
import type { MavenRepository } from "../../maven/repository.js";

describe("checkMultipleDependenciesHandler", () => {
  it("returns latest versions for multiple dependencies", async () => {
    const repo: MavenRepository = {
      name: "central",
      url: "https://repo1.maven.org/maven2",
      fetchMetadata: vi.fn()
        .mockResolvedValueOnce({
          groupId: "io.ktor",
          artifactId: "ktor-server-core",
          versions: ["2.0.0", "3.0.0"],
        })
        .mockResolvedValueOnce({
          groupId: "org.jetbrains.kotlin",
          artifactId: "kotlin-stdlib",
          versions: ["1.9.0", "2.0.0"],
        }),
    };

    const result = await checkMultipleDependenciesHandler([repo], {
      dependencies: [
        { groupId: "io.ktor", artifactId: "ktor-server-core" },
        { groupId: "org.jetbrains.kotlin", artifactId: "kotlin-stdlib" },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].latestVersion).toBe("3.0.0");
    expect(result.results[1].latestVersion).toBe("2.0.0");
  });
});
```

**Step 9: Update check-multiple-dependencies implementation**

Replace `src/tools/check-multiple-dependencies.ts`:

```typescript
import { classifyVersion } from "../version/classify.js";
import type { MavenRepository } from "../maven/repository.js";
import { resolveAll } from "../maven/resolver.js";

interface Dependency {
  groupId: string;
  artifactId: string;
}

export interface CheckMultipleDependenciesInput {
  dependencies: Dependency[];
}

export interface DependencyResult {
  groupId: string;
  artifactId: string;
  latestVersion: string;
  stability: string;
  error?: string;
}

export interface CheckMultipleDependenciesResult {
  results: DependencyResult[];
}

export async function checkMultipleDependenciesHandler(
  repos: MavenRepository[],
  input: CheckMultipleDependenciesInput,
): Promise<CheckMultipleDependenciesResult> {
  const results = await Promise.all(
    input.dependencies.map(async (dep) => {
      try {
        const metadata = await resolveAll(repos, dep.groupId, dep.artifactId);
        const versions = [...metadata.versions].reverse();
        const latest = versions.find((v) => classifyVersion(v) === "stable") ?? versions[0];
        return {
          groupId: dep.groupId,
          artifactId: dep.artifactId,
          latestVersion: latest,
          stability: classifyVersion(latest),
        };
      } catch (e) {
        return {
          groupId: dep.groupId,
          artifactId: dep.artifactId,
          latestVersion: "",
          stability: "",
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  return { results };
}
```

**Step 10: Update compare-dependency-versions tests**

Replace `src/tools/__tests__/compare-dependency-versions.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { compareDependencyVersionsHandler } from "../compare-dependency-versions.js";
import type { MavenRepository } from "../../maven/repository.js";

describe("compareDependencyVersionsHandler", () => {
  it("compares current versions against latest", async () => {
    const repo: MavenRepository = {
      name: "central",
      url: "https://repo1.maven.org/maven2",
      fetchMetadata: vi.fn()
        .mockResolvedValueOnce({
          groupId: "io.ktor",
          artifactId: "ktor-server-core",
          versions: ["2.0.0", "3.0.0", "3.1.0"],
        })
        .mockResolvedValueOnce({
          groupId: "org.slf4j",
          artifactId: "slf4j-api",
          versions: ["2.0.0", "2.0.1"],
        }),
    };

    const result = await compareDependencyVersionsHandler([repo], {
      dependencies: [
        { groupId: "io.ktor", artifactId: "ktor-server-core", currentVersion: "2.0.0" },
        { groupId: "org.slf4j", artifactId: "slf4j-api", currentVersion: "2.0.0" },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].upgradeType).toBe("major");
    expect(result.results[0].latestVersion).toBe("3.1.0");
    expect(result.results[1].upgradeType).toBe("patch");
  });
});
```

**Step 11: Update compare-dependency-versions implementation**

Replace `src/tools/compare-dependency-versions.ts`:

```typescript
import { classifyVersion } from "../version/classify.js";
import { getUpgradeType } from "../version/compare.js";
import type { MavenRepository } from "../maven/repository.js";
import { resolveAll } from "../maven/resolver.js";

interface DependencyWithVersion {
  groupId: string;
  artifactId: string;
  currentVersion: string;
}

export interface CompareDependencyVersionsInput {
  dependencies: DependencyWithVersion[];
}

export interface CompareResult {
  groupId: string;
  artifactId: string;
  currentVersion: string;
  latestVersion: string;
  latestStability: string;
  upgradeType: string;
  upgradeAvailable: boolean;
  error?: string;
}

export interface CompareDependencyVersionsResult {
  results: CompareResult[];
  summary: { total: number; upgradeable: number; major: number; minor: number; patch: number };
}

export async function compareDependencyVersionsHandler(
  repos: MavenRepository[],
  input: CompareDependencyVersionsInput,
): Promise<CompareDependencyVersionsResult> {
  const results = await Promise.all(
    input.dependencies.map(async (dep) => {
      try {
        const metadata = await resolveAll(repos, dep.groupId, dep.artifactId);
        const versions = [...metadata.versions].reverse();
        const latest = versions.find((v) => classifyVersion(v) === "stable") ?? versions[0];
        const upgradeType = getUpgradeType(dep.currentVersion, latest);

        return {
          groupId: dep.groupId,
          artifactId: dep.artifactId,
          currentVersion: dep.currentVersion,
          latestVersion: latest,
          latestStability: classifyVersion(latest),
          upgradeType,
          upgradeAvailable: upgradeType !== "none",
        };
      } catch (e) {
        return {
          groupId: dep.groupId,
          artifactId: dep.artifactId,
          currentVersion: dep.currentVersion,
          latestVersion: "",
          latestStability: "",
          upgradeType: "none",
          upgradeAvailable: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  const summary = {
    total: results.length,
    upgradeable: results.filter((r) => r.upgradeAvailable).length,
    major: results.filter((r) => r.upgradeType === "major").length,
    minor: results.filter((r) => r.upgradeType === "minor").length,
    patch: results.filter((r) => r.upgradeType === "patch").length,
  };

  return { results, summary };
}
```

**Step 12: Run all tool tests**

Run: `npx vitest run src/tools/`
Expected: All PASS

**Step 13: Commit**

```bash
git add src/tools/
git commit -m "refactor: update all tools to use MavenRepository[] instead of MavenCentralClient"
```

---

### Task 8: Update index.ts — wire everything together

**Files:**
- Modify: `src/index.ts`

**Step 1: Rewrite index.ts**

Replace `src/index.ts`:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HttpMavenRepository, MAVEN_CENTRAL } from "./maven/repository.js";
import type { MavenRepository } from "./maven/repository.js";
import { findProjectRoot } from "./project/find-project-root.js";
import { discoverRepositories } from "./discovery/discover.js";
import { getLatestVersionHandler } from "./tools/get-latest-version.js";
import { checkVersionExistsHandler } from "./tools/check-version-exists.js";
import { checkMultipleDependenciesHandler } from "./tools/check-multiple-dependencies.js";
import { compareDependencyVersionsHandler } from "./tools/compare-dependency-versions.js";

const server = new McpServer({
  name: "maven-central-mcp",
  version: "0.2.0",
});

let cachedRepos: MavenRepository[] | null = null;

function getRepositories(): MavenRepository[] {
  if (cachedRepos) return cachedRepos;

  const repos: MavenRepository[] = [];
  const projectRoot = findProjectRoot(process.cwd());

  if (projectRoot) {
    const discovery = discoverRepositories(projectRoot);
    console.error(`Discovered ${discovery.repositories.length} repositories from ${discovery.buildSystem} project at ${projectRoot}`);
    for (const config of discovery.repositories) {
      repos.push(new HttpMavenRepository(config.name, config.url));
    }
  }

  // Maven Central always last as fallback (skip if already discovered)
  if (!repos.some((r) => r.url === MAVEN_CENTRAL.url)) {
    repos.push(MAVEN_CENTRAL);
  }

  cachedRepos = repos;
  return repos;
}

server.tool(
  "get_latest_version",
  "Find the latest version of a Maven artifact with stability-aware selection",
  {
    groupId: z.string().describe("Maven group ID (e.g. io.ktor)"),
    artifactId: z.string().describe("Maven artifact ID (e.g. ktor-server-core)"),
    stabilityFilter: z
      .enum(["STABLE_ONLY", "PREFER_STABLE", "ALL"])
      .optional()
      .describe("Version stability filter (default: PREFER_STABLE)"),
  },
  async (params) => {
    const result = await getLatestVersionHandler(getRepositories(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "check_version_exists",
  "Verify a specific version exists and classify its stability",
  {
    groupId: z.string().describe("Maven group ID"),
    artifactId: z.string().describe("Maven artifact ID"),
    version: z.string().describe("Version to check"),
  },
  async (params) => {
    const result = await checkVersionExistsHandler(getRepositories(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "check_multiple_dependencies",
  "Bulk lookup of latest versions for a list of Maven dependencies",
  {
    dependencies: z.array(z.object({
      groupId: z.string().describe("Maven group ID"),
      artifactId: z.string().describe("Maven artifact ID"),
    })).describe("List of dependencies to check"),
  },
  async (params) => {
    const result = await checkMultipleDependenciesHandler(getRepositories(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "compare_dependency_versions",
  "Compare current dependency versions against latest available, showing upgrade type (major/minor/patch)",
  {
    dependencies: z.array(z.object({
      groupId: z.string().describe("Maven group ID"),
      artifactId: z.string().describe("Maven artifact ID"),
      currentVersion: z.string().describe("Currently used version"),
    })).describe("Dependencies with current versions to compare"),
  },
  async (params) => {
    const result = await compareDependencyVersionsHandler(getRepositories(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("maven-central-mcp running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: Build and run all tests**

Run: `npm run build && npx vitest run`
Expected: All PASS, no compile errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire multi-repository support into MCP server"
```

---

### Task 9: Delete old MavenCentralClient

**Files:**
- Delete: `src/maven/client.ts`
- Delete: `src/maven/__tests__/client.test.ts`

**Step 1: Remove old files**

```bash
rm src/maven/client.ts src/maven/__tests__/client.test.ts
```

**Step 2: Verify no imports reference the old client**

Run: `grep -r "maven/client" src/`
Expected: No results

**Step 3: Build and run all tests**

Run: `npm run build && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy MavenCentralClient"
```

---

### Task 10: Smoke test

**Step 1: Full build and test**

Run: `npm run build && npx vitest run`
Expected: All pass

**Step 2: Manual smoke test**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```
Expected: JSON response with server capabilities

**Step 3: Commit any remaining changes**

If there are any uncommitted changes, commit them.
