// Composite builds (`includeBuild`) and layout overrides are not supported.
export function parseSettingsGradleModules(content: string): string[] {
  const modules: string[] = [];

  // Kotlin DSL: include(":app", ":lib:core") — also matches Groovy include("…")
  const parenRegex = /\binclude\s*\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(content)) !== null) {
    modules.push(...splitArgs(match[1]));
  }

  // Groovy DSL: include ':app', ':lib' (bare args, no parentheses)
  const bareRegex = /\binclude\s+((?:["'][^"']+["']\s*,?\s*)+)/g;
  while ((match = bareRegex.exec(content)) !== null) {
    modules.push(...splitArgs(match[1]));
  }

  return [...new Set(modules)];
}

function splitArgs(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
    .filter((s) => s.length > 0);
}
