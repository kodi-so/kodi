import { describe, expect, it } from 'bun:test'
import { buildMemberVaultSeedPlan, buildOrgVaultSeedPlan } from './bootstrap'

describe('buildOrgVaultSeedPlan', () => {
  it('builds the initial shared org vault structure and seed files', () => {
    const seedPlan = buildOrgVaultSeedPlan({
      id: 'org_123',
      name: 'Kodi',
      slug: 'kodi',
    })

    expect(seedPlan.rootPath).toBe('memory/org_123/org')
    expect(seedPlan.manifestPath).toBe('memory/org_123/org/MEMORY.md')

    expect(seedPlan.directories.map((directory) => directory.path)).toEqual([
      'Projects',
      'Customers',
      'Processes',
      'Current State',
      'Indexes',
    ])

    expect(seedPlan.files.map((file) => file.path)).toEqual([
      'MEMORY.md',
      'Projects/PROJECTS.md',
      'Customers/CUSTOMERS.md',
      'Processes/PROCESSES.md',
      'Current State/CURRENT-STATE.md',
    ])

    const manifest = seedPlan.files.find((file) => file.path === 'MEMORY.md')
    expect(manifest?.content).toContain('## Scope')
    expect(manifest?.content).toContain('## Important entry points')
    expect(manifest?.content).toContain('Projects/PROJECTS.md')
    expect(manifest?.content).toContain('Current State/CURRENT-STATE.md')

    const pathRecords = seedPlan.pathRecords.map((record) => ({
      path: record.path,
      type: record.pathType,
      parentPath: record.parentPath,
      isManifest: record.isManifest,
      isIndex: record.isIndex,
    }))

    expect(pathRecords).toContainEqual({
      path: 'Projects',
      type: 'directory',
      parentPath: null,
      isManifest: false,
      isIndex: false,
    })

    expect(pathRecords).toContainEqual({
      path: 'Projects/PROJECTS.md',
      type: 'file',
      parentPath: 'Projects',
      isManifest: false,
      isIndex: true,
    })

    expect(pathRecords).toContainEqual({
      path: 'MEMORY.md',
      type: 'file',
      parentPath: null,
      isManifest: true,
      isIndex: false,
    })
  })
})

describe('buildMemberVaultSeedPlan', () => {
  it('builds the initial member vault structure and seed files', () => {
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

    expect(seedPlan.rootPath).toBe('memory/org_123/members/org_member_123')
    expect(seedPlan.manifestPath).toBe(
      'memory/org_123/members/org_member_123/MEMORY.md'
    )

    expect(seedPlan.directories.map((directory) => directory.path)).toEqual([
      'Preferences',
      'Responsibilities',
      'Current Work',
      'Relationships',
    ])

    expect(seedPlan.files.map((file) => file.path)).toEqual([
      'MEMORY.md',
      'Preferences/PREFERENCES.md',
      'Responsibilities/RESPONSIBILITIES.md',
      'Current Work/CURRENT-WORK.md',
      'Relationships/RELATIONSHIPS.md',
    ])

    const manifest = seedPlan.files.find((file) => file.path === 'MEMORY.md')
    expect(manifest?.content).toContain('private Kodi member memory')
    expect(manifest?.content).toContain('Preferences/PREFERENCES.md')
    expect(manifest?.content).toContain('Relationships/RELATIONSHIPS.md')

    const pathRecords = seedPlan.pathRecords.map((record) => ({
      path: record.path,
      type: record.pathType,
      parentPath: record.parentPath,
      isManifest: record.isManifest,
      isIndex: record.isIndex,
    }))

    expect(pathRecords).toContainEqual({
      path: 'Preferences',
      type: 'directory',
      parentPath: null,
      isManifest: false,
      isIndex: false,
    })

    expect(pathRecords).toContainEqual({
      path: 'Current Work/CURRENT-WORK.md',
      type: 'file',
      parentPath: 'Current Work',
      isManifest: false,
      isIndex: true,
    })

    expect(pathRecords).toContainEqual({
      path: 'MEMORY.md',
      type: 'file',
      parentPath: null,
      isManifest: true,
      isIndex: false,
    })
  })
})
