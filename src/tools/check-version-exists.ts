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
