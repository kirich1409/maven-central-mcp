// Extracts Maven submodule directory names from a parent pom.xml — the
// <module> entries inside <modules>. Regex-based, mirroring the idiom in
// discovery/maven-parser.ts. Limitations: profile-activated <modules> blocks
// are still scanned (worst case = false-positive scan), but the resulting
// paths must exist on disk to be picked up.

export function parseMavenModules(content: string): string[] {
  const modulesBlockRegex = /<modules>([\s\S]*?)<\/modules>/g;
  const out: string[] = [];
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = modulesBlockRegex.exec(content)) !== null) {
    const inner = blockMatch[1];
    const moduleRegex = /<module>([^<]+)<\/module>/g;
    let m: RegExpExecArray | null;
    while ((m = moduleRegex.exec(inner)) !== null) {
      const name = m[1].trim();
      if (name) out.push(name);
    }
  }

  return [...new Set(out)];
}
