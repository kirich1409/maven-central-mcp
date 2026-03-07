# maven-central-mcp

MCP server for Maven Central dependency intelligence. Provides AI assistants with structured, live dependency data from Maven Central.

Works with any JVM build tool that uses Maven Central coordinates (Maven, Gradle, SBT, etc).

## Quick Start

```bash
npx maven-central-mcp
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "maven-central": {
      "command": "npx",
      "args": ["maven-central-mcp"]
    }
  }
}
```

### VS Code

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "maven-central": {
      "type": "stdio",
      "command": "npx",
      "args": ["maven-central-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `get_latest_version` | Find the latest version with stability-aware selection (STABLE_ONLY / PREFER_STABLE / ALL) |
| `check_version_exists` | Verify a specific version exists and classify its stability |
| `check_multiple_dependencies` | Bulk lookup of latest versions for a list of dependencies |
| `compare_dependency_versions` | Compare current versions against latest, with upgrade type (major/minor/patch) |

## Version Stability

Versions are classified as: `stable`, `rc`, `beta`, `alpha`, `milestone`, or `snapshot`.

## License

MIT
