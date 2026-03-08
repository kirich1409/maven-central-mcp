#!/bin/bash
set -e

# Resolve project root (one level up from plugin/)
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Install dependencies if missing
if [ ! -d node_modules ]; then
  npm ci --ignore-scripts 2>/dev/null
fi

# Build if dist is missing
if [ ! -f dist/index.js ]; then
  npm run build 2>/dev/null
fi

exec node dist/index.js
