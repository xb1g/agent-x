import { normalizeSubreddit } from './validation'

export type SuggestionPayload = { subreddits?: string[] } | string[] | string

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

  if (Array.isArray(payload.subreddits)) {
    return dedupeSubreddits(payload.subreddits)
  }

  return []
}
