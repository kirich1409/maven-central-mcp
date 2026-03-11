# krozov-ai-tools

Collection of Claude Code plugins and AI tools by Kirill Rozov.

## Plugins

### maven-mcp

Maven dependency intelligence — auto-registers MCP server for Claude Code.

```bash
npx @krozov/maven-central-mcp
```

See [`plugins/maven-mcp/`](plugins/maven-mcp/) for full documentation.

### sensitive-guard

Scans files for secrets and PII before they reach AI servers. PreToolUse hook using gitleaks + custom regex patterns.

See [`plugins/sensitive-guard/`](plugins/sensitive-guard/) for full documentation.

## License

MIT
