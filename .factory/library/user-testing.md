# User Testing

Testing surface, required tools, and resource cost classification.

---

## Validation Surface

- **Primary surface**: Web browser (Next.js app at http://localhost:3100)
- **Tool**: agent-browser CLI (installed at `/Users/bunyasit/.factory/bin/agent-browser`)
- **Dev server**: `PORT=3100 pnpm dev` (Next.js 16 + Turbopack)

### Testing Approach
- Navigate to http://localhost:3100
- Interact with Research wizard, Board, Interview tabs
- Use agent-browser for clicking, typing, screenshots, DOM inspection
- Verify API responses via network interception where needed

### Dry Run Results (verified)
- Dev server starts in ~426ms on port 3100
- agent-browser navigates and interacts with all 3 tabs successfully
- All tab content renders correctly
- No auth required (public app)

### Important Notes
- Kill any existing `next dev` process before starting (Next.js refuses to run if another instance exists)
- Use `lsof -ti :3100 | xargs kill 2>/dev/null` before starting
- Also kill port 3000 if occupied: `lsof -ti :3000 | xargs kill 2>/dev/null`

## Validation Concurrency

- **Machine**: 32 GB RAM, 10 CPU cores
- **Dev server footprint**: ~584MB RAM
- **agent-browser daemon**: ~8MB
- **Per validator instance**: ~300MB (browser)
- **Available headroom**: ~25GB * 0.7 = ~17.5GB usable
- **Max concurrent validators**: 5

## Credentials
- No login/auth required for the app
- External APIs (Gemini, XPOZ, Apify) are server-side only, configured via .env.local
