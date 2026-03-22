import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { XpozClient } from '@xpoz/xpoz'
import { DiscoverSchema } from '../../../lib/validation'
import {
  searchSubredditPosts,
  getPostWithComments,
  computePainScore,
  xpozCircuitBreaker,
  findRelevantPosts,
  type RelevantPost,
} from '../../../lib/xpoz'
import { embed, psychoanalyze, synthesize, type PersonaFragment } from '../../../lib/gemini'
import {
  createSegment,
  updateSegment,
  upsertPost,
  upsertChunks,
  chunkText,
  getSegment,
  addLog,
} from '../../../lib/db'
import { MOCK_PERSONA } from '../../../lib/mockData'

function deriveProvisionalName(icp: string): string {
  // Extract first 2-3 meaningful words from ICP description
  const words = icp.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean)
  // Skip common stop words
  const stops = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'is', 'are', 'with'])
  const significant = words.filter(w => !stops.has(w.toLowerCase())).slice(0, 2)
  if (!significant.length) return 'Persona'
  // Capitalize each
  return significant.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export const maxDuration = 300
const HAS_GEMINI_KEY =
  Boolean(process.env.GEMINI_API_KEY) &&
  process.env.GEMINI_API_KEY !== 'your_key_here'

const DISCOVER_LIMIT = 10
const DISCOVER_WINDOW_MS = 60 * 60 * 1000
const discoverRequests = new Map<
  string,
  {
    count: number
    resetAt: number
  }
>()

type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'
  )
}

function checkDiscoverRateLimit(ip: string): RateLimitResult {
  const now = Date.now()
  const existing = discoverRequests.get(ip)

  if (!existing || existing.resetAt <= now) {
    discoverRequests.set(ip, {
      count: 1,
      resetAt: now + DISCOVER_WINDOW_MS,
    })
    return { ok: true }
  }

  if (existing.count >= DISCOVER_LIMIT) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    }
  }

  existing.count += 1
  discoverRequests.set(ip, existing)
  return { ok: true }
}

export async function POST(req: Request) {
  const rateLimit = checkDiscoverRateLimit(getClientIp(req))
  if (!rateLimit.ok) {
    console.warn('[api/discover] rate_limited', rateLimit)
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      }
    )
  }

  const body = await req.json().catch(() => null)
  console.log('[api/discover] request_body', body)
  const parsed = DiscoverSchema.safeParse(body)

  if (!parsed.success) {
    console.error('[api/discover] validation_failed', parsed.error.flatten())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { icp_description, subreddits } = parsed.data
  console.log('[api/discover] validated', {
    icpLength: icp_description.length,
    subreddits: subreddits ?? 'none (will auto-discover)',
    hasGeminiKey: HAS_GEMINI_KEY,
  })

  try {
    const provisional_name = deriveProvisionalName(icp_description)
    const subredditList = subreddits ?? []
    const segment_id = await createSegment(icp_description, subredditList, provisional_name)
    console.log('[api/discover] segment_created', { segment_id })
    waitUntil(runPipeline(segment_id, icp_description, subredditList))

    return NextResponse.json({ segment_id, status: 'indexing' })
  } catch (error) {
    console.error('[api/discover] segment_create_failed', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create discovery segment',
      },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-HEAL: Track failures and auto-stop when rate is too high
// ─────────────────────────────────────────────────────────────────────────────

class PipelineHealthTracker {
  private successes = 0
  private failures = 0
  private consecutiveFailures = 0

  recordSuccess(): void {
    this.successes++
    this.consecutiveFailures = 0
  }

  recordFailure(): void {
    this.failures++
    this.consecutiveFailures++
  }

  shouldStop(): { stop: boolean; reason: string } {
    const total = this.successes + this.failures

    // Stop if too many consecutive failures (increased threshold)
    if (this.consecutiveFailures >= 10) {
      return {
        stop: true,
        reason: `Too many consecutive failures (${this.consecutiveFailures}). API may be rate limiting.`,
      }
    }

    // Stop if failure rate is too high (more than 80% failures after 15 attempts)
    if (total >= 15 && this.failures / total > 0.8) {
      return {
        stop: true,
        reason: `High failure rate (${Math.round((this.failures / total) * 100)}%). Try different subreddits.`,
      }
    }

    return { stop: false, reason: '' }
  }

  getStats(): { successes: number; failures: number; failureRate: number } {
    const total = this.successes + this.failures
    return {
      successes: this.successes,
      failures: this.failures,
      failureRate: total > 0 ? this.failures / total : 0,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const XPOZ_TIMEOUT_MS = 20000
const BATCH_SIZE = 5 // Process 5 posts at a time
const BATCH_DELAY_MS = 2000 // 2 second delay between batches
const MIN_FRAGMENTS = 1 // Lower threshold - need at least 1 fragment
const TARGET_FRAGMENTS = 10 // Stop early if we have this many

// Helper: sleep function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function runPipeline(
  segment_id: string,
  icp_description: string,
  subreddits?: string[]
) {
  let xpozClient: XpozClient | null = null
  const healthTracker = new PipelineHealthTracker()

  try {
    xpozClient = new XpozClient({ apiKey: process.env.XPOZ_API_KEY ?? '', timeoutMs: XPOZ_TIMEOUT_MS })
    await xpozClient.connect()

    console.log('[api/discover] pipeline_start', { segment_id, subreddits: subreddits ?? 'auto-discover' })
    await addLog(segment_id, subreddits?.length 
      ? `Pipeline started · ${subreddits.length} subreddits`
      : `Pipeline started · auto-discovering relevant posts`
    )
    await updateSegment(segment_id, { status: 'reading' })

    // Phase 1: Find relevant posts
    // If subreddits provided, use subreddit-based search
    // Otherwise, use AI-powered post discovery
    let topPosts: Array<{
      post: {
        id: string
        title?: string | null
        selftext?: string | null
        score?: number | null
        commentsCount?: number | null
      }
      subreddit: string
      pain_score: number
      relevance_score?: number
    }> = []

    if (subreddits && subreddits.length > 0) {
      // Legacy: Subreddit-based search
      const listingResults = await Promise.allSettled(
        subreddits.map((subreddit) => searchSubredditPosts(subreddit, icp_description, 50, xpozClient!))
      )
      const listingSummary = listingResults.map((result, index) => ({
        subreddit: subreddits[index],
        status: result.status,
        count: result.status === 'fulfilled' ? result.value.length : 0,
      }))
      console.log('[api/discover] listing_results', { segment_id, settled: listingSummary })

      for (const { subreddit, count, status } of listingSummary) {
        await addLog(
          segment_id,
          status === 'fulfilled'
            ? `r/${subreddit} · ${count} posts found`
            : `r/${subreddit} · search failed`
        )
      }

      // Score and rank posts
      const scoredPosts: typeof topPosts = []
      listingResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') return
        const subreddit = subreddits[index]
        for (const post of result.value) {
          scoredPosts.push({
            post,
            subreddit,
            pain_score: computePainScore(post),
          })
        }
      })

      // Take top posts per subreddit
      for (const subreddit of subreddits) {
        const subredditPosts = scoredPosts
          .filter((p) => p.subreddit === subreddit)
          .sort((a, b) => b.pain_score - a.pain_score)
          .slice(0, 10)
        topPosts.push(...subredditPosts)
      }
    } else {
      // New: AI-powered post discovery
      await addLog(segment_id, `Searching for relevant posts across Reddit...`)
      
      const relevantPosts = await findRelevantPosts(icp_description, 50, xpozClient!)
      
      console.log('[api/discover] relevant_posts_found', {
        segment_id,
        count: relevantPosts.length,
        subreddits: [...new Set(relevantPosts.map(p => p.subredditName))],
      })

      // Log discovered subreddits
      const subredditCounts = new Map<string, number>()
      for (const post of relevantPosts) {
        subredditCounts.set(post.subredditName, (subredditCounts.get(post.subredditName) ?? 0) + 1)
      }
      
      const topSubreddits = [...subredditCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      
      for (const [subreddit, count] of topSubreddits) {
        await addLog(segment_id, `r/${subreddit} · ${count} relevant posts`)
      }

      // Convert to topPosts format
      topPosts = relevantPosts.map((p) => ({
        post: p,
        subreddit: p.subredditName,
        pain_score: p.painScore,
        relevance_score: p.relevanceScore,
      }))
    }

    console.log('[api/discover] top_posts_ready', {
      segment_id,
      topPosts: topPosts.length,
    })
    await addLog(segment_id, `Phase 1 complete · ${topPosts.length} posts to analyze`)

    if (topPosts.length === 0) {
      await updateSegment(segment_id, {
        status: 'failed',
        status_message: 'No relevant posts found. Try broadening your ICP description.',
      })
      return
    }

    if (!HAS_GEMINI_KEY) {
      console.warn('[api/discover] mock_persona_mode', { segment_id })
      await addLog(segment_id, `Mock persona mode · Gemini key not configured`)
      
      // Extract subreddits from discovered posts
      const discoveredSubreddits = [...new Set(topPosts.map(p => p.subreddit))]
      
      await updateSegment(segment_id, {
        status: 'ready',
        soul_document: MOCK_PERSONA.soul_document,
        persona_name: MOCK_PERSONA.persona_name,
        segment_size: {
          posts_indexed: topPosts.length,
          fragments_collected: 0,
          subreddits: subreddits ?? discoveredSubreddits,
          label: `${topPosts.length} posts · mock persona mode`,
        },
        status_message: 'Mock persona mode - Gemini not configured.',
      })
      return
    }

    // Phase 2: Process posts in batches with delays
    const fragments: PersonaFragment[] = []
    let processedCount = 0
    let batchNumber = 0

    await addLog(segment_id, `Starting deep read · ${topPosts.length} posts in batches of ${BATCH_SIZE}`)

    // Process in batches
    for (let i = 0; i < topPosts.length; i += BATCH_SIZE) {
      batchNumber++
      const batch = topPosts.slice(i, i + BATCH_SIZE)

      console.log('[api/discover] batch_start', {
        segment_id,
        batch: batchNumber,
        batchSize: batch.length,
        totalProcessed: processedCount,
        fragments: fragments.length,
      })

      // Check if we have enough fragments
      if (fragments.length >= TARGET_FRAGMENTS) {
        console.log('[api/discover] target_reached', {
          segment_id,
          fragments: fragments.length,
          target: TARGET_FRAGMENTS,
        })
        await addLog(segment_id, `Target reached · ${fragments.length} fragments collected`)
        break
      }

      // Check health before processing batch
      const healthCheck = healthTracker.shouldStop()
      if (healthCheck.stop) {
        console.warn('[api/discover] auto_stop', {
          segment_id,
          reason: healthCheck.reason,
          stats: healthTracker.getStats(),
        })
        await addLog(segment_id, `Auto-stopped: ${healthCheck.reason}`)
        break
      }

      // Check circuit breaker
      if (!xpozCircuitBreaker.canExecute()) {
        console.warn('[api/discover] circuit_breaker_open', { segment_id })
        await addLog(segment_id, 'API temporarily unavailable - waiting 30s')
        await sleep(30000) // Wait for circuit breaker to reset
      }

      // Process batch sequentially with small delays
      for (const { post, subreddit, pain_score } of batch) {
        processedCount++

        try {
          const fragment = await deepReadPost(segment_id, post, subreddit, pain_score, xpozClient!)

          if (fragment) {
            fragments.push(fragment)
            healthTracker.recordSuccess()
            console.log('[api/discover] fragment_captured', {
              segment_id,
              post_id: post.id,
              totalFragments: fragments.length,
            })
          } else {
            healthTracker.recordFailure()
          }
        } catch (error) {
          healthTracker.recordFailure()
          console.error('[api/discover] post_processing_error', {
            segment_id,
            post_id: post.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        // Small delay between posts to avoid rate limiting
        await sleep(500)
      }

      // Log batch progress
      const stats = healthTracker.getStats()
      await addLog(
        segment_id,
        `Batch ${batchNumber} done · ${processedCount}/${topPosts.length} posts · ${fragments.length} fragments`
      )

      // Delay between batches
      if (i + BATCH_SIZE < topPosts.length) {
        console.log('[api/discover] batch_delay', { segment_id, delayMs: BATCH_DELAY_MS })
        await sleep(BATCH_DELAY_MS)
      }
    }

    console.log('[api/discover] deep_read_complete', {
      segment_id,
      processed: processedCount,
      total: topPosts.length,
      fragments: fragments.length,
      stats: healthTracker.getStats(),
      circuitBreaker: xpozCircuitBreaker.getStatus(),
    })

    // Check if we have enough fragments (lowered threshold)
    if (fragments.length < MIN_FRAGMENTS) {
      console.warn('[api/discover] insufficient_signal', {
        segment_id,
        count: fragments.length,
        postsAttempted: processedCount,
        stats: healthTracker.getStats(),
      })
      await addLog(
        segment_id,
        `Insufficient signal · ${fragments.length} fragments from ${processedCount} posts`
      )
      await updateSegment(segment_id, {
        status: 'failed',
        status_message: `Not enough signal (${fragments.length} fragments from ${processedCount} posts). Try broadening your ICP description.`,
      })
      return
    }

    // Phase 3: Synthesize persona
    await addLog(segment_id, `Synthesizing persona · ${fragments.length} fragments`)
    await updateSegment(segment_id, { status: 'synthesizing' })

    const synthesis = await synthesize(fragments, icp_description)

    if (!synthesis) {
      console.error('[api/discover] synthesis_failed', { segment_id })
      const existing = await getSegment(segment_id)
      await updateSegment(segment_id, {
        status: 'failed',
        status_message: 'Synthesis failed - try again.',
        soul_document: existing?.soul_document ?? MOCK_PERSONA.soul_document,
        persona_name: existing?.persona_name ?? MOCK_PERSONA.persona_name,
      })
      return
    }

    // Extract subreddits from discovered posts for the final segment
    const discoveredSubreddits = [...new Set(topPosts.map(p => p.subreddit))]

    await updateSegment(segment_id, {
      status: 'ready',
      soul_document: synthesis.soul_document,
      persona_name: synthesis.persona_name,
      segment_size: {
        posts_indexed: processedCount,
        fragments_collected: fragments.length,
        subreddits: subreddits ?? discoveredSubreddits,
        label: `${processedCount} posts · ${fragments.length} fragments`,
      },
    })

    console.log('[api/discover] pipeline_complete', {
      segment_id,
      persona_name: synthesis.persona_name,
      stats: healthTracker.getStats(),
    })
    await addLog(segment_id, `✓ Persona ready · ${synthesis.persona_name}`)

  } catch (error) {
    console.error('[api/discover] pipeline_failed', { segment_id, error })
    await addLog(segment_id, `Pipeline error · ${error instanceof Error ? error.message : 'unknown'}`)
    await updateSegment(segment_id, {
      status: 'failed',
      status_message: 'Unexpected error - please try again.',
      soul_document: MOCK_PERSONA.soul_document,
      persona_name: MOCK_PERSONA.persona_name,
    }).catch(() => {})
  } finally {
    await xpozClient?.close().catch(() => {})
  }
}

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
): Promise<PersonaFragment | null> {
  console.log('[api/discover] deep_read_start', {
    segment_id,
    subreddit,
    post_id: post.id,
    pain_score,
    postTitle: post.title?.substring(0, 50),
    commentsCount: post.commentsCount,
    score: post.score,
  })

  // Pass post metadata for adaptive timeout
  const result = await getPostWithComments(post.id, xpozClient, {
    commentsCount: post.commentsCount,
    score: post.score,
  })

  if (!result) {
    console.warn('[api/discover] fetch_post_empty', {
      segment_id,
      subreddit,
      post_id: post.id,
      postTitle: post.title?.substring(0, 50),
      commentsCount: post.commentsCount,
    })
    return null
  }

  const { post: fullPost, comments } = result

  // Need at least some content to analyze
  const postText = [fullPost.title, fullPost.selftext].filter(Boolean).join('\n\n')
  const commentsText = comments.map((c) => c.body).filter(Boolean).join('\n---\n')

  if (!postText && !commentsText) {
    console.warn('[api/discover] no_content', { segment_id, post_id: post.id })
    return null
  }

  // Save post to database
  const post_id = await upsertPost({
    segment_id,
    reddit_id: fullPost.id,
    subreddit,
    title: fullPost.title,
    body: fullPost.selftext,
    score: fullPost.score,
    upvote_ratio: null,
    num_comments: fullPost.commentsCount,
    pain_score,
  })

  if (!post_id) {
    console.warn('[api/discover] upsert_post_failed', {
      segment_id,
      subreddit,
      post_id: post.id,
    })
    // Continue anyway - we can still get a fragment
  }

  // Create embeddings (non-blocking)
  if (post_id && (postText || commentsText)) {
    const commentTexts = comments.map((comment) => comment.body).filter(Boolean)
    const allChunks = [
      ...chunkText(postText).map((text) => ({ text, type: 'post' as const })),
      ...commentTexts.flatMap((text) =>
        chunkText(text).map((chunk) => ({ text: chunk, type: 'comment' as const }))
      ),
    ]

    // Run embedding in background - don't wait for it
    embedAndSaveChunks(segment_id, post_id, allChunks, subreddit, pain_score).catch((error) => {
      console.error('[api/discover] embeddings_failed', {
        segment_id,
        post_id,
        error,
      })
    })
  }

  // Analyze and extract fragment
  const fragment = await psychoanalyze(postText, commentsText)
  console.log('[api/discover] psychoanalyze_result', {
    segment_id,
    post_id: post.id,
    success: Boolean(fragment),
    commentsCount: comments.length,
  })

  return fragment
}

// Background task to save embeddings
async function embedAndSaveChunks(
  segment_id: string,
  post_id: string,
  chunks: Array<{ text: string; type: 'post' | 'comment' }>,
  subreddit: string,
  pain_score: number
): Promise<void> {
  if (chunks.length === 0) return

  try {
    const embeddings = await Promise.all(chunks.map((chunk) => embed(chunk.text)))
    const rows = chunks.map((chunk, index) => ({
      post_id,
      segment_id,
      chunk_text: chunk.text,
      embedding: embeddings[index],
      metadata: {
        type: chunk.type,
        subreddit,
        pain_score,
      },
    }))

    await upsertChunks(rows)
    console.log('[api/discover] embeddings_saved', {
      segment_id,
      post_id,
      chunkCount: rows.length,
    })
  } catch (error) {
    console.error('[api/discover] embed_and_save_error', {
      segment_id,
      post_id,
      error,
    })
  }
}