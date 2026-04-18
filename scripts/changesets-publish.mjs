#!/usr/bin/env node
// Wrapper around publishing.
//
// 1. Conditionally runs `npm publish --access public` from plugins/maven-mcp
//    (the only npm-published plugin). Before publishing, queries the npm
//    registry to check whether the current version already exists; if it does,
//    skip the publish (idempotent across re-runs and safe on no-bump cycles
//    such as the post-cutover empty-changeset run). Real registry errors
//    (network, auth) abort — better fail loudly than risk double-publish or
//    silent skip on outage.
// 2. Creates per-plugin git tags `{plugin}--v{version}` for every entry in
//    marketplace.json. Skips tags that already exist (idempotent). Tags are
//    independent of npm publishing and are created on every run.
// 3. Pushes all newly-created tags in a single batch.
// 4. Prints a JSON array `[{name, version}]` to stdout for changesets/action's
//    publishedPackages output. Contains maven-mcp only when it was actually
//    published this run; empty array otherwise.
//
// Invoked by changesets/action@v1 as the `publish:` script after the Version
// Packages PR has been merged.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MARKETPLACE_PATH } from "./plugin-map.mjs";

const cwd = process.cwd();

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd, ...opts });
  if (r.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function silent(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "ignore", cwd, ...opts });
}

const marketplace = JSON.parse(
  await readFile(path.join(cwd, MARKETPLACE_PATH), "utf8")
);

// 1. Publish maven-mcp to npm — but only if its current version isn't already
//    on the registry. Gates ONLY the `npm publish` line, not the tag loop
//    below (per-plugin tags must be created idempotently every run).
const mavenMcpDir = path.join(cwd, "plugins/maven-mcp");
const mavenMcpPkg = JSON.parse(
  await readFile(path.join(mavenMcpDir, "package.json"), "utf8")
);
const mavenMcpName = mavenMcpPkg.name; // @krozov/maven-central-mcp
const mavenMcpVersion = mavenMcpPkg.version;

// Probe the npm registry. `npm view <name>@<version> version --json`:
//   - exit 0, non-empty stdout → version already published, skip.
//   - exit non-zero with "E404" / no match → version not on registry, publish.
//   - any other failure (network, auth) → abort, do not assume safety.
const probe = spawnSync(
  "npm",
  ["view", `${mavenMcpName}@${mavenMcpVersion}`, "version", "--json"],
  { stdio: ["ignore", "pipe", "pipe"], cwd }
);
const probeStdout = (probe.stdout?.toString() ?? "").trim();
const probeStderr = (probe.stderr?.toString() ?? "").trim();

let published = false;
if (probe.status === 0 && probeStdout.length > 0) {
  console.log(
    `Skip npm publish: ${mavenMcpName}@${mavenMcpVersion} already on registry`
  );
} else if (probe.status !== 0 && /E404|no such package|not in this registry/i.test(probeStderr)) {
  // Genuine "version not published yet" — proceed with publish.
  run("npm", ["publish", "--access", "public"], { cwd: mavenMcpDir });
  published = true;
} else if (probe.status === 0 && probeStdout.length === 0) {
  // npm view returned nothing (no matching version) — treat as not published.
  run("npm", ["publish", "--access", "public"], { cwd: mavenMcpDir });
  published = true;
} else {
  // Anything else (network, auth, registry outage) — abort.
  console.error(
    `npm view probe failed for ${mavenMcpName}@${mavenMcpVersion} (exit ${probe.status}):`
  );
  console.error(probeStderr || "(no stderr)");
  process.exit(probe.status ?? 1);
}

// 2. Configure git identity (CI environment only).
run("git", ["config", "user.name", "github-actions[bot]"]);
run("git", [
  "config",
  "user.email",
  "41898282+github-actions[bot]@users.noreply.github.com"
]);

// Fetch all tags so the idempotency check sees sibling per-plugin tags
// from previous releases. actions/checkout otherwise gives us a sparse view.
run("git", ["fetch", "--tags", "--quiet", "origin"]);

// plugin.name comes from marketplace.json, validated by validate.sh's
// check_name_consistency. Do not source plugin names from changeset content —
// they end up as git refs and shell args.
const tagsToPush = [];
for (const plugin of marketplace.plugins) {
  const tag = `${plugin.name}--v${plugin.version}`;
  const exists = silent("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
  if (exists.status === 0) {
    console.log(`Tag ${tag} already exists, skipping`);
    continue;
  }
  run("git", ["tag", "-a", tag, "-m", `Release ${plugin.name} ${plugin.version}`]);
  tagsToPush.push(tag);
}

// 3. Push all new tags in a single round-trip.
if (tagsToPush.length > 0) {
  run("git", ["push", "origin", ...tagsToPush]);
  for (const tag of tagsToPush) console.log(`Pushed ${tag}`);
} else {
  console.log("No new per-plugin tags to push");
}

// 4. Output JSON for changesets/action to consume (publishedPackages output).
//    Only includes packages actually published THIS run. maven-mcp is the only
//    npm-published plugin today; if it was skipped above, emit `[]`.
const publishedPackages = published
  ? [{ name: mavenMcpName, version: mavenMcpVersion }]
  : [];
console.log(JSON.stringify(publishedPackages));
