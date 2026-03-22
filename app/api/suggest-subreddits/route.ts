import { NextResponse } from 'next/server'
import { SuggestSubredditsSchema } from '../../../lib/validation'
import { suggestSubreddits, SubredditSuggestion } from '../../../lib/xpoz'

const DEFAULT_SUGGESTIONS: SubredditSuggestion[] = [
  { name: 'SaaS', postCount: 0, samplePosts: [] },
  { name: 'indiehackers', postCount: 0, samplePosts: [] },
  { name: 'startups', postCount: 0, samplePosts: [] },
]

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  console.log('[api/suggest-subreddits] request_body', body)
  const parsed = SuggestSubredditsSchema.safeParse(body)

  if (!parsed.success) {
    console.error('[api/suggest-subreddits] validation_failed', parsed.error.flatten())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const suggestions = await suggestSubreddits(parsed.data.icp_description)
    const safeSuggestions = suggestions.length > 0 ? suggestions : DEFAULT_SUGGESTIONS
    
    console.log('[api/suggest-subreddits] response', {
      icp: parsed.data.icp_description,
      count: safeSuggestions.length,
      suggestions: safeSuggestions.map(s => ({
        subreddit: s.name,
        postCount: s.postCount,
        reasoning: s.samplePosts.map(p => ({
          title: p.title?.slice(0, 60),
          score: p.score,
          url: `https://reddit.com${p.permalink}`
        }))
      }))
    })
    
    return NextResponse.json({ suggestions: safeSuggestions })
  } catch (error) {
    console.error('[api/suggest-subreddits] failed', error)
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS })
  }
}
