import { describe, expect, it } from 'bun:test'
import { buildMemorySearchPreview } from './service'

describe('buildMemorySearchPreview', () => {
  it('centers the preview around the first query match when possible', () => {
    const preview = buildMemorySearchPreview(
      'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda memory signal mu nu xi omicron pi rho sigma tau.',
      'memory signal'
    )

    expect(preview).toContain('memory signal')
    expect(preview.startsWith('Alpha')).toBe(false)
  })

  it('falls back to the opening content when there is no match', () => {
    const preview = buildMemorySearchPreview(
      'Alpha beta gamma delta epsilon zeta eta theta iota kappa.',
      'missing'
    )

    expect(preview).toBe('Alpha beta gamma delta epsilon zeta eta theta iota kappa.')
  })
})
