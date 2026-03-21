import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { XpozClient } from '@xpoz/xpoz'
import { DiscoverSchema } from '../../../lib/validation'
import { searchSubredditPosts, getPostWithComments, computePainScore } from '../../../lib/xpoz'
import { embed, psychoanalyze, synthesize } from '../../../lib/gemini'
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
    subreddits,
    hasGeminiKey: HAS_GEMINI_KEY,
  })

  try {
    const provisional_name = deriveProvisionalName(icp_description)
    const segment_id = await createSegment(icp_description, subreddits, provisional_name)
    console.log('[api/discover] segment_created', { segment_id })
    waitUntil(runPipeline(segment_id, icp_description, subreddits))

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

async function runPipeline(
  segment_id: string,
  icp_description: string,
  subreddits: string[]
) {
  let xpozClient: XpozClient | null = null
  try {
    xpozClient = new XpozClient({ apiKey: process.env.XPOZ_API_KEY ?? '' })
    await xpozClient.connect()

    console.log('[api/discover] pipeline_start', { segment_id, subreddits })
    await addLog(segment_id, `Pipeline started · ${subreddits.length} subreddits`)
    await updateSegment(segment_id, { status: 'reading' })
    console.log('[api/discover] segment_status', { segment_id, status: 'reading' })

    const listingResults = await Promise.allSettled(
      subreddits.map((subreddit) => searchSubredditPosts(subreddit, icp_description, 100, xpozClient!))
    )
    console.log('[api/discover] listing_results', {
      segment_id,
      settled: listingResults.map((result, index) => ({
        subreddit: subreddits[index],
        status: result.status,
        count: result.status === 'fulfilled' ? result.value.length : 0,
      })),
    })

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

    listingResults.forEach((result, index) => {
      if (result.status !== 'fulfilled') {
        return
      }

      const subreddit = subreddits[index]
      for (const post of result.value) {
        scoredPosts.push({
          post,
          subreddit,
          pain_score: computePainScore(post),
        })
      }
    })

    const topPosts: typeof scoredPosts = []
    for (const subreddit of subreddits) {
      const subredditPosts = scoredPosts
        .filter((post) => post.subreddit === subreddit)
        .sort((a, b) => b.pain_score - a.pain_score)
        .slice(0, 20)

      topPosts.push(...subredditPosts)
    }
    console.log('[api/discover] top_posts_ready', {
      segment_id,
      scoredPosts: scoredPosts.length,
      topPosts: topPosts.length,
    })
    await addLog(segment_id, `Phase 1 complete · ${topPosts.length} posts scored`)

    if (!HAS_GEMINI_KEY) {
      console.warn('[api/discover] mock_persona_mode', { segment_id })
      await addLog(segment_id, `Mock persona mode · Gemini key not configured`)
      await updateSegment(segment_id, {
        status: 'ready',
        soul_document: MOCK_PERSONA.soul_document,
        persona_name: MOCK_PERSONA.persona_name,
        segment_size: {
          posts_indexed: topPosts.length,
          fragments_collected: 0,
          subreddits,
          label: topPosts.length
            ? `${topPosts.length} posts indexed locally · mock persona mode`
            : 'Mock persona mode',
        },
        status_message:
          'Gemini is not configured locally, so the board is using a mock persona backed by the indexed Reddit sources.',
      })
      return
    }

    const fragments = await Promise.allSettled(
      topPosts.map(({ post, subreddit, pain_score }) =>
        deepReadPost(segment_id, post, subreddit, pain_score, xpozClient!)
      )
    )
    console.log('[api/discover] deep_read_results', {
      segment_id,
      total: fragments.length,
      fulfilled: fragments.filter((result) => result.status === 'fulfilled').length,
    })

    const successfulFragments = fragments.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )
    console.log('[api/discover] fragments_ready', {
      segment_id,
      count: successfulFragments.length,
    })

    if (successfulFragments.length < 5) {
      console.warn('[api/discover] insufficient_signal', {
        segment_id,
        count: successfulFragments.length,
      })
      await addLog(segment_id, `Insufficient signal · ${successfulFragments.length} fragments collected`)
      await updateSegment(segment_id, {
        status: 'failed',
        status_message:
          'Not enough signal - try broader keywords or different subreddits.',
      })
      return
    }

    await addLog(segment_id, `Synthesis started · ${successfulFragments.length} fragments`)
    await updateSegment(segment_id, { status: 'synthesizing' })
    console.log('[api/discover] segment_status', { segment_id, status: 'synthesizing' })

    const synthesis = await synthesize(successfulFragments, icp_description)

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

    await updateSegment(segment_id, {
      status: 'ready',
      soul_document: synthesis.soul_document,
      persona_name: synthesis.persona_name,
      segment_size: {
        posts_indexed: topPosts.length,
        fragments_collected: successfulFragments.length,
        subreddits,
        label: `${topPosts.length} posts - ~${successfulFragments.length * 40} comments analysed`,
      },
    })
    console.log('[api/discover] pipeline_complete', {
      segment_id,
      persona_name: synthesis.persona_name,
    })
    await addLog(segment_id, `Persona ready · ${synthesis.persona_name}`)
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
) {
  console.log('[api/discover] deep_read_start', {
    segment_id,
    subreddit,
    post_id: post.id,
    pain_score,
  })
  await addLog(segment_id, `Reading post ${post.id} from r/${subreddit}`)
  const result = await getPostWithComments(post.id, xpozClient)
  if (!result) {
    console.warn('[api/discover] fetch_post_empty', {
      segment_id,
      subreddit,
      post_id: post.id,
    })
    return null
  }

  const { post: fullPost, comments } = result

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
    return null
  }

  const postText = [fullPost.title, fullPost.selftext].filter(Boolean).join('\n\n')
  const commentTexts = comments.map((comment) => comment.body)
  const allChunks = [
    ...chunkText(postText).map((text) => ({ text, type: 'post' as const })),
    ...commentTexts.flatMap((text) =>
      chunkText(text).map((chunk) => ({ text: chunk, type: 'comment' as const }))
    ),
  ]

  try {
    const embeddings = await Promise.all(allChunks.map((chunk) => embed(chunk.text)))
    const rows = allChunks.map((chunk, index) => ({
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
    await addLog(segment_id, `Embeddings saved · ${rows.length} chunks from post ${post_id}`)
  } catch (error) {
    console.error('[api/discover] embeddings_failed', {
      segment_id,
      post_id,
      error,
    })
    // Embedding failures should not block psychoanalysis.
  }

  const commentsText = comments.map((comment) => comment.body).join('\n---\n')
  const fragment = await psychoanalyze(postText, commentsText)
  console.log('[api/discover] psychoanalyze_result', {
    segment_id,
    post_id,
    success: Boolean(fragment),
  })
  if (fragment) {
    await addLog(segment_id, `Analysed post ${post_id} · fragment captured`)
  } else {
    await addLog(segment_id, `Analysed post ${post_id} · no fragment`)
  }

  return fragment
}
