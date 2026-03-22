# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables (in .env.local)

| Variable | Purpose |
|---|---|
| GEMINI_API_KEY | Google Gemini AI API key |
| XPOZ_API_KEY | XPOZ Reddit search API key |
| APIFY_API_TOKEN | Apify API token for LinkedIn lookups |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL (public) |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY | Supabase anon key (public) |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role key (server-side) |

## External Services

- **Supabase**: Remote project `wrrdsqmlnhnqyobqcape`. Postgres + pgvector.
- **XPOZ**: Reddit search API via `@xpoz/xpoz` npm package.
- **Google Gemini**: AI via `@ai-sdk/google`. Models: `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite-preview`.
- **Apify**: LinkedIn profile search via `apify-client` npm package. Actor: `harvestapi/linkedin-profile-search-by-name`.

## Apify Integration Notes

- NPM package: `apify-client`
- Actor for LinkedIn: `harvestapi/linkedin-profile-search-by-name`
- Input: `{ firstName, lastName, profileScraperMode: "Short" | "Full", maxItems: 1 }`
- No LinkedIn cookies/login required
- Cost: ~$0.10 per search page + $0.004 per profile (Full mode)
- Always set `maxItems` to control costs
