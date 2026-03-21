import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePersonaFragment } from './gemini'

test('parsePersonaFragment parses valid JSON', () => {
  const raw = JSON.stringify({
    stated_problem: 'pricing is hard',
    real_fear: 'customers will think I am a fraud',
    belief: 'price signals quality',
    intensity: 'high',
    quotes: ['I have no idea what to charge'],
  })

  const result = parsePersonaFragment(raw)
  assert.ok(result)
  assert.equal(result?.intensity, 'high')
  assert.equal(result?.quotes.length, 1)
})

test('parsePersonaFragment returns null for malformed JSON', () => {
  assert.equal(parsePersonaFragment('not json at all'), null)
})

test('parsePersonaFragment returns null when required fields are missing', () => {
  assert.equal(parsePersonaFragment(JSON.stringify({ foo: 'bar' })), null)
})
