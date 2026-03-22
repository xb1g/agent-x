#!/bin/bash
set -e

cd /Users/bunyasit/dev/agent-x

# Install dependencies (idempotent)
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Kill any existing dev server on port 3100 (idempotent)
lsof -ti :3100 | xargs kill 2>/dev/null || true

# Kill any existing dev server on port 3000 that might interfere
# (Next.js refuses to start if another next dev is running)
lsof -ti :3000 | xargs kill 2>/dev/null || true

echo "Init complete"
