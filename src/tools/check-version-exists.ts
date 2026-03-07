import { classifyVersion } from "../version/classify.js";
import type { MavenCentralClient } from "../maven/client.js";

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
}

export async function checkVersionExistsHandler(
  client: MavenCentralClient,
  input: CheckVersionExistsInput,
): Promise<CheckVersionExistsResult> {
  const metadata = await client.fetchMetadata(input.groupId, input.artifactId);
  const exists = metadata.versions.includes(input.version);

  return {
    groupId: input.groupId,
    artifactId: input.artifactId,
    version: input.version,
    exists,
    stability: exists ? classifyVersion(input.version) : undefined,
  };
}
