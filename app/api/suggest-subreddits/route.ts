import { NextResponse } from 'next/server'
import { SuggestSubredditsSchema } from '../../../lib/validation'
import { suggestSubreddits } from '../../../lib/gemini'

const DEFAULT_SUBREDDITS = ['SaaS', 'indiehackers', 'startups']

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  console.log('[api/suggest-subreddits] request_body', body)
  const parsed = SuggestSubredditsSchema.safeParse(body)

  if (!parsed.success) {
    console.error('[api/suggest-subreddits] validation_failed', parsed.error.flatten())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const subreddits = await suggestSubreddits(parsed.data.icp_description)
    const safeSubreddits =
      subreddits.length > 0 ? subreddits : DEFAULT_SUBREDDITS
    console.log('[api/suggest-subreddits] success', {
      icpLength: parsed.data.icp_description.length,
      count: safeSubreddits.length,
      subreddits: safeSubreddits,
    })
    return NextResponse.json({ subreddits: safeSubreddits })
  } catch (error) {
    console.error('[api/suggest-subreddits] failed', error)
    return NextResponse.json({ subreddits: DEFAULT_SUBREDDITS })
  }
}
