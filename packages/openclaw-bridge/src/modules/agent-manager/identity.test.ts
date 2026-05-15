import { describe, expect, test } from 'bun:test'
import { buildIdentityMarkdown } from './identity'

describe('buildIdentityMarkdown', () => {
  const FM = {
    user_id: '11111111-1111-4111-8111-111111111111',
    org_id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-05-02T12:00:00.000Z',
  }

  test('starts with --- frontmatter and ends with --- on its own line', () => {
    const md = buildIdentityMarkdown(FM)
    const lines = md.split('\n')
    expect(lines[0]).toBe('---')
    expect(lines.indexOf('---', 1)).toBeGreaterThan(0)
  })

  test('frontmatter contains user_id, org_id, created_at as YAML', () => {
    const md = buildIdentityMarkdown(FM)
    expect(md).toContain(`user_id: ${FM.user_id}`)
    expect(md).toContain(`org_id: ${FM.org_id}`)
    expect(md).toContain(`created_at: ${FM.created_at}`)
  })

  test('body references both ids for human readers', () => {
    const md = buildIdentityMarkdown(FM)
    expect(md).toContain(FM.user_id)
    expect(md).toContain(FM.org_id)
    expect(md).toContain('kodi-bridge')
  })
})
