import test from 'node:test'
import assert from 'node:assert/strict'

import {
  dedupeSubreddits,
  extractSuggestedSubreddits,
  parseSubreddits,
} from './intake'

test('extractSuggestedSubreddits returns an empty list when no suggestions are available', () => {
  assert.deepEqual(extractSuggestedSubreddits({}), [])
  assert.deepEqual(extractSuggestedSubreddits(''), [])
})

test('extractSuggestedSubreddits normalizes and caps subreddit results', () => {
  assert.deepEqual(
    extractSuggestedSubreddits({
      subreddits: ['r/SaaS', 'indiehackers', 'SaaS', 'startups', 'marketing', 'agency'],
    }),
    ['SaaS', 'indiehackers', 'startups', 'marketing', 'agency'],
  )
})

test('parseSubreddits accepts json and comma-separated lists', () => {
  assert.deepEqual(parseSubreddits('["r/SaaS", "indiehackers"]'), ['SaaS', 'indiehackers'])
  assert.deepEqual(parseSubreddits('r/startups, marketing'), ['startups', 'marketing'])
})

test('dedupeSubreddits removes blanks and preserves the first five unique values', () => {
  assert.deepEqual(
    dedupeSubreddits(['', 'r/SaaS', 'SaaS', 'indiehackers', 'startups', 'marketing', 'agency']),
    ['SaaS', 'indiehackers', 'startups', 'marketing', 'agency'],
  )
})
