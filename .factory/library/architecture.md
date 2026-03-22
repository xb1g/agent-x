# Architecture

Architectural decisions, patterns, and key code locations.

---

## Key Files

| File | Purpose | Size |
|---|---|---|
| `app/page.tsx` | Main page, all tabs, wizard, board, state management | ~44KB |
| `app/globals.css` | All CSS styles (custom, no Tailwind) | ~41KB |
| `app/components/PersonaChat.tsx` | Interview chat component | ~8KB |
| `app/components/SegmentCard.tsx` | Board segment card component | ~6KB |
| `lib/xpoz.ts` | Discovery pipeline (search, score, synthesize) | ~30KB |
| `lib/gemini.ts` | Gemini AI functions (analyze, suggest, score) | ~8KB |
| `lib/db.ts` | Supabase database operations | ~5KB |
| `lib/intake.ts` | Input processing, subreddit parsing | ~2KB |
| `lib/validation.ts` | Zod schemas for API validation | ~1KB |

## Pipeline Flow

1. `/api/discover` POST -> creates segment -> `waitUntil(runPipeline)`
2. Phase 1: Find posts via XPOZ Reddit search
3. Phase 2: Batch deep-read + psychoanalyze via Gemini (score relevance, extract pain)
4. Phase 3: Synthesize persona from fragments
5. Status transitions: indexing -> reading -> synthesizing -> ready | failed

## State Management

- React state in `app/page.tsx` for all app state
- localStorage persistence for segments and selected segment
- Polling every 3s for active discovery runs via `/api/segment/{id}`
- Toast notifications for status changes

## Known Bugs Being Fixed

- Double-start: `handleStartResearch` sets state then calls `handleDiscover` before re-render, causing stale `icpDescription`
- No confirmation step before research starts
- Prospects endpoint filters `pain_score > 5` but `computePainScore` maxes at ~2.5, so it often returns empty
