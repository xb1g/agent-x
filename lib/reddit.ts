const USER_AGENT =
  'CustomerDiscoveryBot/1.0 (contact: hello@example.com)'

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

export type RedditPost = {
  id: string
  title: string | null
  selftext: string | null
  author: string
  score: number | null
  upvote_ratio: number | null
  num_comments: number | null
  subreddit: string
  permalink: string
}

export type RedditComment = {
  body: string
  author: string
  score: number
}

export function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, '')
}

export function computePainScore(post: Partial<RedditPost>): number {
  const ratio = post.upvote_ratio ?? 0.5
  const comments = post.num_comments ?? 0
  const title = (post.title ?? '').toLowerCase()
  const controversyWeight = ratio < 0.7 ? (1 - ratio) * 2 : 0
  const depthWeight = Math.min(comments / 500, 1) * 1.5
  const keywordScore =
    COMPLAINT_KEYWORDS.filter((keyword) => title.includes(keyword)).length * 0.5

  return controversyWeight + depthWeight + keywordScore
}

async function redditFetch(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      })

      if (response.status === 429 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
        continue
      }

      return response
    } catch (error) {
      if (attempt === retries) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  throw new Error('Reddit fetch failed after retries')
}

export async function fetchListing(
  subreddit: string,
  query: string,
  limit = 100
): Promise<RedditPost[]> {
  const normalizedSubreddit = normalizeSubreddit(subreddit)
  const search = encodeURIComponent(`${query} struggling frustrated help`)
  const url = `https://www.reddit.com/r/${normalizedSubreddit}/search.json?q=${search}&sort=new&limit=${limit}&restrict_sr=1`
  const response = await redditFetch(url)

  if (!response.ok) {
    return []
  }

  const data = await response.json()
  const children = data?.data?.children ?? []

  return children.map((child: { data: Record<string, unknown> }) => ({
    id: String(child.data.id ?? ''),
    title: (child.data.title as string | null) ?? null,
    selftext: (child.data.selftext as string | null) ?? null,
    author: String(child.data.author ?? 'unknown'),
    score: (child.data.score as number | null) ?? null,
    upvote_ratio: (child.data.upvote_ratio as number | null) ?? null,
    num_comments: (child.data.num_comments as number | null) ?? null,
    subreddit: String(child.data.subreddit ?? normalizedSubreddit),
    permalink: String(child.data.permalink ?? ''),
  }))
}

export async function fetchPost(
  permalink: string
): Promise<{ post: RedditPost; comments: RedditComment[] } | null> {
  try {
    const response = await redditFetch(
      `https://www.reddit.com${permalink}.json?limit=20`
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const postData = data?.[0]?.data?.children?.[0]?.data

    if (!postData) {
      return null
    }

    const post: RedditPost = {
      id: String(postData.id ?? ''),
      title: postData.title ?? null,
      selftext: postData.selftext ?? null,
      author: String(postData.author ?? 'unknown'),
      score: postData.score ?? null,
      upvote_ratio: postData.upvote_ratio ?? null,
      num_comments: postData.num_comments ?? null,
      subreddit: String(postData.subreddit ?? ''),
      permalink: String(postData.permalink ?? permalink),
    }

    const comments: RedditComment[] = (data?.[1]?.data?.children ?? [])
      .filter(
        (child: { kind?: string; data?: { body?: unknown } }) =>
          child.kind === 't1' && typeof child.data?.body === 'string'
      )
      .slice(0, 20)
      .map((child: { data: { body: string; author?: string; score?: number } }) => ({
        body: child.data.body,
        author: child.data.author ?? 'unknown',
        score: child.data.score ?? 0,
      }))

    return { post, comments }
  } catch {
    return null
  }
}
