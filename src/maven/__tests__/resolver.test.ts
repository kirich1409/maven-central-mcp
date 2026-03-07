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
