import test from 'node:test'
import assert from 'node:assert/strict'
import type { XpozClient } from '@xpoz/xpoz'
import { normalizeSubreddit, computePainScore, searchSubredditPosts } from './xpoz'

// ─── normalizeSubreddit ────────────────────────────────────────────────────────

test('normalizeSubreddit strips the r/ prefix', () => {
  assert.equal(normalizeSubreddit('r/SaaS'), 'SaaS')
})

test('normalizeSubreddit leaves bare names unchanged', () => {
  assert.equal(normalizeSubreddit('SaaS'), 'SaaS')
})

test('normalizeSubreddit is case-insensitive for the prefix', () => {
  assert.equal(normalizeSubreddit('R/SaaS'), 'SaaS')
})

// ─── computePainScore ─────────────────────────────────────────────────────────

test('computePainScore is higher for posts with complaint keywords and many comments', () => {
  const score = computePainScore({
    title: 'struggling to figure out pricing, anyone else?',
    commentsCount: 300,
    score: 10,
  })
  assert.ok(score > 1.5, `expected score > 1.5, got ${score}`)
})

test('computePainScore is low for upbeat popular posts', () => {
  const score = computePainScore({
    title: 'Hit $10k MRR today!',
    commentsCount: 50,
    score: 500,
  })
  assert.ok(score < 1.0, `expected score < 1.0, got ${score}`)
})

test('computePainScore handles null fields without throwing', () => {
  const score = computePainScore({ title: null, commentsCount: null, score: null })
  assert.equal(Number.isNaN(score), false)
  assert.equal(typeof score, 'number')
})

// ─── searchSubredditPosts ─────────────────────────────────────────────────────

test('searchSubredditPosts maps XPOZ results to XpozPost[]', async () => {
  const mockClient = {
    reddit: {
      searchPosts: async (_query: string, _opts: unknown) => ({
        data: [
          {
            id: 'abc123',
            title: 'Struggling with pricing',
            selftext: 'help please',
            authorUsername: 'founder',
            score: 7,
            commentsCount: 42,
            subredditName: 'SaaS',
            permalink: '/r/SaaS/comments/abc123/',
          },
        ],
      }),
    },
  }

  const results = await searchSubredditPosts(
    'r/SaaS',
    'pricing',
    10,
    mockClient as unknown as XpozClient
  )
  assert.equal(results.length, 1)
  assert.equal(results[0]?.id, 'abc123')
  assert.equal(results[0]?.subredditName, 'SaaS')
})

test('searchSubredditPosts strips r/ prefix before querying', async () => {
  let capturedOpts: unknown
  const mockClient = {
    reddit: {
      searchPosts: async (_query: string, opts: unknown) => {
        capturedOpts = opts
        return { data: [] }
      },
    },
  }

  await searchSubredditPosts('r/SaaS', 'pricing', 10, mockClient as unknown as XpozClient)
  assert.equal((capturedOpts as { subreddit: string }).subreddit, 'SaaS')
})

test('searchSubredditPosts returns empty array on error', async () => {
  const mockClient = {
    reddit: {
      searchPosts: async () => {
        throw new Error('network error')
      },
    },
  }

  const results = await searchSubredditPosts(
    'SaaS',
    'pricing',
    10,
    mockClient as unknown as XpozClient
  )
  assert.deepEqual(results, [])
})
