export interface MavenSearchResponse {
  response: {
    numFound: number;
    docs: MavenArtifact[];
  };
}

export interface MavenArtifact {
  id: string;
  g: string;
  a: string;
  v: string;
  latestVersion: string;
  timestamp: number;
  versionCount: number;
}

export interface MavenMetadata {
  groupId: string;
  artifactId: string;
  versions: string[];
  latest?: string;
  release?: string;
  lastUpdated?: string;
}
