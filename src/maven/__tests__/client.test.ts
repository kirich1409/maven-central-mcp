import { describe, it, expect, vi, beforeEach } from "vitest";
import { MavenCentralClient } from "../client.js";

describe("MavenCentralClient", () => {
  let client: MavenCentralClient;

  beforeEach(() => {
    client = new MavenCentralClient();
  });

  it("builds correct search URL", () => {
    const url = client.buildSearchUrl("io.ktor", "ktor-server-core", 10);
    expect(url).toBe(
      "https://search.maven.org/solrsearch/select?q=g:io.ktor+AND+a:ktor-server-core&rows=10&wt=json"
    );
  });

  it("builds correct metadata URL", () => {
    const url = client.buildMetadataUrl("io.ktor", "ktor-server-core");
    expect(url).toBe(
      "https://repo1.maven.org/maven2/io/ktor/ktor-server-core/maven-metadata.xml"
    );
  });

  it("parses metadata XML correctly", () => {
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

    const result = client.parseMetadataXml(xml, "io.ktor", "ktor-server-core");
    expect(result.groupId).toBe("io.ktor");
    expect(result.artifactId).toBe("ktor-server-core");
    expect(result.versions).toEqual(["2.0.0", "3.0.0", "3.1.1"]);
    expect(result.latest).toBe("3.1.1");
    expect(result.release).toBe("3.1.1");
  });
});
