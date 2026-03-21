import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSubreddit, computePainScore } from './xpoz'

test('normalizeSubreddit strips the r/ prefix', () => {
  assert.equal(normalizeSubreddit('r/SaaS'), 'SaaS')
})

test('normalizeSubreddit leaves bare names unchanged', () => {
  assert.equal(normalizeSubreddit('SaaS'), 'SaaS')
})

test('normalizeSubreddit is case-insensitive for the prefix', () => {
  assert.equal(normalizeSubreddit('R/SaaS'), 'SaaS')
})

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