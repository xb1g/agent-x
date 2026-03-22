#!/bin/bash
set -e

cd /Users/bunyasit/dev/agent-x

# Kill any existing dev servers that would block new ones
lsof -ti :3100 | xargs kill 2>/dev/null || true
lsof -ti :3000 | xargs kill 2>/dev/null || true

# Install deps if needed
if [ ! -d node_modules ]; then
  pnpm install
fi

echo "Init complete"
