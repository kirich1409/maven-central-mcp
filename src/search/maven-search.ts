const SEARCH_API = "https://search.maven.org/solrsearch/select";

export interface SearchArtifact {
  groupId: string;
  artifactId: string;
  latestVersion: string;
  versionCount: number;
}

export async function searchMavenCentral(
  query: string,
  limit: number = 10,
): Promise<SearchArtifact[]> {
  try {
    const url = `${SEARCH_API}?q=${encodeURIComponent(query)}&rows=${limit}&wt=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const data = await response.json();
    return data.response.docs.map((doc: any) => ({
      groupId: doc.g,
      artifactId: doc.a,
      latestVersion: doc.latestVersion,
      versionCount: doc.versionCount,
    }));
  } catch {
    return [];
  }
}
