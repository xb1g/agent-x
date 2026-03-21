import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { DiscoverSchema } from '../../../lib/validation'
import { fetchListing, fetchPost, computePainScore } from '../../../lib/reddit'
import { embed, psychoanalyze, synthesize } from '../../../lib/gemini'
import {
  createSegment,
  updateSegment,
  upsertPost,
  upsertChunks,
  chunkText,
  getSegment,
} from '../../../lib/db'
import { MOCK_PERSONA } from '../../../lib/mockData'

export const maxDuration = 300

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
  const parsed = DiscoverSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { icp_description, subreddits } = parsed.data

  try {
    const segment_id = await createSegment(icp_description, subreddits)
    waitUntil(runPipeline(segment_id, icp_description, subreddits))

    return NextResponse.json({ segment_id, status: 'indexing' })
  } catch (error) {
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
  try {
    await updateSegment(segment_id, { status: 'reading' })

    const listingResults = await Promise.allSettled(
      subreddits.map((subreddit) => fetchListing(subreddit, icp_description))
    )

    const scoredPosts: Array<{
      post: {
        permalink: string
        title?: string | null
        selftext?: string | null
        score?: number | null
        upvote_ratio?: number | null
        num_comments?: number | null
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

    const fragments = await Promise.allSettled(
      topPosts.map(({ post, subreddit, pain_score }) =>
        deepReadPost(segment_id, post, subreddit, pain_score)
      )
    )

    const successfulFragments = fragments.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )

    if (successfulFragments.length < 5) {
      await updateSegment(segment_id, {
        status: 'failed',
        status_message:
          'Not enough signal - try broader keywords or different subreddits.',
      })
      return
    }

    await updateSegment(segment_id, { status: 'synthesizing' })

    const synthesis = await synthesize(successfulFragments, icp_description)

    if (!synthesis) {
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
  } catch {
    await updateSegment(segment_id, {
      status: 'failed',
      status_message: 'Unexpected error - please try again.',
      soul_document: MOCK_PERSONA.soul_document,
      persona_name: MOCK_PERSONA.persona_name,
    }).catch(() => {})
  }
}

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
) {
  const result = await fetchPost(post.permalink)
  if (!result) {
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
    upvote_ratio: fullPost.upvote_ratio,
    num_comments: fullPost.num_comments,
    pain_score,
  })

  if (!post_id) {
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
  } catch {
    // Embedding failures should not block psychoanalysis.
  }

  const commentsText = comments.map((comment) => comment.body).join('\n---\n')
  const fragment = await psychoanalyze(postText, commentsText)

  return fragment
}
