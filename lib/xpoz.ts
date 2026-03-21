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

export async function getPostWithComments(
  postId: string,
  client?: XpozClient
): Promise<{ post: XpozPost; comments: XpozComment[] } | null> {
  try {
    return await withClient(async (c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await c.reddit.getPostWithComments(postId)) as any
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
