import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type SegmentStatus =
  | 'indexing'
  | 'reading'
  | 'synthesizing'
  | 'ready'
  | 'failed'

export type Segment = {
  id: string
  icp_description: string
  subreddits: string[]
  soul_document: string | null
  persona_name: string | null
  segment_size: {
    posts_indexed: number
    fragments_collected: number
    subreddits: string[]
    label: string
  } | null
  status: SegmentStatus
  status_message: string | null
}

type SegmentUpdate = Partial<{
  status: SegmentStatus
  status_message: string
  soul_document: string
  persona_name: string
  segment_size: Record<string, unknown>
}>

let cachedClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (cachedClient) {
    return cachedClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  })

  return cachedClient
}

export function chunkText(text: string, charsPerChunk = 1200): string[] {
  if (!text) {
    return []
  }

  const normalized = text.trim()
  if (!normalized) {
    return []
  }

  const chunks: string[] = []
  let cursor = 0

  while (cursor < normalized.length) {
    chunks.push(normalized.slice(cursor, cursor + charsPerChunk))
    cursor += charsPerChunk
  }

  return chunks
}

export async function createSegment(
  icp_description: string,
  subreddits: string[]
): Promise<string> {
  const { data, error } = await getSupabase()
    .from('segments')
    .insert({ icp_description, subreddits, status: 'indexing' })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  if (Array.isArray(data)) {
    return String(data[0]?.id ?? '')
  }

  return String(data.id)
}

export async function getSegment(id: string): Promise<Segment | null> {
  const { data, error } = await getSupabase()
    .from('segments')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return null
  }

  return data as Segment
}

export async function updateSegment(
  id: string,
  updates: SegmentUpdate
): Promise<void> {
  const { error } = await getSupabase()
    .from('segments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw error
  }
}

export async function upsertPost(post: {
  segment_id: string
  reddit_id: string
  subreddit: string
  title: string | null
  body: string | null
  score: number | null
  upvote_ratio: number | null
  num_comments: number | null
  pain_score: number
}): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('posts')
    .upsert(post, { onConflict: 'reddit_id' })
    .select('id')
    .single()

  if (error) {
    return null
  }

  return data.id
}

export async function upsertChunks(
  chunks: Array<{
    post_id: string
    segment_id: string
    chunk_text: string
    embedding: number[]
    metadata: Record<string, unknown>
  }>
): Promise<void> {
  if (chunks.length === 0) {
    return
  }

  const { error } = await getSupabase().from('post_embeddings').insert(chunks)
  if (error) {
    throw error
  }
}

export async function querySimilar(
  segment_id: string,
  embedding: number[],
  limit = 5
): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('match_embeddings', {
    query_embedding: embedding,
    match_segment_id: segment_id,
    match_count: limit,
  })

  if (error || !Array.isArray(data)) {
    return []
  }

  return data
    .map((row) =>
      typeof row?.chunk_text === 'string' ? row.chunk_text : null
    )
    .filter((value): value is string => Boolean(value))
}
