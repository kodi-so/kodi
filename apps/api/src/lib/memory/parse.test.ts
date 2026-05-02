import { describe, expect, it } from 'bun:test'
import {
  buildMemberVaultSeedPlan,
  buildOrgVaultSeedPlan,
} from './bootstrap'
import {
  parseMemoryDirectoryIndex,
  parseMemoryDocument,
  parseMemoryManifest,
} from './parse'

describe('parseMemoryManifest', () => {
  it('parses the seeded org manifest into navigation data', () => {
    const seedPlan = buildOrgVaultSeedPlan({
      id: 'org_123',
      name: 'Kodi',
      slug: 'kodi',
    })
    const manifest = seedPlan.files.find((file) => file.path === 'MEMORY.md')

    expect(manifest).toBeDefined()

    const parsed = parseMemoryManifest(manifest?.content ?? '')

    expect(parsed.title).toBe('Kodi Memory')
    expect(parsed.scopeType).toBe('org')
    expect(parsed.scopeSummary).toContain('shared Kodi memory')
    expect(parsed.importantEntryPoints.map((entry) => entry.path)).toEqual([
      'MEMORY.md',
      'Projects/PROJECTS.md',
      'Customers/CUSTOMERS.md',
      'Processes/PROCESSES.md',
      'Current State/CURRENT-STATE.md',
    ])
    expect(parsed.directoryGuide.map((entry) => entry.path)).toEqual([
      'Projects/',
      'Customers/',
      'Processes/',
      'Current State/',
      'Indexes/',
    ])
    expect(parsed.structuralRules).toContain(
      'Keep org-wide facts in this vault and keep private member-specific context out of it.'
    )
    expect(parsed.updateRules).toContain(
      'Lead files with the current summary and durable takeaways.'
    )
  })

  it('parses the seeded member manifest into navigation data', () => {
    const seedPlan = buildMemberVaultSeedPlan({
      org: {
        id: 'org_123',
        name: 'Kodi',
        slug: 'kodi',
      },
      orgMember: {
        id: 'org_member_123',
        orgId: 'org_123',
        userId: 'user_123',
        role: 'member',
      },
    })
    const manifest = seedPlan.files.find((file) => file.path === 'MEMORY.md')

    expect(manifest).toBeDefined()

    const parsed = parseMemoryManifest(manifest?.content ?? '')

    expect(parsed.scopeType).toBe('member')
    expect(parsed.scopeSummary).toContain('private Kodi member memory')
    expect(parsed.importantEntryPoints.map((entry) => entry.path)).toEqual([
      'MEMORY.md',
      'Preferences/PREFERENCES.md',
      'Responsibilities/RESPONSIBILITIES.md',
      'Current Work/CURRENT-WORK.md',
      'Relationships/RELATIONSHIPS.md',
    ])
  })
})

describe('parseMemoryDirectoryIndex', () => {
  it('parses seeded org directory indexes into local navigation data', () => {
    const seedPlan = buildOrgVaultSeedPlan({
      id: 'org_123',
      name: 'Kodi',
      slug: 'kodi',
    })
    const index = seedPlan.files.find((file) => file.path === 'Projects/PROJECTS.md')

    expect(index).toBeDefined()

    const parsed = parseMemoryDirectoryIndex(index?.content ?? '', {
      path: 'Projects/PROJECTS.md',
    })

    expect(parsed.title).toBe('Projects')
    expect(parsed.whatBelongsHere).toContain('Shared project memory')
    expect(parsed.existingFileNotes).toEqual([
      'This directory starts with only this index file.',
      'Kodi should add topic-specific files here as durable org memory is established.',
      'Kodi may also replace this directory with a better-fitting structure if the starter scaffold stops matching the org.',
    ])
    expect(parsed.filePurposes).toEqual([
      {
        path: 'Projects/PROJECTS.md',
        pathType: 'file',
        description:
          'tracks what belongs in this directory and helps Kodi find the right target file before reading broadly.',
      },
    ])
    expect(parsed.namingConventions).toContain(
      'Prefer one file per durable topic or question.'
    )
  })
})

describe('parseMemoryDocument', () => {
  it('dispatches to the manifest parser for MEMORY.md', () => {
    const document = parseMemoryDocument(
      'MEMORY.md',
      '# Kodi Memory\n\n## Scope\n\nThis vault represents shared Kodi memory.'
    )

    expect(document?.kind).toBe('manifest')
  })

  it('dispatches to the directory index parser for local index files', () => {
    const document = parseMemoryDocument(
      'Projects/PROJECTS.md',
      '# Projects\n\n## What belongs here\n\nShared project memory.'
    )

    expect(document?.kind).toBe('directoryIndex')
  })

  it('returns null for non-navigation files', () => {
    expect(
      parseMemoryDocument('Projects/Launch Plan.md', '# Launch Plan\n\nSummary.')
    ).toBeNull()
  })
})
