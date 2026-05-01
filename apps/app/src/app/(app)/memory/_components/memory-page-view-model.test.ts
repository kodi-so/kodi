import { describe, expect, it } from 'bun:test'
import {
  basename,
  buildMemoryChatPrompt,
  buildMemoryChatUrl,
  buildMemoryUrl,
  buildScopeSwitchUrl,
  formatPathLabel,
  parentPath,
  parseMemoryScope,
  selectMemoryViewKind,
} from './memory-page-view-model'

describe('Memory page view model', () => {
  it('defaults invalid or missing scopes to shared memory', () => {
    expect(parseMemoryScope(null)).toBe('org')
    expect(parseMemoryScope('org')).toBe('org')
    expect(parseMemoryScope('shared')).toBe('org')
    expect(parseMemoryScope('member')).toBe('member')
  })

  it('builds root and nested memory URLs for shared and private scopes', () => {
    expect(buildMemoryUrl('org')).toBe('/memory')
    expect(buildMemoryUrl('member')).toBe('/memory?scope=member')
    expect(buildMemoryUrl('org', 'people/gabe.md')).toBe(
      '/memory?path=people%2Fgabe.md'
    )
    expect(buildMemoryUrl('member', 'preferences/style guide.md')).toBe(
      '/memory?scope=member&path=preferences%2Fstyle+guide.md'
    )
  })

  it('resets the selected path when switching scopes without dropping unrelated query state', () => {
    expect(
      buildScopeSwitchUrl('path=people%2Fgabe.md&filter=recent', 'member')
    ).toBe('/memory?filter=recent&scope=member')

    expect(
      buildScopeSwitchUrl(
        'scope=member&path=private%2Fnotes.md&panel=open',
        'org'
      )
    ).toBe('/memory?panel=open')
  })

  it('derives labels and parent paths for breadcrumb navigation', () => {
    expect(formatPathLabel('team-principles.md')).toBe('team principles')
    expect(basename('teams/product/rituals.md')).toBe('rituals.md')
    expect(parentPath('teams/product/rituals.md')).toBe('teams/product')
    expect(parentPath('rituals.md')).toBe('')
  })

  it('selects the right content surface for empty and populated vault states', () => {
    expect(
      selectMemoryViewKind({
        selectedPath: '',
        hasManifest: false,
        hasDirectory: false,
        hasSelectedFile: false,
      })
    ).toBe('unavailable')

    expect(
      selectMemoryViewKind({
        selectedPath: '',
        hasManifest: true,
        hasDirectory: true,
        hasSelectedFile: false,
      })
    ).toBe('manifest')

    expect(
      selectMemoryViewKind({
        selectedPath: 'teams/product',
        hasManifest: true,
        hasDirectory: true,
        hasSelectedFile: false,
      })
    ).toBe('directory')

    expect(
      selectMemoryViewKind({
        selectedPath: 'teams/product/rituals.md',
        hasManifest: true,
        hasDirectory: true,
        hasSelectedFile: true,
      })
    ).toBe('file')
  })

  it('builds scoped Kodi correction prompts and chat handoff URLs', () => {
    const prompt = buildMemoryChatPrompt({
      activeOrgName: 'Kodi',
      scope: 'member',
      path: 'preferences/style.md',
      question: '  this preference is out of date ',
    })

    expect(prompt).toBe(
      "In Kodi's private memory, looking at preferences/style.md, this preference is out of date"
    )
    expect(
      buildMemoryChatPrompt({
        activeOrgName: 'Kodi',
        scope: 'org',
        path: '',
        question: '   ',
      })
    ).toBeNull()
    expect(buildMemoryChatUrl(prompt ?? '')).toBe(
      '/chat?dm=kodi&prompt=In+Kodi%27s+private+memory%2C+looking+at+preferences%2Fstyle.md%2C+this+preference+is+out+of+date'
    )
  })
})
