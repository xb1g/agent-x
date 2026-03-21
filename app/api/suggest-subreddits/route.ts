import { NextResponse } from 'next/server'
import { SuggestSubredditsSchema } from '../../../lib/validation'
import { suggestSubreddits } from '../../../lib/gemini'

const DEFAULT_SUBREDDITS = ['SaaS', 'indiehackers', 'startups']

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = SuggestSubredditsSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const subreddits = await suggestSubreddits(parsed.data.icp_description)
    return NextResponse.json({ subreddits })
  } catch {
    return NextResponse.json({ subreddits: DEFAULT_SUBREDDITS })
  }
}
