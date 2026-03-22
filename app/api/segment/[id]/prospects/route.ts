import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type ProspectsRouteContext =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> }

async function resolveParams(context: ProspectsRouteContext) {
  return await Promise.resolve(context.params)
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  })
}

export async function GET(_req: Request, context: ProspectsRouteContext) {
  const { id } = await resolveParams(context)
  console.log('[api/segment/prospects] lookup_start', { id })

  try {
    const { data, error } = await getSupabase()
      .from('posts')
      .select('reddit_id, subreddit, title, body, score, pain_score')
      .eq('segment_id', id)
      .gt('pain_score', 5)
      .order('pain_score', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[api/segment/prospects] query_failed', { id, error })
      return NextResponse.json(
        { error: 'Failed to fetch prospects' },
        { status: 500 }
      )
    }

    const prospects = (data || []).map((post) => {
      const snippet = post.body
        ? post.body.substring(0, 200) + (post.body.length > 200 ? '...' : '')
        : post.title || ''

      return {
        username: post.reddit_id,
        score: post.pain_score,
        snippet,
        subreddit: post.subreddit,
        upvotes: post.score ?? 0,
        postUrl: `https://reddit.com/r/${post.subreddit}/comments/${post.reddit_id}`,
        profileUrl: `https://reddit.com/user/${post.reddit_id}`,
      }
    })

    console.log('[api/segment/prospects] lookup_success', {
      id,
      count: prospects.length,
    })

    return NextResponse.json(prospects)
  } catch (error) {
    console.error('[api/segment/prospects] error', { id, error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
