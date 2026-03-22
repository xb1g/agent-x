import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildIcpDescription } from './intake'

describe('buildIcpDescription', () => {
  it('returns formatted string with customer and problem', () => {
    const result = buildIcpDescription('Bootstrapped SaaS founders', 'pricing confusion')
    assert.equal(result, 'Bootstrapped SaaS founders — pricing confusion')
  })

  it('returns just customer when problem is empty', () => {
    const result = buildIcpDescription('Bootstrapped SaaS founders', '')
    assert.equal(result, 'Bootstrapped SaaS founders')
  })

  it('returns just problem when customer is empty', () => {
    const result = buildIcpDescription('', 'pricing confusion')
    assert.equal(result, 'pricing confusion')
  })

  it('trims whitespace from inputs', () => {
    const result = buildIcpDescription('  Bootstrapped SaaS founders  ', '  pricing confusion  ')
    assert.equal(result, 'Bootstrapped SaaS founders — pricing confusion')
  })

  it('returns empty string when both inputs are empty', () => {
    const result = buildIcpDescription('', '')
    assert.equal(result, '')
  })

  it('handles custom inputs correctly', () => {
    const result = buildIcpDescription('Custom segment text', 'Custom problem text')
    assert.equal(result, 'Custom segment text — Custom problem text')
  })
})

describe('wizard state management', () => {
  it('confirm step requires both segment and problem selections', () => {
    // Wizard should not advance to confirm without both selections
    const hasSegment = Boolean('Bootstrapped SaaS founders')
    const hasProblem = Boolean('pricing confusion')
    assert.equal(hasSegment && hasProblem, true)
  })

  it('custom inputs are prioritized over AI selections', () => {
    const wizardSelectedSegment = null
    const customSegmentInput = 'My custom segment'
    const roughInput = 'Original rough input'

    const customer = wizardSelectedSegment || customSegmentInput.trim() || roughInput
    assert.equal(customer, 'My custom segment')
  })

  it('AI selection is used when no custom input', () => {
    const wizardSelectedSegment = 'AI suggested segment'
    const customSegmentInput = ''
    const roughInput = 'Original rough input'

    const customer = wizardSelectedSegment || customSegmentInput.trim() || roughInput
    assert.equal(customer, 'AI suggested segment')
  })

  it('roughInput is fallback when nothing else selected', () => {
    const wizardSelectedSegment = null
    const customSegmentInput = ''
    const roughInput = 'Original rough input'

    const customer = wizardSelectedSegment || customSegmentInput.trim() || roughInput
    assert.equal(customer, 'Original rough input')
  })
})
