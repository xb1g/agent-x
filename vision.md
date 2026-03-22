# AGENT-X — Customer Discovery Engine

**The best engine to find customers to interview.**

---

## The Problem

Founders build products nobody wants because customer discovery is expensive:
- 3+ weeks of cold outreach
- Awkward interviews with the wrong people
- No systematic way to find *high-intent* prospects

## The Solution

Agent-X mines Reddit for real pain signals, identifies high-value prospects, and lets you interview an AI persona synthesized from real user language — all in minutes.

**We don't just find insights. We find the people behind them.**

---

## Product Phases

### Phase 1: Research (Target Discovery)

A guided wizard that helps founders define their ICP with AI assistance.

```
┌─────────────────────────────────────────────────────────────┐
│  [logo]  AGENT-X                              [Research ▾] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🎯 Who are you building for?                       │   │
│  │                                                     │   │
│  │  Start with a rough idea. I'll help you refine it. │   │
│  │                                                     │   │
│  │  [I'm building for __________________]             │   │
│  │                                                     │   │
│  │  Examples:                                          │   │
│  │  • "SaaS founders"                                  │   │
│  │  • "People learning to code"                        │   │
│  │  • "Small business owners"                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💡 AI Refinement                                   │   │
│  │                                                     │   │
│  │  Based on "SaaS founders", here are common          │   │
│  │  segments I can help you target:                    │   │
│  │                                                     │   │
│  │  ○ Early-stage founders (pre-revenue)               │   │
│  │  ○ Bootstrapped founders (solo/small team)          │   │
│  │  ○ B2B SaaS founders (enterprise sales)             │   │
│  │  ○ Something else...                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  😰 What problem do they have?                      │   │
│  │                                                     │   │
│  │  [They struggle with _______________]              │   │
│  │                                                     │   │
│  │  AI suggestions based on your segment:              │   │
│  │  • Pricing strategy                                 │   │
│  │  • Customer churn                                   │   │
│  │  • Feature prioritization                           │   │
│  │  • Finding product-market fit                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [← Back]                          [Start Research →]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Wizard Flow:**
1. **Rough input** → AI suggests refinements
2. **Pick a segment** → AI suggests common problems
3. **Confirm problem** → AI generates search strategy
4. **Start research** → Background pipeline begins

**Mobile-first design:**
- Top tab bar: Research | Board | Interview
- Full-width cards
- Touch-friendly inputs
- Collapsible sections

---

### Phase 2: Board (Discovery Dashboard)

Monitor and manage research segments with deep visibility.

```
┌─────────────────────────────────────────────────────────────┐
│  [Research] [Board] [Interview]                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Active Segments                              [+ New]       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Alex — Bootstrapped SaaS Founders          [▶︎ ⏸]  │   │
│  │                                                     │   │
│  │  Status: ● Reading posts (47/120)                   │   │
│  │  Started: 2 min ago                                 │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  📊 Live Metrics                             │   │   │
│  │  │                                             │   │   │
│  │  │  Posts found:     847                       │   │   │
│  │  │  High-relevance:  23                        │   │   │
│  │  │  Fragments:       12                        │   │   │
│  │  │  Subreddits:      r/SaaS, r/startups, +3   │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  [Inspect] [Rename] [Delete]                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Jordan — E-commerce Store Owners           [Ready] │   │
│  │                                                     │   │
│  │  Status: ✓ Ready to interview                      │   │
│  │  Posts analyzed: 234  |  Fragments: 18             │   │
│  │                                                     │   │
│  │  [Interview] [Inspect] [Rename]                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Segment Controls:**
- **Pause/Play** — Stop or resume post discovery
- **Rename** — Change persona name
- **Inspect** — Deep dive into data

**Inspect Modal:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Alex — Bootstrapped SaaS Founders                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Overview                                                │
│  ─────────────────────────────────────────────────────────  │
│  Posts analyzed:      234                                   │
│  High-relevance:      23 (scored 8+)                        │
│  Fragments extracted: 18                                    │
│  Subreddits:          r/SaaS, r/startups, r/indiehackers   │
│                                                             │
│  🎯 High-Value Prospects                                    │
│  ─────────────────────────────────────────────────────────  │
│  People actively expressing this pain, ready to talk:       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  u/saas_founder_mike                    Score: 9.2  │   │
│  │                                                     │   │
│  │  "I've been running my SaaS for 2 years and        │   │
│  │   churn is killing me. I've tried everything..."   │   │
│  │                                                     │   │
│  │  📍 r/SaaS • 847 upvotes • 124 comments            │   │
│  │                                                     │   │
│  │  [View Post] [Reddit Profile] [Find Contact]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  u/bootstrapped_bob                    Score: 8.7   │   │
│  │                                                     │   │
│  │  "Looking for advice on pricing. My customers      │   │
│  │   keep saying it's too expensive but..."           │   │
│  │                                                     │   │
│  │  📍 r/indiehackers • 234 upvotes • 67 comments     │   │
│  │                                                     │   │
│  │  [View Post] [Reddit Profile] [Find Contact]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💬 High-Value Commenters                                   │
│  ─────────────────────────────────────────────────────────  │
│  People who engaged deeply with relevant posts:             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  u/churn_analyst                       Score: 8.1   │   │
│  │                                                     │   │
│  │  Comment: "I've reduced churn by 40% using this    │   │
│  │  framework..." (234 upvotes)                        │   │
│  │                                                     │   │
│  │  [View Comment] [Reddit Profile] [Find Contact]    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Export Contacts] [Continue Research]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Find Contact Feature:**
- Searches for LinkedIn, Twitter, personal website
- Shows available contact methods
- One-click outreach templates

---

### Phase 3: Interview (Persona Chat)

Talk to the synthesized persona.

```
┌─────────────────────────────────────────────────────────────┐
│  [Research] [Board] [Interview]                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👤 Alex                                            │   │
│  │  Bootstrapped SaaS Founder                          │   │
│  │                                                     │   │
│  │  "I've been running my SaaS for 3 years. Churn      │   │
│  │   is my biggest headache — I lose 8% of customers   │   │
│  │   every month and I don't know why."                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💬 Chat                                            │   │
│  │                                                     │   │
│  │  You: What's the #1 thing that makes you            │   │
│  │  consider cancelling a SaaS tool?                   │   │
│  │                                                     │   │
│  │  Alex: Honestly? When I realize I'm paying for      │   │
│  │  features I never use. I had this analytics tool    │   │
│  │  that cost $99/mo and I only looked at it once      │   │
│  │  a month. Cancelled after 6 months.                 │   │
│  │                                                     │   │
│  │  [Evidence: 3 Reddit posts]                         │   │
│  │                                                     │   │
│  │  You: Would you pay $49/mo for a churn prediction   │   │
│  │  tool?                                              │   │
│  │                                                     │   │
│  │  Alex: Hmm, maybe? But here's the thing — I'm       │   │
│  │  already drowning in tools. What would make me      │   │
│  │  pay is if you could tell me *who* is about to      │   │
│  │  churn and *why*. Not just a prediction score.      │   │
│  │                                                     │   │
│  │  [Evidence: 2 Reddit posts, 1 comment]              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Type a message...]                              [Send →]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 16)                                      │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Research   │ │   Board     │ │  Interview  │           │
│  │  (Wizard)   │ │  (Dashboard)│ │   (Chat)    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
│  Mobile-first • Top tab navigation • Touch-optimized        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  API LAYER                                                  │
│                                                             │
│  POST /api/discover     → Start research pipeline           │
│  POST /api/segment/:id  → Pause/play/rename                 │
│  GET  /api/segment/:id  → Get segment details + prospects   │
│  POST /api/chat         → Stream persona responses          │
│  POST /api/find-contact → Find contact info for user        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DISCOVERY PIPELINE                                         │
│                                                             │
│  1. ICP Analysis (Gemini Flash Lite)                        │
│     → Generate search queries                               │
│     → Score post relevance                                  │
│                                                             │
│  2. Post Discovery (XPOZ)                                   │
│     → Search Reddit with AI-generated queries               │
│     → Fetch posts + comments                                │
│     → Identify high-value authors/commenters                │
│                                                             │
│  3. Deep Analysis (Gemini Flash Lite)                       │
│     → Psychoanalyze → PersonaFragment                       │
│     → Chunk → Embed (pgvector)                              │
│                                                             │
│  4. Synthesis (Gemini Pro)                                  │
│     → Merge fragments → soul_document                       │
│     → Generate persona profile                              │
│                                                             │
│  5. Prospect Scoring                                        │
│     → Score authors by relevance + engagement               │
│     → Find contact info (LinkedIn, Twitter, etc.)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA LAYER (Supabase)                                      │
│                                                             │
│  segments          → Research sessions                      │
│  posts             → Discovered posts                       │
│  post_embeddings   → pgvector chunks                        │
│  prospects         → High-value users to contact            │
│  contact_info      → Found contact methods                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Roadmap

### v0.2 — Mobile + Wizard (Next)

**UX/UI:**
- [ ] Mobile-first responsive design
- [ ] Top tab bar navigation (Research | Board | Interview)
- [ ] Logo in header
- [ ] Research wizard with AI-assisted ICP refinement
- [ ] Touch-friendly inputs and buttons

**Research Wizard:**
- [ ] Step 1: Rough customer input → AI suggests segments
- [ ] Step 2: Pick segment → AI suggests problems
- [ ] Step 3: Confirm problem → Start research
- [ ] Progress indicator
- [ ] Back/forward navigation

### v0.3 — Board Improvements

**Segment Management:**
- [ ] Pause/Play research
- [ ] Rename persona
- [ ] Delete segment
- [ ] Duplicate segment with different parameters

**Inspect Modal:**
- [ ] Overview metrics
- [ ] High-value prospects list
- [ ] Post URLs (clickable)
- [ ] Author Reddit profiles (clickable)
- [ ] High-value commenters
- [ ] Comment links

**Data Depth:**
- [ ] Relevance scores per post
- [ ] Pain scores per post
- [ ] Engagement metrics
- [ ] Subreddit breakdown

### v0.4 — Contact Discovery

**Find Contacts:**
- [ ] LinkedIn profile search
- [ ] Twitter/X profile search
- [ ] Personal website detection
- [ ] Email finding (via Hunter.io or similar)
- [ ] Contact quality score

**Outreach:**
- [ ] One-click outreach templates
- [ ] Personalized based on their post
- [ ] Export to CSV

### v0.5 — Interview Enhancements

**Chat Improvements:**
- [ ] Evidence citations (click to view source)
- [ ] Persona customization
- [ ] Interview templates
- [ ] Export conversation

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Backend | Next.js API Routes, Vercel Functions |
| AI | Gemini 3.1 Pro + Flash Lite, Vercel AI SDK |
| Data | Supabase Postgres + pgvector |
| Reddit | XPOZ SDK |
| Contact Finding | Hunter.io / Clearbit (planned) |

---

## The One-Sentence Pitch

**Agent-X finds the exact people you should interview — not just insights, but the humans behind them.**

---

*Built at Vercel x Gemini Hackathon, March 21, 2026.*