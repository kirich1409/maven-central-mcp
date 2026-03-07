import { describe, it, expect, vi } from "vitest";
import { checkVersionExistsHandler } from "../check-version-exists.js";
import type { MavenCentralClient } from "../../maven/client.js";

function mockClient(versions: string[]): MavenCentralClient {
  return {
    fetchMetadata: vi.fn().mockResolvedValue({
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      versions,
    }),
  } as unknown as MavenCentralClient;
}

describe("checkVersionExistsHandler", () => {
  it("returns true and stability for existing version", async () => {
    const client = mockClient(["1.0.0", "2.0.0-beta1"]);
    const result = await checkVersionExistsHandler(client, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      version: "1.0.0",
    });
    expect(result.exists).toBe(true);
    expect(result.stability).toBe("stable");
  });

  it("returns false for non-existing version", async () => {
    const client = mockClient(["1.0.0"]);
    const result = await checkVersionExistsHandler(client, {
      groupId: "io.ktor",
      artifactId: "ktor-server-core",
      version: "9.9.9",
    });
    expect(result.exists).toBe(false);
  });
});
