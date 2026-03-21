# XPOZ Reddit Integration Design

**Date:** 2026-03-21
**Status:** Approved

## Overview

Replace the raw Reddit API calls in `lib/reddit.ts` with the XPOZ TypeScript SDK (`@xpoz/xpoz`). Also replace the Gemini-based subreddit suggestion in `app/api/suggest-subreddits/route.ts` with XPOZ's `getSubredditsByKeywords`. Scope: Reddit only. No multi-platform expansion.

## Goals

1. Remove dependency on Reddit's unauthenticated JSON API (fragile, rate-limited, no official support).
2. Use XPOZ for all Reddit data access: post search, post+comment fetch, subreddit discovery.
3. Keep the existing pipeline logic, persona synthesis, and DB schema unchanged.

## Files Changed

| File | Action |
|------|--------|
| `lib/reddit.ts` | Delete |
| `lib/reddit.test.ts` | Delete (replaced by `lib/xpoz.test.ts`) |
| `lib/xpoz.ts` | Create — all Reddit data access via XPOZ SDK |
| `lib/xpoz.test.ts` | Create — unit tests for new module |
| `app/api/discover/route.ts` | Update — import from `lib/xpoz`, update field names |
| `app/api/suggest-subreddits/route.ts` | Update — swap Gemini suggestion for XPOZ |
| `.env.local` / environment config | Add `XPOZ_API_KEY` |

## `lib/xpoz.ts` Design

### Types

```typescript
export type XpozPost = {
  id: string
  title: string | null
  selftext: string | null
  authorUsername: string
  score: number | null
  commentsCount: number | null
  subredditName: string
  permalink: string
}

export type XpozComment = {
  body: string
  authorUsername: string
  score: number
}
```

### Functions

**`searchSubredditPosts(subreddit, query, limit?): Promise<XpozPost[]>`**
Replaces `fetchListing`. Uses `client.reddit.searchPosts(query, { subreddit, limit, sort: 'new' })`. Returns mapped `XpozPost[]`.

**`getPostWithComments(postId): Promise<{ post: XpozPost; comments: XpozComment[] } | null>`**
Replaces `fetchPost`. Uses `client.reddit.getPostWithComments(postId)`. Returns at most 20 comments. Returns `null` on error.

**`suggestSubreddits(query): Promise<string[]>`**
Replaces Gemini's `suggestSubreddits`. Uses `client.reddit.getSubredditsByKeywords(query, { limit: 10 })`. Returns `displayName` values.

**`normalizeSubreddit(value: string): string`**
Migrated from `lib/reddit.ts`. Strips leading `r/` prefix. Used internally by `searchSubredditPosts`.

**`computePainScore(post: Partial<XpozPost>): number`**
Updated heuristic — `upvote_ratio` removed (not available in XPOZ). Scoring:
- `score` weight: `Math.min((post.score ?? 0) / 1000, 1) * 0.5` — normalized net upvote signal (replaces the `controversyWeight` factor)
- `commentsCount` depth weight: `Math.min((post.commentsCount ?? 0) / 500, 1) * 1.5`
- Keyword score: `0.5` per COMPLAINT_KEYWORD found in title (unchanged)

**Note:** Removing `controversyWeight` (which added up to 0.6 for low-ratio posts) lowers scores across the board. The `fragments_collected < 5` threshold in `discover/route.ts` is unchanged — it should still be met given the same post volumes. This is an accepted behavioral delta.

### Client Lifecycle

For single-call functions (`suggestSubreddits`): create an `XpozClient`, connect, call, close in a `finally` block.

For batch operations inside `runPipeline` (`searchSubredditPosts`, `getPostWithComments`): the caller (`runPipeline`) should create **one shared client**, pass it into or use it for all calls in that pipeline run, then close it when done. This avoids spawning 20–60+ concurrent connections during `Promise.allSettled` fan-out over top posts. The exported functions accept an optional pre-connected client, falling back to creating their own when called standalone. Alternatively, accept a client factory pattern — TBD in implementation.

## Route Changes

### `app/api/discover/route.ts`

- Import: `fetchListing, fetchPost, computePainScore` from `lib/reddit` → `searchSubredditPosts, getPostWithComments, computePainScore` from `lib/xpoz`
- `fetchListing(subreddit, icp_description)` → `searchSubredditPosts(subreddit, icp_description)`
- `deepReadPost` **parameter type** updated: remove `permalink`, add `id: string`. The `scoredPosts` inline type annotation also changes `permalink` → `id` and `num_comments` → `commentsCount`.
- `deepReadPost` body: `fetchPost(post.permalink)` → `getPostWithComments(post.id)`. Warning log referencing `permalink` updated to use `id`.
- `upsertPost` call: `num_comments: fullPost.num_comments` → `num_comments: fullPost.commentsCount`, and `upvote_ratio: fullPost.upvote_ratio` → `upvote_ratio: null` (XPOZ does not provide this field; DB column stays, value stored as null).
- `normalizeSubreddit` is no longer imported from `lib/reddit`. The `r/` prefix normalisation is moved into `searchSubredditPosts` internally (strips `r/` before passing to XPOZ), so callers need no change.

### `app/api/suggest-subreddits/route.ts`

- Remove `suggestSubreddits` import from `lib/gemini`
- Add `suggestSubreddits` import from `lib/xpoz`
- No other changes — same call signature and fallback logic

## Environment

```
XPOZ_API_KEY=<your_xpoz_api_key>
```

Add to `.env.local` for local dev. Add to Vercel/deployment environment for production.

## Error Handling

- `searchSubredditPosts`: returns `[]` on any error (same behaviour as old `fetchListing`)
- `getPostWithComments`: returns `null` on any error (same as old `fetchPost`)
- `suggestSubreddits`: throws — caller (`suggest-subreddits` route) already has a try/catch with `DEFAULT_SUBREDDITS` fallback

## Testing

`lib/xpoz.test.ts` covers:
- `computePainScore` with various inputs (no upvote_ratio)
- `searchSubredditPosts` with mocked XPOZ client
- `getPostWithComments` null/error cases
- `suggestSubreddits` mapping of `displayName`

## Out of Scope

- Twitter/Instagram ingestion
- DB schema changes
- Gemini psychoanalysis / synthesis changes
- Frontend changes
