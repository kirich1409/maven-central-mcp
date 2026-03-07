import type { MavenMetadata, MavenSearchResponse } from "./types.js";

const SEARCH_BASE = "https://search.maven.org/solrsearch/select";
const REPO_BASE = "https://repo1.maven.org/maven2";

export class MavenCentralClient {
  buildSearchUrl(groupId: string, artifactId: string, rows: number): string {
    return `${SEARCH_BASE}?q=g:${groupId}+AND+a:${artifactId}&rows=${rows}&wt=json`;
  }

  buildMetadataUrl(groupId: string, artifactId: string): string {
    const groupPath = groupId.replace(/\./g, "/");
    return `${REPO_BASE}/${groupPath}/${artifactId}/maven-metadata.xml`;
  }

  async searchArtifact(groupId: string, artifactId: string): Promise<MavenSearchResponse> {
    const url = this.buildSearchUrl(groupId, artifactId, 1);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Maven Central search failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<MavenSearchResponse>;
  }

  async fetchMetadata(groupId: string, artifactId: string): Promise<MavenMetadata> {
    const url = this.buildMetadataUrl(groupId, artifactId);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Maven Central metadata fetch failed: ${response.status} ${response.statusText}`);
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
