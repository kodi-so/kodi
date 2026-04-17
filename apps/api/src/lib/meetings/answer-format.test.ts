import { describe, expect, it } from 'bun:test'
import { markdownToMeetingPlainText } from './answer-format'

describe('markdownToMeetingPlainText', () => {
  it('strips common markdown formatting for meeting chat', () => {
    const output = markdownToMeetingPlainText(
      '# Summary\n\n**Decision:** ship it.\n\n- first item\n- second item\n\n[Docs](https://example.com)'
    )

    expect(output).toContain('Summary')
    expect(output).toContain('Decision: ship it.')
    expect(output).toContain('first item')
    expect(output).toContain('second item')
    expect(output).toContain('Docs')
    expect(output).not.toContain('**')
    expect(output).not.toContain('https://example.com')
  })
})
