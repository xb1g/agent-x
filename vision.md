# AGENT-X — Hackathon Vision Document

**Date:** March 21, 2026 | **Event:** Vercel x Gemini Hackathon

## The Goal

**Build a customer discovery platform that lets founders interview their target customer before they exist.**

A founder describes who they're building for. Agent-X mines Reddit for real pain signals, constructs a composite AI persona grounded in verbatim user language, and lets the founder have a live conversation with that persona — all within minutes, not weeks of interviews.

## The Reason (Why This, Why Now)

The #1 killer of startups is building something nobody wants. Customer discovery — talking to real users, finding their real fears, validating ideas — takes weeks of cold outreach, awkward interviews, and qualitative synthesis.

Founders skip it. Not because they're lazy, but because it's expensive in time and social capital.

Three forces make this the right moment:

1. **Reddit is the largest unfiltered complaint database on the internet.** Real users venting real problems, unprompted, in authentic language. It's never been systematically mined for startup validation.
2. **Gemini's multimodal + embedding capabilities** make it possible to not just *summarize* that data, but to construct a psychologically coherent persona that *reasons* from it.
3. **Vercel's agent stack** (waitUntil, background functions, AI SDK) means we can run parallel deep-reading subagents without managing infrastructure — the pipeline just works.

The result: what used to take a founder 3 weeks now takes 3 minutes.

## The Possibility (What We Built)

```
FOUNDER
  │  "B2B SaaS founders struggling with churn"
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEXT.JS on VERCEL                                              │
│                                                                 │
│  Step 1: ICP → XPOZ suggests relevant subreddits               │
│  Step 2: Founder confirms subreddits                           │
│  Step 3: Coordinator kicks off background pipeline             │
│                                                                 │
│  PHASE 1 (Fast Indexer, no AI)                                  │
│   → Parallel XPOZ searches per subreddit                       │
│   → Pain score heuristic (complaints, depth, keywords)         │
│   → Top 20 posts per subreddit selected                        │
│                                                                 │
│  PHASE 2 (Deep Reader SubAgents, parallel)                     │
│   → Full post + comments fetched per post                      │
│   → Chunk → Embed (Gemini text-embedding-004, 768-dim)         │
│   → Upsert to pgvector (HNSW index, Supabase)                  │
│   → Psychoanalyze (Gemini flash-lite) → PersonaFragment        │
│                                                                 │
│  SYNTHESIS                                                      │
│   → Merge PersonaFragments → Gemini Pro writes soul_document   │
│   → soul_document = character bible, ~800 tokens               │
│                                                                 │
│  CHAT / INTERVIEW                                               │
│   → Embed founder question → retrieve 5 closest evidence chunks│
│   → soul_document + evidence → streamText (Gemini Pro)         │
│   → Founder talks to "Alex" — a composite persona              │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
  SUPABASE (segments · posts · post_embeddings pgvector)
  Persists across sessions — re-research adds more signal
```

**Status lifecycle:** `indexing → reading → synthesizing → ready | failed`

**Tech Stack:**

- Next.js 15 App Router + Vercel (waitUntil, maxDuration: 300)
- Vercel AI SDK + `@ai-sdk/google` (Gemini 3.1 Pro + Flash Lite)
- XPOZ SDK — Reddit data access layer
- Supabase Postgres + pgvector (HNSW index)
- Zod validation, html-escaper (prompt injection defense)

## The Vision

> "The best founders deeply understand their customers. Agent-X makes that depth available to every founder, not just the ones with 500 LinkedIn connections."

**12 months from now**, Agent-X is the first tool a founder opens before writing a single line of code. They describe their ICP once. The system continuously monitors Reddit for new signals, evolving the persona over time. When the founder ships a feature, they interview Alex first. When churn spikes, they ask Alex why.

The persona doesn't just answer — it *challenges*. "Why would I pay for that when I already have a spreadsheet?" That kind of friction, delivered instantly, saves founders from building features their users don't actually want.

**The 10x version:** Agent-X isn't just a chat interface. It's a living customer intelligence layer that every tool in the founder's stack can query — Notion docs written in the customer's voice, PR templates that speak to the persona's fears, pitch decks stress-tested against objections Alex would actually raise.

## Hackathon Scope

This project maps to **Statement Three: AI Applications** (primary) and **Statement One: Chat-Based Agents** (the chat interview component).

### What's Live and Demoed Today

| Feature | Status |
| --- | --- |
| ICP input → XPOZ subreddit suggestions | Done |
| Two-phase background pipeline (Phase 1 + Phase 2) | Done |
| Gemini psychoanalysis per post → PersonaFragment | Done |
| Gemini Pro synthesis → soul_document | Done |
| pgvector HNSW retrieval at chat time | Done |
| Streaming persona chat (Gemini Pro + RAG) | Done |
| Polling UI (indexing → reading → synthesizing → ready) | Done |
| Supabase persistence (cross-session) | Done |
| Prompt injection defense (html-escaper) | Done |
| XPOZ SDK integration (replaces raw Reddit API) | Done |

### What the Demo Shows (3 minutes)

1. Type an ICP: *"B2B SaaS founders dealing with churn"*
2. XPOZ suggests subreddits → confirm 3
3. Watch the live status bar: indexing → reading → synthesizing → ready
4. Segment card appears: "Alex — 60 posts, 2,300 comments analysed"
5. Click Chat → ask: *"What's the #1 thing that makes you consider cancelling a SaaS tool?"*
6. Alex responds in character, citing real language from Reddit posts
7. Follow-up: *"Would you pay $49/month for a churn prediction tool?"* — Alex pushes back

### Judging Criteria Alignment

| Criterion | Our Angle |
| --- | --- |
| Impact Potential (20%) | Customer discovery is a $0 → massive problem. Every startup needs this. The knowledge base persists and compounds. |
| Live Demo (45%) | The pipeline runs live. Real Reddit data, real Gemini inference, real streaming chat. The persona feels alive — not a chatbot, a character. |
| Creativity & Originality (35%) | Nobody has built "talk to your customer before they exist." The two-phase subagent architecture, soul_document + pgvector hybrid, and psychoanalysis-first approach are all novel. |

## Not in Scope (Hackathon MVP)

These are deliberate deferrals, not forgotten ideas:

| Deferred | Why |
| --- | --- |
| X/Twitter, LinkedIn, GitHub sources | Reddit provides enough signal for a compelling demo |
| Multi-tenant / workspace auth | Single workspace sufficient for hackathon |
| Individual user simulation | Composite persona is more statistically valid anyway |
| Admin dashboard | Not needed for demo |
| Longitudinal tracking (persona evolution over time) | Phase 2 product feature |
| CRM export (Notion, HubSpot) | Clear next integration |
| Rate limiting (Upstash) | In-memory guard sufficient for hackathon |
| Multi-round automated interview flows | Follow-up feature |

## The One-Sentence Pitch

**Agent-X lets founders interview their target customer in 3 minutes — powered by Gemini subagents that mine Reddit for real pain signals and synthesize them into an AI persona you can actually talk to.**

*Built at Vercel x Gemini Hackathon, March 21, 2026. Stack: Next.js · Vercel AI SDK · Gemini 3.1 · XPOZ · Supabase pgvector.*