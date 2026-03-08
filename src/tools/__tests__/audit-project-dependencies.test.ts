import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditProjectDependenciesHandler } from "../audit-project-dependencies.js";
import * as fs from "node:fs";
import type { MavenRepository } from "../../maven/repository.js";

vi.mock("node:fs");
const mockedFs = vi.mocked(fs);

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockRepo(versions: string[]): MavenRepository {
  return {
    name: "central",
    url: "https://repo1.maven.org/maven2",
    fetchMetadata: vi.fn().mockResolvedValue({
      groupId: "io.ktor", artifactId: "ktor-client-core", versions,
      latest: versions[versions.length - 1],
      release: versions[versions.length - 1],
    }),
  };
}

describe("auditProjectDependenciesHandler", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("scans, compares, and checks vulnerabilities", async () => {
    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      if (p.toString().endsWith("build.gradle.kts")) return true;
      return false;
    });
    mockedFs.readFileSync.mockReturnValue(`
dependencies {
    implementation("io.ktor:ktor-client-core:3.0.0")
}`);

    // OSV response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [{ vulns: [] }] }),
    });

    const repos = [mockRepo(["3.0.0", "3.1.0", "3.1.1"])];
    const result = await auditProjectDependenciesHandler(repos, {
      projectPath: "/project",
      includeVulnerabilities: true,
    });

    expect(result.summary.total).toBe(1);
    expect(result.summary.upgradeable).toBe(1);
    expect(result.dependencies[0].currentVersion).toBe("3.0.0");
    expect(result.dependencies[0].latestVersion).toBe("3.1.1");
    expect(result.dependencies[0].upgradeType).toBe("minor");
  });

  it("skips deps without version", async () => {
    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      if (p.toString().endsWith("build.gradle.kts")) return true;
      return false;
    });
    mockedFs.readFileSync.mockReturnValue(`implementation("io.ktor:ktor-bom")`);

    const repos = [mockRepo([])];
    const result = await auditProjectDependenciesHandler(repos, { projectPath: "/project" });

    expect(result.summary.total).toBe(1);
    expect(result.dependencies[0].upgradeType).toBeUndefined();
  });
});
