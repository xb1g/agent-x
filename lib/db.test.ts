import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkText, createSegment, querySimilar, updateSegment } from './db'

test('chunkText splits long text into manageable chunks', () => {
  const long = 'word '.repeat(500)
  const chunks = chunkText(long)

  assert.ok(chunks.length > 1)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 1300)
  }
})

test('chunkText returns a single chunk for short text', () => {
  const short = 'This is a short post about pricing.'
  const chunks = chunkText(short)

  assert.equal(chunks.length, 1)
  assert.equal(chunks[0], short)
})

test('chunkText returns an empty array for empty text', () => {
  assert.deepEqual(chunkText(''), [])
})

test('createSegment posts a new segment row and returns its id', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify([{ id: 'segment-1' }]), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const originalEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  try {
    const id = await createSegment('bootstrapper founders', ['SaaS'])
    assert.equal(id, 'segment-1')
    assert.ok(calls[0]?.url.includes('/rest/v1/segments'))
  } finally {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key
  }
})

test('updateSegment sends a patch request to segments', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify([{ id: 'segment-1' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const originalEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  try {
    await updateSegment('segment-1', { status: 'ready' })
    assert.ok(calls[0]?.url.includes('/rest/v1/segments'))
    assert.equal(calls[0]?.init?.method, 'PATCH')
  } finally {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key
  }
})

test('querySimilar uses the rpc endpoint and parses chunk_text rows', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify([{ chunk_text: 'pricing anxiety', similarity: 0.91 }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const originalEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  try {
    const result = await querySimilar('segment-1', [0.1, 0.2, 0.3], 2)
    assert.deepEqual(result, ['pricing anxiety'])
    assert.ok(calls[0]?.url.includes('/rest/v1/rpc/match_embeddings'))
  } finally {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key
  }
})
