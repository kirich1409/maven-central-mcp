import { describe, it, expect, vi } from "vitest";
import { compareDependencyVersionsHandler } from "../compare-dependency-versions.js";
import type { MavenCentralClient } from "../../maven/client.js";

describe("compareDependencyVersionsHandler", () => {
  it("compares current versions against latest", async () => {
    const client = {
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
    } as unknown as MavenCentralClient;

    const result = await compareDependencyVersionsHandler(client, {
      dependencies: [
        { groupId: "io.ktor", artifactId: "ktor-server-core", currentVersion: "2.0.0" },
        { groupId: "org.slf4j", artifactId: "slf4j-api", currentVersion: "2.0.0" },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].upgradeType).toBe("major");
    expect(result.results[0].latestVersion).toBe("3.1.0");
    expect(result.results[1].upgradeType).toBe("patch");
    expect(result.summary.total).toBe(2);
    expect(result.summary.upgradeable).toBe(2);
    expect(result.summary.major).toBe(1);
    expect(result.summary.patch).toBe(1);
  });

  it("reports none for up-to-date dependencies", async () => {
    const client = {
      fetchMetadata: vi.fn().mockResolvedValue({
        groupId: "io.ktor",
        artifactId: "ktor-server-core",
        versions: ["3.1.0"],
      }),
    } as unknown as MavenCentralClient;

    const result = await compareDependencyVersionsHandler(client, {
      dependencies: [
        { groupId: "io.ktor", artifactId: "ktor-server-core", currentVersion: "3.1.0" },
      ],
    });

    expect(result.results[0].upgradeType).toBe("none");
    expect(result.results[0].upgradeAvailable).toBe(false);
    expect(result.summary.upgradeable).toBe(0);
  });
});
