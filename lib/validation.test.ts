import test from 'node:test'
import assert from 'node:assert/strict'
import { DiscoverSchema, ChatSchema, SuggestSubredditsSchema } from './validation'

test('DiscoverSchema accepts valid input and normalizes subreddit prefixes', () => {
  const result = DiscoverSchema.safeParse({
    icp_description: 'bootstrapped SaaS founders frustrated with pricing',
    subreddits: ['r/SaaS', 'r/indiehackers'],
  })

  assert.equal(result.success, true)
  if (result.success) {
    assert.deepEqual(result.data.subreddits, ['SaaS', 'indiehackers'])
  }
})

test('DiscoverSchema rejects more than five subreddits', () => {
  const result = DiscoverSchema.safeParse({
    icp_description: 'valid description here',
    subreddits: ['a', 'b', 'c', 'd', 'e', 'f'],
  })

  assert.equal(result.success, false)
})

test('DiscoverSchema rejects short ICP descriptions', () => {
  const result = DiscoverSchema.safeParse({
    icp_description: 'short',
    subreddits: ['SaaS'],
  })

  assert.equal(result.success, false)
})

test('SuggestSubredditsSchema accepts valid input', () => {
  const result = SuggestSubredditsSchema.safeParse({
    icp_description: 'indie hackers who struggle with pricing',
  })

  assert.equal(result.success, true)
})

test('ChatSchema caps message history at fifty items', () => {
  const result = ChatSchema.safeParse({
    segment_id: '550e8400-e29b-41d4-a716-446655440000',
    messages: Array.from({ length: 51 }, () => ({ role: 'user', content: 'hi' })),
  })

  assert.equal(result.success, false)
})
