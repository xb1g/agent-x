import { XpozClient, OperationTimeoutError, OperationFailedError } from '@xpoz/xpoz'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
})

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

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-HEAL: Retry with exponential backoff
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20000
const MAX_RETRIES = 3
const BASE_DELAY_MS = 500

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    operationName: string
    context?: Record<string, unknown>
    maxRetries?: number
    shouldRetry?: (error: unknown) => boolean
  }
): Promise<T> {
  const { operationName, context = {}, maxRetries = MAX_RETRIES, shouldRetry } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      const isRetryable =
        shouldRetry?.(error) ??
        (error instanceof OperationTimeoutError || error instanceof OperationFailedError)

      if (!isRetryable || attempt === maxRetries) {
        throw error
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[xpoz] ${operationName}_retry`, {
        ...context,
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      })

      await sleep(delay)
    }
  }

  throw lastError
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-HEAL: Circuit breaker to stop when failure rate is too high
// ─────────────────────────────────────────────────────────────────────────────

export class CircuitBreaker {
  private failures = 0
  private successes = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeoutMs: number = 30000
  ) {}

  recordFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.threshold) {
      this.state = 'open'
      console.warn('[circuit_breaker] opened', {
        failures: this.failures,
        threshold: this.threshold,
      })
    }
  }

  recordSuccess(): void {
    this.successes++
    if (this.state === 'half-open') {
      this.state = 'closed'
      this.failures = 0
      console.log('[circuit_breaker] closed', { successes: this.successes })
    }
  }

  canExecute(): boolean {
    if (this.state === 'closed') {
      return true
    }

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime
      if (elapsed >= this.resetTimeoutMs) {
        this.state = 'half-open'
        console.log('[circuit_breaker] half-open', { elapsedMs: elapsed })
        return true
      }
      return false
    }

    return true // half-open
  }

  getStatus(): { state: string; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    }
  }
}

// Global circuit breaker for Xpoz operations (higher threshold, shorter reset)
export const xpozCircuitBreaker = new CircuitBreaker(10, 20000)

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-HEAL: Adaptive timeout based on post characteristics
// ─────────────────────────────────────────────────────────────────────────────

function getAdaptiveTimeout(post: { commentsCount?: number | null; score?: number | null }): number {
  const comments = post.commentsCount ?? 0
  const score = post.score ?? 0

  // Posts with many comments take longer to fetch
  if (comments > 200) return 25000
  if (comments > 100) return 20000

  // Popular posts might have more data
  if (score > 1000) return 20000

  // Default timeout
  return DEFAULT_TIMEOUT_MS
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Xpoz operations
// ─────────────────────────────────────────────────────────────────────────────

// Internal: run fn with a connected XpozClient.
// If client is provided (tests / batch callers), use it directly without connect/close.
async function withClient<T>(
  fn: (client: XpozClient) => Promise<T>,
  client?: XpozClient,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  if (client) {
    return fn(client)
  }
  const c = new XpozClient({ apiKey: process.env.XPOZ_API_KEY ?? '', timeoutMs })
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
  // Check circuit breaker
  if (!xpozCircuitBreaker.canExecute()) {
    console.warn('[xpoz] searchSubredditPosts_circuit_open', { subreddit })
    return []
  }

  const normalized = normalizeSubreddit(subreddit)
  const queries = buildSearchQueries(query)

  const allResults = await Promise.allSettled(
    queries.map((q) =>
      withRetry(
        async () => {
          const results = await withClient(async (c) => {
            const r = await c.reddit.searchPosts(q, {
              subreddit: normalized,
              sort: 'relevance',
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (r.data as any[]).map((p) => normalizePost(p, normalized))
          }, client)
          xpozCircuitBreaker.recordSuccess()
          return results
        },
        {
          operationName: 'searchPosts',
          context: { subreddit: normalized, query: q },
        }
      ).catch((error) => {
        xpozCircuitBreaker.recordFailure()
        if (error instanceof OperationTimeoutError) {
          console.warn('[xpoz] searchPosts_timeout', {
            subreddit: normalized,
            query: q,
            operationId: error.operationId,
          })
        } else if (error instanceof OperationFailedError) {
          console.warn('[xpoz] searchPosts_failed', {
            subreddit: normalized,
            query: q,
            message: error.message,
          })
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
    circuitBreaker: xpozCircuitBreaker.getStatus(),
  })

  return merged.slice(0, limit)
}

export async function getPostWithComments(
  postId: string,
  client?: XpozClient,
  postMetadata?: { commentsCount?: number | null; score?: number | null }
): Promise<{ post: XpozPost; comments: XpozComment[] } | null> {
  // Check circuit breaker
  if (!xpozCircuitBreaker.canExecute()) {
    console.warn('[xpoz] getPostWithComments_circuit_open', { postId })
    return null
  }

  // Use adaptive timeout based on post characteristics
  const timeoutMs = postMetadata ? getAdaptiveTimeout(postMetadata) : DEFAULT_TIMEOUT_MS

  try {
    const result = await withRetry(
      async () => {
        const r = await withClient(async (c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = (await c.reddit.getPostWithComments(postId)) as any

          // Handle case where post is null/undefined
          if (!res?.post) {
            console.warn('[xpoz] getPostWithComments_no_post', { postId })
            return null
          }

          const p = res.post
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
          const comments: XpozComment[] = ((res.comments ?? []) as Array<{
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
        }, client, timeoutMs)
        xpozCircuitBreaker.recordSuccess()
        return r
      },
      {
        operationName: 'getPostWithComments',
        context: { postId, timeoutMs },
      }
    )

    return result
  } catch (error) {
    xpozCircuitBreaker.recordFailure()
    if (error instanceof OperationTimeoutError) {
      console.warn('[xpoz] getPostWithComments_timeout', {
        postId,
        operationId: error.operationId,
        elapsedMs: error.elapsedMs,
        timeoutMs,
      })
    } else if (error instanceof OperationFailedError) {
      console.warn('[xpoz] getPostWithComments_failed', { postId, message: error.message })
    } else {
      console.error('[xpoz] getPostWithComments_error', { postId, error })
    }
    return null
  }
}

const FLASH_MODEL = 'gemini-3.1-flash-lite-preview'

export type SubredditSuggestion = {
  name: string
  postCount: number
  samplePosts: Array<{
    title: string | null
    score: number | null
    permalink: string
  }>
}

// Step 1: Generate search queries to find similar posts
async function generatePostSearchQueries(icpDescription: string): Promise<string[]> {
  console.log('[suggest] step_1_generate_queries', { icp: icpDescription })

  try {
    const { text } = await generateText({
      model: google(FLASH_MODEL),
      prompt: `You are searching Reddit to find posts from people with similar problems/situations.

User's situation: "${icpDescription}"

Generate 3 search queries that would find Reddit posts from people experiencing similar problems. Each query should:
- Be phrases people would actually use in post titles
- Focus on the problem/pain point, not the solution
- Be specific enough to find relevant posts

Return ONLY a JSON array of 3 search query strings.

Examples:
- "engineering students 3D printing prototype" → ["how to access 3D printer as student", "where to get prototype made", "CNC machine for beginners"]
- "high school SAT score" → ["how to improve SAT score", "SAT prep tips", "what's a good SAT score"]
- "career confusion internship AI" → ["can't find internship", "AI taking jobs career", "don't know what career to choose"]

Output only the JSON array, no explanation.`,
    })

    const cleaned = text.replace(/```json\s*|\s*```/g, '').trim()
    console.log('[suggest] step_1_gemini_response', { raw: text, cleaned })

    const queries = JSON.parse(cleaned)

    if (Array.isArray(queries) && queries.every((q) => typeof q === 'string')) {
      console.log('[suggest] step_1_queries_generated', { queries })
      return queries.slice(0, 3)
    }

    console.warn('[suggest] step_1_invalid_format', { queries })
  } catch (error) {
    console.warn('[suggest] step_1_error', { error })
  }

  console.log('[suggest] step_1_fallback', { fallback: icpDescription })
  return [icpDescription]
}

// Step 3: Score posts by relevance to ICP
async function scorePostRelevance(
  icpDescription: string,
  posts: XpozPost[]
): Promise<Array<XpozPost & { relevanceScore: number }>> {
  if (posts.length === 0) return []

  console.log('[suggest] step_3_scoring_posts', { count: posts.length })

  try {
    const postsPreview = posts.slice(0, 20).map((p, i) => ({
      index: i,
      title: p.title?.slice(0, 100),
      subreddit: p.subredditName,
    }))

    const { text } = await generateText({
      model: google(FLASH_MODEL),
      prompt: `Score how relevant each post is to this user's situation.

User's situation: "${icpDescription}"

Posts:
${JSON.stringify(postsPreview, null, 2)}

Return a JSON array of objects with { index, score } where score is 1-10 (10 = highly relevant, 1 = not relevant).
Consider: Does this post describe a similar problem? Is this person in a similar situation?

Output only the JSON array.`,
    })

    const cleaned = text.replace(/```json\s*|\s*```/g, '').trim()
    const scores = JSON.parse(cleaned)

    if (Array.isArray(scores)) {
      const scoreMap = new Map(scores.map((s: { index: number; score: number }) => [s.index, s.score]))
      return posts.slice(0, 20).map((p, i) => ({
        ...p,
        relevanceScore: scoreMap.get(i) ?? 5,
      }))
    }
  } catch (error) {
    console.warn('[suggest] step_3_scoring_error', { error })
  }

  // Fallback: assign default scores
  return posts.map((p) => ({ ...p, relevanceScore: 5 }))
}

export async function suggestSubreddits(
  query: string,
  client?: XpozClient
): Promise<SubredditSuggestion[]> {
  console.log('[suggest] start', { icp_description: query })

  // Check circuit breaker
  if (!xpozCircuitBreaker.canExecute()) {
    console.warn('[suggest] circuit_open_using_fallback')
    return expandKeywordsToSubreddits(query)
      .slice(0, 5)
      .map((name) => ({
        name,
        postCount: 0,
        samplePosts: [],
      }))
  }

  // Step 1: Generate search queries to find similar posts
  const searchQueries = await generatePostSearchQueries(query)

  // Step 2: Search for posts with each query
  try {
    const allPosts = await withClient(async (c) => {
      const posts: XpozPost[] = []

      for (const searchQuery of searchQueries) {
        console.log('[suggest] step_2_searching', { query: searchQuery })

        const results = await c.reddit.searchPosts(searchQuery, {
          sort: 'relevance',
          limit: 20,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryPosts = results.data as any[]

        console.log('[suggest] step_2_posts_found', {
          searchQuery,
          count: queryPosts.length,
          samples: queryPosts.slice(0, 3).map((p: any) => ({
            title: p.title?.slice(0, 60),
            subreddit: p.subredditName,
          })),
        })

        for (const p of queryPosts) {
          posts.push({
            id: String(p.id ?? ''),
            title: (p.title as string | null) ?? null,
            selftext: (p.selftext as string | null) ?? null,
            authorUsername: String(p.authorUsername ?? 'unknown'),
            score: (p.score as number | null) ?? null,
            commentsCount: (p.commentsCount as number | null) ?? null,
            subredditName: String(p.subredditName ?? ''),
            permalink: String(p.permalink ?? ''),
          })
        }
      }

      return posts
    }, client)

    // Step 3: Score posts by relevance to ICP
    const scoredPosts = await scorePostRelevance(query, allPosts)

    console.log('[suggest] step_3_scored_posts', {
      total: scoredPosts.length,
      topPosts: scoredPosts
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 10)
        .map((p) => ({
          title: p.title?.slice(0, 60),
          subreddit: p.subredditName,
          relevanceScore: p.relevanceScore,
        })),
    })

    // Step 4: Aggregate by subreddit, weighted by relevance
    const subredditData = new Map<string, { posts: typeof scoredPosts; totalRelevance: number }>()

    for (const post of scoredPosts) {
      if (!post.subredditName) continue

      if (!subredditData.has(post.subredditName)) {
        subredditData.set(post.subredditName, { posts: [], totalRelevance: 0 })
      }
      const data = subredditData.get(post.subredditName)!
      data.posts.push(post)
      data.totalRelevance += post.relevanceScore
    }

    // Step 5: Build suggestions sorted by total relevance
    const suggestions: SubredditSuggestion[] = []
    for (const [name, data] of subredditData.entries()) {
      const topPosts = data.posts.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 3)

      suggestions.push({
        name,
        postCount: data.posts.length,
        samplePosts: topPosts.map((p) => ({
          title: p.title,
          score: p.score,
          permalink: p.permalink,
        })),
      })
    }

    const sorted = suggestions
      .sort((a, b) => {
        const aData = subredditData.get(a.name)!
        const bData = subredditData.get(b.name)!
        return bData.totalRelevance - aData.totalRelevance
      })
      .slice(0, 5)

    xpozCircuitBreaker.recordSuccess()

    console.log('[suggest] step_4_final', {
      count: sorted.length,
      suggestions: sorted.map((s) => {
        const data = subredditData.get(s.name)!
        return {
          subreddit: s.name,
          postCount: s.postCount,
          totalRelevance: data.totalRelevance,
          topPost: s.samplePosts[0]?.title?.slice(0, 60),
        }
      }),
    })

    return sorted
  } catch (error) {
    xpozCircuitBreaker.recordFailure()
    if (error instanceof OperationTimeoutError) {
      console.warn('[suggest] error_timeout', { query, operationId: error.operationId })
    } else if (error instanceof OperationFailedError) {
      console.warn('[suggest] error_failed', { query, message: error.message })
    } else {
      console.error('[suggest] error', { query, error })
    }
  }

  console.log('[suggest] fallback')
  return expandKeywordsToSubreddits(query)
    .slice(0, 5)
    .map((name) => ({
      name,
      postCount: 0,
      samplePosts: [],
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-BASED DISCOVERY: Find relevant posts directly from ICP
// ─────────────────────────────────────────────────────────────────────────────

export type RelevantPost = XpozPost & {
  relevanceScore: number
  painScore: number
}

/**
 * Find relevant posts across Reddit based on ICP description.
 * This replaces the subreddit-based discovery with direct post search.
 */
export async function findRelevantPosts(
  icpDescription: string,
  limit: number = 50,
  client?: XpozClient
): Promise<RelevantPost[]> {
  console.log('[findPosts] start', { icp: icpDescription, limit })

  // Check circuit breaker
  if (!xpozCircuitBreaker.canExecute()) {
    console.warn('[findPosts] circuit_open')
    return []
  }

  // Step 1: Generate search queries optimized for finding similar posts
  const searchQueries = await generatePostSearchQueries(icpDescription)
  console.log('[findPosts] queries_generated', { queries: searchQueries })

  // Step 2: Search for posts with each query
  try {
    const allPosts = await withClient(async (c) => {
      const posts: XpozPost[] = []
      const seen = new Set<string>()

      for (const searchQuery of searchQueries) {
        console.log('[findPosts] searching', { query: searchQuery })

        const results = await c.reddit.searchPosts(searchQuery, {
          sort: 'relevance',
          limit: 30,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryPosts = results.data as any[]

        console.log('[findPosts] posts_found', {
          query: searchQuery,
          count: queryPosts.length,
        })

        for (const p of queryPosts) {
          const id = String(p.id ?? '')
          if (!id || seen.has(id)) continue
          seen.add(id)

          posts.push({
            id,
            title: (p.title as string | null) ?? null,
            selftext: (p.selftext as string | null) ?? null,
            authorUsername: String(p.authorUsername ?? 'unknown'),
            score: (p.score as number | null) ?? null,
            commentsCount: (p.commentsCount as number | null) ?? null,
            subredditName: String(p.subredditName ?? ''),
            permalink: String(p.permalink ?? ''),
          })
        }
      }

      return posts
    }, client)

    console.log('[findPosts] total_unique_posts', { count: allPosts.length })

    if (allPosts.length === 0) {
      return []
    }

    // Step 3: Score posts by relevance to ICP
    const scoredPosts = await scorePostRelevance(icpDescription, allPosts)

    // Step 4: Add pain scores and sort by relevance
    const relevantPosts: RelevantPost[] = scoredPosts
      .map((p) => ({
        ...p,
        painScore: computePainScore(p),
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit)

    xpozCircuitBreaker.recordSuccess()

    console.log('[findPosts] final_posts', {
      count: relevantPosts.length,
      topPosts: relevantPosts.slice(0, 5).map((p) => ({
        title: p.title?.slice(0, 60),
        subreddit: p.subredditName,
        relevanceScore: p.relevanceScore,
        painScore: p.painScore,
      })),
    })

    return relevantPosts
  } catch (error) {
    xpozCircuitBreaker.recordFailure()
    if (error instanceof OperationTimeoutError) {
      console.warn('[findPosts] error_timeout', { operationId: error.operationId })
    } else if (error instanceof OperationFailedError) {
      console.warn('[findPosts] error_failed', { message: error.message })
    } else {
      console.error('[findPosts] error', { error })
    }
    return []
  }
}