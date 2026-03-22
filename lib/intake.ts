import { normalizeSubreddit } from './validation'

export type SubredditSuggestionWithReasoning = {
  name: string
  postCount: number
  samplePosts: Array<{
    title: string | null
    score: number | null
    permalink: string
  }>
}

export type SuggestionPayload = 
  | { suggestions?: SubredditSuggestionWithReasoning[]; subreddits?: string[] }
  | string[]
  | string

export function buildQuery(
  customer: string,
  problem: string,
): string {
  const parts = [customer, problem]
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.join('. ').slice(0, 500)
}

export function buildIcpDescription(customer: string, problem: string): string {
  const c = customer.trim()
  const p = problem.trim()
  if (c && p) return `${c} — ${p}`
  return c || p || ''
}

export function dedupeSubreddits(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeSubreddit).filter(Boolean))).slice(0, 5)
}

export function parseSubreddits(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return dedupeSubreddits(parsed.map((item) => String(item)))
    }
  } catch {
    // Fall through to line and comma parsing.
  }

  return dedupeSubreddits(
    trimmed
      .split(/[\n,]/g)
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function extractSuggestedSubreddits(payload: SuggestionPayload): string[] {
  if (Array.isArray(payload)) {
    return dedupeSubreddits(payload)
  }

  if (typeof payload === 'string') {
    return parseSubreddits(payload)
  }

  // New format: { suggestions: [{ name, postCount, samplePosts }] }
  if (Array.isArray(payload.suggestions)) {
    return dedupeSubreddits(payload.suggestions.map((s) => s.name))
  }

  // Legacy format: { subreddits: string[] }
  if (Array.isArray(payload.subreddits)) {
    return dedupeSubreddits(payload.subreddits)
  }

  return []
}

export function extractSuggestionReasoning(payload: SuggestionPayload): SubredditSuggestionWithReasoning[] {
  if (typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.suggestions)) {
    return payload.suggestions
  }
  return []
}
