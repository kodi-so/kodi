import { describe, expect, it } from 'bun:test'
import { truncateForVoice } from './voice-policy'

describe('voice-policy', () => {
  it('leaves short answers unchanged', () => {
    const text = 'We decided to update the UI this week.'

    expect(truncateForVoice(text)).toBe(text)
  })

  it('cuts long answers at a sentence boundary when possible', () => {
    const text =
      'We decided to update the web app UI before Friday. The follow-up is to clean up the navigation, tighten the spacing, and simplify the settings page so the release is easier to ship without regressions.'

    expect(truncateForVoice(text, 80)).toBe(
      'We decided to update the web app UI before Friday.'
    )
  })

  it('falls back to a word boundary when no sentence boundary is available', () => {
    const text =
      'Update the UI by simplifying navigation and reducing visual noise across the main dashboard experience for this release window'

    expect(truncateForVoice(text, 55)).toBe(
      'Update the UI by simplifying navigation and reducing…'
    )
  })
})
