import { XpozClient, OperationTimeoutError, OperationFailedError } from '@xpoz/xpoz'

// Keyword-to-subreddit mapping for ICP expansion
const KEYWORD_SUBREDDIT_MAP: Record<string, string[]> = {
  // Founder/entrepreneur keywords
  founder: ['SaaS', 'startups', 'Entrepreneur', 'indiehackers'],
  entrepreneur: ['Entrepreneur', 'startups', 'smallbusiness', 'indiehackers'],
  startup: ['startups', 'SaaS', 'indiehackers', 'Entrepreneur'],
  bootstrapped: ['indiehackers', 'SaaS', 'startups', 'bootstrapped'],
  indie: ['indiehackers', 'SaaS', 'startups', 'buildinpublic'],
  solopreneur: ['indiehackers', 'Entrepreneur', 'freelance', 'smallbusiness'],
  freelancer: ['freelance', 'forhire', 'Entrepreneur', 'smallbusiness'],
  agency: ['agency', 'marketing', 'Entrepreneur', 'smallbusiness'],

  // SaaS/business keywords
  saas: ['SaaS', 'indiehackers', 'startups', 'b2b'],
  b2b: ['SaaS', 'b2b', 'startups', 'marketing'],
  pricing: ['SaaS', 'pricing', 'startups', 'indiehackers'],
  churn: ['SaaS', 'CustomerSuccess', 'startups', 'indiehackers'],
  retention: ['SaaS', 'CustomerSuccess', 'marketing', 'startups'],
  revenue: ['SaaS', 'startups', 'indiehackers', 'Entrepreneur'],
  growth: ['growth', 'marketing', 'SaaS', 'startups'],
  metrics: ['SaaS', 'startups', 'indiehackers', 'analytics'],

  // Product/feature keywords
  product: ['ProductManagement', 'startups', 'SaaS', 'product'],
  features: ['SaaS', 'ProductManagement', 'startups', 'indiehackers'],
  roadmap: ['ProductManagement', 'SaaS', 'startups'],
  mvp: ['startups', 'indiehackers', 'SaaS', 'buildinpublic'],
  'product-market fit': ['startups', 'SaaS', 'indiehackers'],

  // Marketing/sales keywords
  marketing: ['marketing', 'digital_marketing', 'Entrepreneur', 'growth'],
  sales: ['sales', 'SaaS', 'b2b', 'Entrepreneur'],
  leads: ['sales', 'marketing', 'SaaS', 'b2b'],
  conversion: ['marketing', 'analytics', 'SaaS', 'growth'],
  seo: ['SEO', 'marketing', 'Entrepreneur', 'smallbusiness'],
  content: ['content_marketing', 'marketing', 'copywriting', 'Entrepreneur'],

  // Customer/support keywords
  customer: ['CustomerSuccess', 'SaaS', 'support', 'startups'],
  support: ['CustomerSuccess', 'support', 'SaaS', 'startups'],
  onboarding: ['SaaS', 'ProductManagement', 'CustomerSuccess', 'startups'],

  // Technical/automation keywords
  automation: ['automation', 'ArtificialIntelligence', 'ChatGPT', 'n8n'],
  ai: ['ArtificialIntelligence', 'ChatGPT', 'MachineLearning', 'automation'],
  'no-code': ['nocode', 'automation', 'indiehackers', 'startups'],
  api: ['programming', 'webdev', 'SaaS', 'startups'],
  integration: ['SaaS', 'automation', 'programming', 'startups'],

  // Pain point keywords
  overwhelmed: ['productivity', 'Entrepreneur', 'smallbusiness', 'startups'],
  stressed: ['productivity', 'Entrepreneur', 'mentalhealth', 'startups'],
  burnout: ['Entrepreneur', 'mentalhealth', 'startups', 'indiehackers'],
  'time management': ['productivity', 'Entrepreneur', 'smallbusiness'],
  productivity: ['productivity', 'Entrepreneur', 'smallbusiness', 'startups'],

  // Industry verticals
  ecommerce: ['ecommerce', 'shopify', 'Entrepreneur', 'smallbusiness'],
  fintech: ['fintech', 'startups', 'SaaS', 'Entrepreneur'],
  healthcare: ['healthcare', 'startups', 'SaaS', 'medicine'],
  education: ['education', 'edtech', 'startups', 'teaching'],
  'real estate': ['realestate', 'Entrepreneur', 'smallbusiness', 'investing'],
}

// Extract keywords from text and find matching subreddits
function expandKeywordsToSubreddits(text: string): string[] {
  const lower = text.toLowerCase()
  const matches = new Set<string>()

  for (const [keyword, subreddits] of Object.entries(KEYWORD_SUBREDDIT_MAP)) {
    if (lower.includes(keyword)) {
      for (const sub of subreddits) {
        matches.add(sub)
      }
    }
  }

  return Array.from(matches)
}

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

// Default timeout for Xpoz operations (15 seconds)
const XPOZ_TIMEOUT_MS = 15000

// Internal: run fn with a connected XpozClient.
// If client is provided (tests / batch callers), use it directly without connect/close.
async function withClient<T>(
  fn: (client: XpozClient) => Promise<T>,
  client?: XpozClient
): Promise<T> {
  if (client) {
    return fn(client)
  }
  const c = new XpozClient({ apiKey: process.env.XPOZ_API_KEY ?? '', timeoutMs: XPOZ_TIMEOUT_MS })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.close().catch(() => {})
  }
}

// Build focused pain-signal queries from an ICP description.
// Extracts the problem half (after "—") and generates multiple targeted queries.
export function buildSearchQueries(icpDescription: string): string[] {
  // Split on "—" to separate customer description from problem description
  const parts = icpDescription.split(/\s*[—–-]\s*/)
  const problemPart = parts.length > 1 ? parts.slice(1).join(' ') : icpDescription

  // Split on commas and "and" to get individual pain themes
  const themes = problemPart
    .split(/[,\n]|(?:\s+and\s+)/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 3)

  const queries: string[] = []

  // One query per pain theme with complaint framing
  for (const theme of themes.slice(0, 3)) {
    queries.push(`${theme} problem help struggling`)
  }

  // Fallback: treat the whole problem part as one query
  if (queries.length === 0) {
    queries.push(`${icpDescription} struggling frustrated advice`)
  }

  return queries
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePost(p: any, fallbackSubreddit: string): XpozPost {
  return {
    id: String(p.id ?? ''),
    title: (p.title as string | null) ?? null,
    selftext: (p.selftext as string | null) ?? null,
    authorUsername: String(p.authorUsername ?? 'unknown'),
    score: (p.score as number | null) ?? null,
    commentsCount: (p.commentsCount as number | null) ?? null,
    subredditName: String(p.subredditName ?? fallbackSubreddit),
    permalink: String(p.permalink ?? ''),
  }
}

export async function searchSubredditPosts(
  subreddit: string,
  query: string,
  limit = 100,
  client?: XpozClient
): Promise<XpozPost[]> {
  const normalized = normalizeSubreddit(subreddit)
  const queries = buildSearchQueries(query)

  const allResults = await Promise.allSettled(
    queries.map((q) =>
      withClient(async (c) => {
        const results = await c.reddit.searchPosts(q, {
          subreddit: normalized,
          sort: 'relevance',
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (results.data as any[]).map((p) => normalizePost(p, normalized))
      }, client).catch((error) => {
        if (error instanceof OperationTimeoutError) {
          console.warn('[xpoz] searchPosts_timeout', { subreddit: normalized, query: q, operationId: error.operationId })
        } else if (error instanceof OperationFailedError) {
          console.warn('[xpoz] searchPosts_failed', { subreddit: normalized, query: q, message: error.message })
        } else {
          console.error('[xpoz] searchPosts_error', { subreddit: normalized, query: q, error })
        }
        return [] as XpozPost[]
      })
    )
  )

  // Deduplicate by post id across all query results
  const seen = new Set<string>()
  const merged: XpozPost[] = []
  for (const result of allResults) {
    const posts = result.status === 'fulfilled' ? result.value : []
    for (const post of posts) {
      if (post.id && !seen.has(post.id)) {
        seen.add(post.id)
        merged.push(post)
      }
    }
  }

  console.log('[xpoz] searchSubredditPosts_merged', {
    subreddit: normalized,
    queries: queries.length,
    total: merged.length,
    limit,
  })

  return merged.slice(0, limit)
}

export async function getPostWithComments(
  postId: string,
  client?: XpozClient
): Promise<{ post: XpozPost; comments: XpozComment[] } | null> {
  try {
    return await withClient(async (c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await c.reddit.getPostWithComments(postId)) as any

      // Handle case where post is null/undefined
      if (!result?.post) {
        console.warn('[xpoz] getPostWithComments_no_post', { postId })
        return null
      }

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
        .slice(0, 50)
        .map((c) => ({
          body: String(c.body ?? ''),
          authorUsername: String(c.authorUsername ?? 'unknown'),
          score: Number(c.score ?? 0),
        }))
      return { post, comments }
    }, client)
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.warn('[xpoz] getPostWithComments_timeout', { postId, operationId: error.operationId, elapsedMs: error.elapsedMs })
    } else if (error instanceof OperationFailedError) {
      console.warn('[xpoz] getPostWithComments_failed', { postId, message: error.message })
    } else {
      console.error('[xpoz] getPostWithComments_error', { postId, error })
    }
    return null
  }
}

export async function suggestSubreddits(
  query: string,
  client?: XpozClient
): Promise<string[]> {
  try {
    // Search for posts matching the ICP across all Reddit
    // Extract subreddits from actual posts discussing relevant topics
    const postSubreddits = await withClient(async (c) => {
      const results = await c.reddit.searchPosts(query, {
        sort: 'relevance',
        limit: 50,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const posts = results.data as any[]
      const subreddits = posts
        .map((p) => String(p.subredditName ?? ''))
        .filter(Boolean)

      // Count occurrences to prioritize more relevant subreddits
      const counts = new Map<string, number>()
      for (const sub of subreddits) {
        counts.set(sub, (counts.get(sub) ?? 0) + 1)
      }

      // Sort by frequency and return top subreddits
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name)
    }, client)

    if (postSubreddits.length > 0) {
      return postSubreddits
    }
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.warn('[xpoz] suggestSubreddits_timeout', { query, operationId: error.operationId })
    } else if (error instanceof OperationFailedError) {
      console.warn('[xpoz] suggestSubreddits_failed', { query, message: error.message })
    } else {
      console.error('[xpoz] suggestSubreddits_error', { query, error })
    }
  }

  // Fallback to keyword expansion if post search fails
  return expandKeywordsToSubreddits(query).slice(0, 5)
}
