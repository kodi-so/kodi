import { describe, expect, it } from 'bun:test'
import { legacyStatusForState } from './tasks'

describe('task service workflow mapping', () => {
  it('keeps legacy work item status compatible with board workflow states', () => {
    expect(legacyStatusForState({ slug: 'needs-review', type: 'backlog' })).toBe('draft')
    expect(legacyStatusForState({ slug: 'todo', type: 'backlog' })).toBe('approved')
    expect(legacyStatusForState({ slug: 'in-progress', type: 'started' })).toBe('executing')
    expect(legacyStatusForState({ slug: 'blocked', type: 'blocked' })).toBe('failed')
    expect(legacyStatusForState({ slug: 'done', type: 'completed' })).toBe('done')
    expect(legacyStatusForState({ slug: 'canceled', type: 'canceled' })).toBe('cancelled')
  })
})
