# XPOZ Reddit Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lib/reddit.ts` raw Reddit API calls and Gemini subreddit suggestions with the XPOZ TypeScript SDK (`@xpoz/xpoz`).

**Architecture:** A new `lib/xpoz.ts` module exposes `searchSubredditPosts`, `getPostWithComments`, `suggestSubreddits`, `computePainScore`, and `normalizeSubreddit` — all backed by XPOZ. An internal `withClient` helper manages per-call XPOZ lifecycle. The discover pipeline creates one shared `XpozClient` per run to avoid connection fan-out across the `Promise.allSettled` fan-out over posts.

**Tech Stack:** `@xpoz/xpoz`, Node.js built-in test runner (`node:test` / `node:assert/strict`), TypeScript, Next.js 16, pnpm

**Spec:** `docs/superpowers/specs/2026-03-21-xpoz-reddit-integration-design.md`

---

## File Map

| File | Change |
|------|--------|
| `package.json` + `pnpm-lock.yaml` | Add `@xpoz/xpoz` to dependencies |
| `.env.local` | Add `XPOZ_API_KEY` (do NOT commit) |
| `lib/xpoz.ts` | **Create** — all Reddit access via XPOZ |
| `lib/xpoz.test.ts` | **Create** — unit tests for new module |
| `app/api/discover/route.ts` | **Update** — import from xpoz, shared client in pipeline |
| `app/api/suggest-subreddits/route.ts` | **Update** — swap suggestSubreddits import |
| `lib/reddit.ts` | **Delete** |
| `lib/reddit.test.ts` | **Delete** |

---

### Task 1: Install XPOZ SDK and add env var

**Files:**
- Modify: `package.json`
- Create/modify: `.env.local`

- [ ] **Step 1: Install the package**

```bash
pnpm add @xpoz/xpoz
```

Expected: `@xpoz/xpoz` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Add the API key to `.env.local`**

If `.env.local` doesn't exist, create it. Add:

```
XPOZ_API_KEY=<paste_the_real_key_here>
```

- [ ] **Step 3: Commit package files only (NOT .env.local)**

`.env.local` contains a real secret — never commit it.

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @xpoz/xpoz dependency"
```

---

### Task 2: Pure functions — `normalizeSubreddit` and `computePainScore`

**Files:**
- Create: `lib/xpoz.ts`
- Create: `lib/xpoz.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/xpoz.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSubreddit, computePainScore } from './xpoz'

test('normalizeSubreddit strips the r/ prefix', () => {
  assert.equal(normalizeSubreddit('r/SaaS'), 'SaaS')
})

test('normalizeSubreddit leaves bare names unchanged', () => {
  assert.equal(normalizeSubreddit('SaaS'), 'SaaS')
})

test('normalizeSubreddit is case-insensitive for the prefix', () => {
  assert.equal(normalizeSubreddit('R/SaaS'), 'SaaS')
})

test('computePainScore is higher for posts with complaint keywords and many comments', () => {
  const score = computePainScore({
    title: 'struggling to figure out pricing, anyone else?',
    commentsCount: 300,
    score: 10,
  })
  assert.ok(score > 1.5, `expected score > 1.5, got ${score}`)
})

test('computePainScore is low for upbeat popular posts', () => {
  const score = computePainScore({
    title: 'Hit $10k MRR today!',
    commentsCount: 50,
    score: 500,
  })
  assert.ok(score < 1.0, `expected score < 1.0, got ${score}`)
})

test('computePainScore handles null fields without throwing', () => {
  const score = computePainScore({ title: null, commentsCount: null, score: null })
  assert.equal(Number.isNaN(score), false)
  assert.equal(typeof score, 'number')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: errors like `Cannot find module './xpoz'`.

- [ ] **Step 3: Create `lib/xpoz.ts` with types and pure functions**

```typescript
import { XpozClient } from '@xpoz/xpoz'

const COMPLAINT_KEYWORDS = [
  'struggling',
  'help',
  'frustrated',
  'anyone else',
  "can't figure out",
  'broken',
  'failing',
  'advice',
  'how do you',
  'is it just me',
]

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

export function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, '')
}

export function computePainScore(post: Partial<XpozPost>): number {
  const comments = post.commentsCount ?? 0
  const score = post.score ?? 0
  const title = (post.title ?? '').toLowerCase()
  const scoreWeight = Math.min(score / 1000, 1) * 0.5
  const depthWeight = Math.min(comments / 500, 1) * 1.5
  const keywordScore =
    COMPLAINT_KEYWORDS.filter((keyword) => title.includes(keyword)).length * 0.5
  return scoreWeight + depthWeight + keywordScore
}

// Internal: run fn with a connected XpozClient.
// If client is provided (tests / batch callers), use it directly without connect/close.
async function withClient<T>(
  fn: (client: XpozClient) => Promise<T>,
  client?: XpozClient
): Promise<T> {
  if (client) {
    return fn(client)
  }
  const c = new XpozClient({ apiKey: process.env.XPOZ_API_KEY ?? '' })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.close().catch(() => {})
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: 6 passing tests. The existing `reddit.test.ts` tests still pass since `reddit.ts` still exists.

- [ ] **Step 5: Commit**

```bash
git add lib/xpoz.ts lib/xpoz.test.ts
git commit -m "feat: add lib/xpoz.ts with normalizeSubreddit and computePainScore"
```

---

### Task 3: `searchSubredditPosts`

**Files:**
- Modify: `lib/xpoz.ts`
- Modify: `lib/xpoz.test.ts`

- [ ] **Step 1: Add the failing tests**

Update the import at the top of `lib/xpoz.test.ts` to add `searchSubredditPosts` and the `XpozClient` type:

```typescript
import type { XpozClient } from '@xpoz/xpoz'
import { normalizeSubreddit, computePainScore, searchSubredditPosts } from './xpoz'
```

Append to `lib/xpoz.test.ts`:

```typescript
test('searchSubredditPosts maps XPOZ results to XpozPost[]', async () => {
  const mockClient = {
    reddit: {
      searchPosts: async (_query: string, _opts: unknown) => ({
        data: [
          {
            id: 'abc123',
            title: 'Struggling with pricing',
            selftext: 'help please',
            authorUsername: 'founder',
            score: 7,
            commentsCount: 42,
            subredditName: 'SaaS',
            permalink: '/r/SaaS/comments/abc123/',
          },
        ],
      }),
    },
  }

  const results = await searchSubredditPosts(
    'r/SaaS',
    'pricing',
    10,
    mockClient as unknown as XpozClient
  )
  assert.equal(results.length, 1)
  assert.equal(results[0]?.id, 'abc123')
  assert.equal(results[0]?.subredditName, 'SaaS')
})

test('searchSubredditPosts strips r/ prefix before querying', async () => {
  let capturedOpts: unknown
  const mockClient = {
    reddit: {
      searchPosts: async (_query: string, opts: unknown) => {
        capturedOpts = opts
        return { data: [] }
      },
    },
  }

  await searchSubredditPosts('r/SaaS', 'pricing', 10, mockClient as unknown as XpozClient)
  assert.equal((capturedOpts as { subreddit: string }).subreddit, 'SaaS')
})

test('searchSubredditPosts returns empty array on error', async () => {
  const mockClient = {
    reddit: {
      searchPosts: async () => {
        throw new Error('network error')
      },
    },
  }

  const results = await searchSubredditPosts(
    'SaaS',
    'pricing',
    10,
    mockClient as unknown as XpozClient
  )
  assert.deepEqual(results, [])
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: `searchSubredditPosts is not a function` (or similar).

- [ ] **Step 3: Implement `searchSubredditPosts` in `lib/xpoz.ts`**

Append to `lib/xpoz.ts` (after `withClient`):

```typescript
export async function searchSubredditPosts(
  subreddit: string,
  query: string,
  limit = 100,
  client?: XpozClient
): Promise<XpozPost[]> {
  const normalized = normalizeSubreddit(subreddit)
  try {
    return await withClient(async (c) => {
      const results = await c.reddit.searchPosts(
        `${query} struggling frustrated help`,
        { subreddit: normalized, limit, sort: 'new' }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (results.data as any[]).map((p) => ({
        id: String(p.id ?? ''),
        title: (p.title as string | null) ?? null,
        selftext: (p.selftext as string | null) ?? null,
        authorUsername: String(p.authorUsername ?? 'unknown'),
        score: (p.score as number | null) ?? null,
        commentsCount: (p.commentsCount as number | null) ?? null,
        subredditName: String(p.subredditName ?? normalized),
        permalink: String(p.permalink ?? ''),
      }))
    }, client)
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/xpoz.ts lib/xpoz.test.ts
git commit -m "feat: add searchSubredditPosts to lib/xpoz.ts"
```

---

### Task 4: `getPostWithComments`

**Files:**
- Modify: `lib/xpoz.ts`
- Modify: `lib/xpoz.test.ts`

- [ ] **Step 1: Add the failing tests**

Update the import to add `getPostWithComments`:

```typescript
import { normalizeSubreddit, computePainScore, searchSubredditPosts, getPostWithComments } from './xpoz'
```

Append to `lib/xpoz.test.ts`:

```typescript
test('getPostWithComments returns post and comments', async () => {
  const mockClient = {
    reddit: {
      getPostWithComments: async (_postId: string) => ({
        post: {
          id: 'abc123',
          title: 'Struggling with pricing',
          selftext: 'help',
          authorUsername: 'founder',
          score: 7,
          commentsCount: 2,
          subredditName: 'SaaS',
          permalink: '/r/SaaS/comments/abc123/',
        },
        comments: [
          { body: 'same here', authorUsername: 'commenter', score: 11 },
          { body: 'me too', authorUsername: 'other', score: 3 },
        ],
      }),
    },
  }

  const result = await getPostWithComments('abc123', mockClient as unknown as XpozClient)
  assert.ok(result)
  assert.equal(result?.post.id, 'abc123')
  assert.equal(result?.comments.length, 2)
  assert.equal(result?.comments[0]?.body, 'same here')
})

test('getPostWithComments returns null on error', async () => {
  const mockClient = {
    reddit: {
      getPostWithComments: async () => {
        throw new Error('not found')
      },
    },
  }

  const result = await getPostWithComments('missing', mockClient as unknown as XpozClient)
  assert.equal(result, null)
})

test('getPostWithComments slices comments to 20', async () => {
  const mockClient = {
    reddit: {
      getPostWithComments: async (_postId: string) => ({
        post: {
          id: 'abc123',
          title: 'Post',
          selftext: '',
          authorUsername: 'u',
          score: 1,
          commentsCount: 50,
          subredditName: 'SaaS',
          permalink: '/r/SaaS/comments/abc123/',
        },
        comments: Array.from({ length: 50 }, (_, i) => ({
          body: `comment ${i}`,
          authorUsername: 'u',
          score: 1,
        })),
      }),
    },
  }

  const result = await getPostWithComments('abc123', mockClient as unknown as XpozClient)
  assert.equal(result?.comments.length, 20)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: `getPostWithComments is not a function`.

- [ ] **Step 3: Implement `getPostWithComments` in `lib/xpoz.ts`**

Append to `lib/xpoz.ts`:

```typescript
export async function getPostWithComments(
  postId: string,
  client?: XpozClient
): Promise<{ post: XpozPost; comments: XpozComment[] } | null> {
  try {
    return await withClient(async (c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await c.reddit.getPostWithComments(postId) as any
      const p = result.post
      const post: XpozPost = {
        id: String(p.id ?? ''),
        title: (p.title as string | null) ?? null,
        selftext: (p.selftext as string | null) ?? null,
        authorUsername: String(p.authorUsername ?? 'unknown'),
        score: (p.score as number | null) ?? null,
        commentsCount: (p.commentsCount as number | null) ?? null,
        subredditName: String(p.subredditName ?? ''),
        permalink: String(p.permalink ?? ''),
      }
      const comments: XpozComment[] = ((result.comments ?? []) as Array<{
        body?: unknown
        authorUsername?: unknown
        score?: unknown
      }>)
        .slice(0, 20)
        .map((c) => ({
          body: String(c.body ?? ''),
          authorUsername: String(c.authorUsername ?? 'unknown'),
          score: Number(c.score ?? 0),
        }))
      return { post, comments }
    }, client)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/xpoz.ts lib/xpoz.test.ts
git commit -m "feat: add getPostWithComments to lib/xpoz.ts"
```

---

### Task 5: `suggestSubreddits`

**Files:**
- Modify: `lib/xpoz.ts`
- Modify: `lib/xpoz.test.ts`

- [ ] **Step 1: Add the failing tests**

Update the import to add `suggestSubreddits`:

```typescript
import { normalizeSubreddit, computePainScore, searchSubredditPosts, getPostWithComments, suggestSubreddits } from './xpoz'
```

Append to `lib/xpoz.test.ts`:

```typescript
test('suggestSubreddits returns displayName values', async () => {
  const mockClient = {
    reddit: {
      getSubredditsByKeywords: async (_query: string, _opts: unknown) => ({
        data: [
          { displayName: 'SaaS' },
          { displayName: 'indiehackers' },
          { displayName: 'startups' },
        ],
      }),
    },
  }

  const results = await suggestSubreddits(
    'B2B SaaS founders',
    mockClient as unknown as XpozClient
  )
  assert.deepEqual(results, ['SaaS', 'indiehackers', 'startups'])
})

test('suggestSubreddits filters empty displayNames', async () => {
  const mockClient = {
    reddit: {
      getSubredditsByKeywords: async () => ({
        data: [
          { displayName: 'SaaS' },
          { displayName: '' },
          { displayName: null },
        ],
      }),
    },
  }

  const results = await suggestSubreddits('SaaS', mockClient as unknown as XpozClient)
  assert.deepEqual(results, ['SaaS'])
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: `suggestSubreddits is not a function`.

- [ ] **Step 3: Implement `suggestSubreddits` in `lib/xpoz.ts`**

Append to `lib/xpoz.ts`:

```typescript
export async function suggestSubreddits(
  query: string,
  client?: XpozClient
): Promise<string[]> {
  return withClient(async (c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await c.reddit.getSubredditsByKeywords(query, { limit: 10 }) as any
    return (results.data as Array<{ displayName?: unknown }>)
      .map((s) => String(s.displayName ?? ''))
      .filter(Boolean)
  }, client)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/xpoz.ts lib/xpoz.test.ts
git commit -m "feat: add suggestSubreddits to lib/xpoz.ts"
```

---

### Task 6: Update `app/api/discover/route.ts`

**Files:**
- Modify: `app/api/discover/route.ts`

- [ ] **Step 1: Update the import lines**

Replace:
```typescript
import { fetchListing, fetchPost, computePainScore } from '../../../lib/reddit'
```
With:
```typescript
import { XpozClient } from '@xpoz/xpoz'
import { searchSubredditPosts, getPostWithComments, computePainScore } from '../../../lib/xpoz'
```

- [ ] **Step 2: Update the `scoredPosts` type annotation**

The inline type for `scoredPosts` elements (around line 149) references `permalink` and `num_comments`. Replace that type block:

```typescript
const scoredPosts: Array<{
  post: {
    id: string
    title?: string | null
    selftext?: string | null
    score?: number | null
    commentsCount?: number | null
  }
  subreddit: string
  pain_score: number
}> = []
```

- [ ] **Step 3: Add a shared XPOZ client to `runPipeline`**

`runPipeline` currently has a `try/catch` wrapping the whole body. Add a client that lives for the whole pipeline run. Change the outer structure of `runPipeline` to:

```typescript
async function runPipeline(
  segment_id: string,
  icp_description: string,
  subreddits: string[]
) {
  let xpozClient: XpozClient | null = null
  try {
    xpozClient = new XpozClient({ apiKey: process.env.XPOZ_API_KEY ?? '' })
    await xpozClient.connect()

    // ... existing pipeline body (modified in steps below)

  } catch (error) {
    // existing catch block unchanged
  } finally {
    await xpozClient?.close().catch(() => {})
  }
}
```

- [ ] **Step 4: Replace `fetchListing` calls**

Inside `runPipeline`, replace:
```typescript
subreddits.map((subreddit) => fetchListing(subreddit, icp_description))
```
With:
```typescript
subreddits.map((subreddit) => searchSubredditPosts(subreddit, icp_description, 100, xpozClient!))
```

- [ ] **Step 5: Update `deepReadPost` signature**

Change the function signature from:
```typescript
async function deepReadPost(
  segment_id: string,
  post: {
    permalink: string
    title?: string | null
    selftext?: string | null
    score?: number | null
    upvote_ratio?: number | null
    num_comments?: number | null
  },
  subreddit: string,
  pain_score: number
)
```
To:
```typescript
async function deepReadPost(
  segment_id: string,
  post: {
    id: string
    title?: string | null
    selftext?: string | null
    score?: number | null
    commentsCount?: number | null
  },
  subreddit: string,
  pain_score: number,
  xpozClient: XpozClient
)
```

- [ ] **Step 6: Update `deepReadPost` body**

Inside `deepReadPost`:

1. Replace `fetchPost(post.permalink)` → `getPostWithComments(post.id, xpozClient)`
2. Replace the warning log line `permalink: post.permalink` → `post_id: post.id`
3. In the `upsertPost` call, make two field changes:
   - `num_comments: fullPost.num_comments` → `num_comments: fullPost.commentsCount`
   - `upvote_ratio: fullPost.upvote_ratio` → `upvote_ratio: null`

- [ ] **Step 7: Pass `xpozClient` into `deepReadPost` calls**

In the `Promise.allSettled` fan-out for deep reads, replace:
```typescript
topPosts.map(({ post, subreddit, pain_score }) =>
  deepReadPost(segment_id, post, subreddit, pain_score)
)
```
With:
```typescript
topPosts.map(({ post, subreddit, pain_score }) =>
  deepReadPost(segment_id, post, subreddit, pain_score, xpozClient!)
)
```

- [ ] **Step 8: Type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add app/api/discover/route.ts
git commit -m "feat: wire discover pipeline to lib/xpoz.ts"
```

---

### Task 7: Update `app/api/suggest-subreddits/route.ts`

**Files:**
- Modify: `app/api/suggest-subreddits/route.ts`

- [ ] **Step 1: Swap the `suggestSubreddits` import**

Replace:
```typescript
import { suggestSubreddits } from '../../../lib/gemini'
```
With:
```typescript
import { suggestSubreddits } from '../../../lib/xpoz'
```

- [ ] **Step 2: Type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/suggest-subreddits/route.ts
git commit -m "feat: replace Gemini subreddit suggestion with XPOZ"
```

---

### Task 8: Delete `lib/reddit.ts` and `lib/reddit.test.ts`

**Files:**
- Delete: `lib/reddit.ts`
- Delete: `lib/reddit.test.ts`

- [ ] **Step 1: Delete the files**

```bash
rm lib/reddit.ts lib/reddit.test.ts
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all tests in `lib/xpoz.test.ts` (and any other test files) pass. No failures.

- [ ] **Step 3: Type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If any file still imports from `lib/reddit`, fix it now.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove lib/reddit.ts replaced by lib/xpoz.ts"
```

---

## Done

After Task 8, the migration is complete:
- All Reddit data flows through XPOZ
- `pnpm test` passes
- `pnpm tsc --noEmit` passes
- `lib/reddit.ts` is gone
