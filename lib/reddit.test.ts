import test from 'node:test'
import assert from 'node:assert/strict'
import { computePainScore, fetchListing, fetchPost, normalizeSubreddit } from './reddit'

test('normalizeSubreddit strips the r/ prefix', () => {
  assert.equal(normalizeSubreddit('r/SaaS'), 'SaaS')
})

test('normalizeSubreddit leaves bare names unchanged', () => {
  assert.equal(normalizeSubreddit('SaaS'), 'SaaS')
})

test('computePainScore favors controversial complaint posts', () => {
  const score = computePainScore({
    title: 'struggling to figure out pricing, anyone else?',
    upvote_ratio: 0.51,
    num_comments: 300,
    score: 10,
  })

  assert.ok(score > 1.5)
})

test('computePainScore stays low for upbeat popular posts', () => {
  const score = computePainScore({
    title: 'Hit $10k MRR today!',
    upvote_ratio: 0.98,
    num_comments: 50,
    score: 500,
  })

  assert.ok(score < 0.5)
})

test('computePainScore handles null-like fields without throwing', () => {
  const score = computePainScore({
    title: null,
    upvote_ratio: null,
    num_comments: null,
    score: null,
  })

  assert.equal(Number.isNaN(score), false)
  assert.equal(typeof score, 'number')
})

test('fetchListing parses reddit search results', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: {
          children: [
            {
              data: {
                id: 'abc123',
                title: 'I am struggling with pricing',
                selftext: 'help',
                author: 'founder',
                score: 7,
                upvote_ratio: 0.61,
                num_comments: 42,
                subreddit: 'SaaS',
                permalink: '/r/SaaS/comments/abc123/post/',
              },
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch

  try {
    const results = await fetchListing('r/SaaS', 'pricing', 100)
    assert.equal(results.length, 1)
    assert.equal(results[0]?.id, 'abc123')
    assert.equal(results[0]?.subreddit, 'SaaS')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchPost parses reddit post and top comments', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          data: {
            children: [
              {
                data: {
                  id: 'abc123',
                  title: 'I am struggling with pricing',
                  selftext: 'help',
                  author: 'founder',
                  score: 7,
                  upvote_ratio: 0.61,
                  num_comments: 2,
                  subreddit: 'SaaS',
                  permalink: '/r/SaaS/comments/abc123/post/',
                },
              },
            ],
          },
        },
        {
          data: {
            children: [
              {
                kind: 't1',
                data: { body: 'same here', author: 'commenter', score: 11 },
              },
              {
                kind: 'more',
                data: {},
              },
            ],
          },
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch

  try {
    const result = await fetchPost('/r/SaaS/comments/abc123/post/')
    assert.ok(result)
    assert.equal(result?.post.id, 'abc123')
    assert.equal(result?.comments.length, 1)
    assert.equal(result?.comments[0]?.body, 'same here')
  } finally {
    globalThis.fetch = originalFetch
  }
})
