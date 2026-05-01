import {
  and,
  db,
  eq,
  memoryVaults,
  sql,
  type OrgMember,
  type Organization,
} from '@kodi/db'
import {
  applyMemoryPathSyncRecords,
  collectMemoryPathSyncRecords,
  type MemoryPathSyncExecutor,
} from './paths'
import type { MemoryStorage, MemoryStoragePathType } from './storage'

type OrgVaultDirectorySeed = {
  path: string
  title: string
  summary: string
  indexFileName?: string
}

type OrgVaultSeedFile = {
  path: string
  content: string
  title: string
  isManifest?: boolean
  isIndex?: boolean
}

type OrgVaultSeedPathRecord = {
  path: string
  pathType: MemoryStoragePathType
  parentPath: string | null
  title: string
  isManifest: boolean
  isIndex: boolean
}

export type OrgVaultSeedPlan = {
  rootPath: string
  manifestPath: string
  directories: Array<Pick<OrgVaultDirectorySeed, 'path' | 'title'>>
  files: OrgVaultSeedFile[]
  pathRecords: OrgVaultSeedPathRecord[]
}

export type MemberVaultSeedPlan = {
  rootPath: string
  manifestPath: string
  directories: Array<Pick<OrgVaultDirectorySeed, 'path' | 'title'>>
  files: OrgVaultSeedFile[]
  pathRecords: OrgVaultSeedPathRecord[]
}

export type MemberVaultIdentity = {
  org: Pick<Organization, 'id' | 'name' | 'slug'>
  orgMember: Pick<OrgMember, 'id' | 'orgId' | 'userId' | 'role'>
}

const ORG_VAULT_DIRECTORIES: OrgVaultDirectorySeed[] = [
  {
    path: 'Projects',
    title: 'Projects',
    summary: 'Shared project memory, plans, status, milestones, risks, and ownership.',
    indexFileName: 'PROJECTS.md',
  },
  {
    path: 'Customers',
    title: 'Customers',
    summary: 'Durable customer context, relationships, history, and active commitments.',
    indexFileName: 'CUSTOMERS.md',
  },
  {
    path: 'Processes',
    title: 'Processes',
    summary: 'Repeatable team processes, operating norms, and decision workflows.',
    indexFileName: 'PROCESSES.md',
  },
  {
    path: 'Current State',
    title: 'Current State',
    summary: 'What the organization is actively tracking right now: current state, next steps, and owners.',
    indexFileName: 'CURRENT-STATE.md',
  },
  {
    path: 'Indexes',
    title: 'Indexes',
    summary: 'Reserved space for additional navigation aids and future cross-cutting indexes.',
  },
]

const MEMBER_VAULT_DIRECTORIES: OrgVaultDirectorySeed[] = [
  {
    path: 'Preferences',
    title: 'Preferences',
    summary: 'User-specific preferences, communication patterns, and working style that Kodi should preserve in private member interactions.',
    indexFileName: 'PREFERENCES.md',
  },
  {
    path: 'Responsibilities',
    title: 'Responsibilities',
    summary: 'Private or member-scoped responsibilities, ownership areas, and commitments tied to this org member.',
    indexFileName: 'RESPONSIBILITIES.md',
  },
  {
    path: 'Current Work',
    title: 'Current Work',
    summary: 'The member’s active work, next steps, and current focus within this organization.',
    indexFileName: 'CURRENT-WORK.md',
  },
  {
    path: 'Relationships',
    title: 'Relationships',
    summary: 'Member-specific relationship context, collaboration nuances, and interpersonal patterns that should stay private-scoped.',
    indexFileName: 'RELATIONSHIPS.md',
  },
]

function buildOrgVaultRootPath(orgId: string) {
  return `memory/${orgId}/org`
}

function buildMemberVaultRootPath(orgId: string, orgMemberId: string) {
  return `memory/${orgId}/members/${orgMemberId}`
}

function buildOrgManifestContent(org: Pick<Organization, 'id' | 'name' | 'slug'>) {
  const directoryGuide = ORG_VAULT_DIRECTORIES.map(
    (directory) => `- \`${directory.path}/\` — ${directory.summary}`
  ).join('\n')

  const entryPoints = [
    '- `MEMORY.md` — this manifest for the shared org vault',
    '- `Projects/PROJECTS.md` — project navigation and file ownership',
    '- `Customers/CUSTOMERS.md` — customer navigation and context ownership',
    '- `Processes/PROCESSES.md` — process navigation and operating norms',
    '- `Current State/CURRENT-STATE.md` — current org-wide state, next steps, and owners',
  ].join('\n')

  return `# Kodi Memory

## Scope

This vault represents shared Kodi memory for the organization "${org.name}" (\`${org.id}\`, slug \`${org.slug}\`).

It stores durable org-wide context that multiple members should be able to rely on.

## How this vault is organized

Kodi maintains this vault as a set of concise markdown files and directories.

The initial structure is only a starter scaffold.

Kodi may create, rename, move, merge, or replace directories and files as the organization's real memory structure becomes clearer over time.

## Important entry points

${entryPoints}

## Directory guide

${directoryGuide}

## Structural rules

- Keep org-wide facts in this vault and keep private member-specific context out of it.
- Treat the initial scaffold as a starting point rather than a fixed taxonomy.
- Prefer updating an existing file over creating a near-duplicate.
- Split files when they become crowded or start answering multiple unrelated questions.
- Update affected index files when paths are added, renamed, moved, merged, or removed.

## Update rules

- Lead files with the current summary and durable takeaways.
- Preserve stable section structure when revising a file repeatedly.
- Remove outdated information instead of letting stale context accumulate.
- Add new files only when an existing file no longer cleanly owns the topic.
`
}

function buildMemberManifestContent(
  identity: MemberVaultIdentity
) {
  const { org, orgMember } = identity

  const directoryGuide = MEMBER_VAULT_DIRECTORIES.map(
    (directory) => `- \`${directory.path}/\` — ${directory.summary}`
  ).join('\n')

  const entryPoints = [
    '- `MEMORY.md` — this manifest for the member-scoped vault',
    '- `Preferences/PREFERENCES.md` — working preferences and communication norms',
    '- `Responsibilities/RESPONSIBILITIES.md` — member-specific ownership and commitments',
    '- `Current Work/CURRENT-WORK.md` — active focus, next steps, and short-horizon context',
    '- `Relationships/RELATIONSHIPS.md` — private relationship context and collaboration patterns',
  ].join('\n')

  return `# Kodi Memory

## Scope

This vault represents private Kodi member memory for org member \`${orgMember.id}\` (user \`${orgMember.userId}\`) inside the organization "${org.name}" (\`${org.id}\`, slug \`${org.slug}\`).

It stores durable member-scoped context that should not become shared org-wide truth by default.

## How this vault is organized

Kodi maintains this vault as a set of concise markdown files and directories for member-scoped context within the organization.

The initial structure is only a starter scaffold.

Kodi may create, rename, move, merge, or replace directories and files as this member's real memory structure becomes clearer over time.

## Important entry points

${entryPoints}

## Directory guide

${directoryGuide}

## Structural rules

- Keep private member-specific context in this vault and keep org-wide shared facts out of it unless they are only relevant to this member.
- Treat the initial scaffold as a starting point rather than a fixed taxonomy.
- Prefer updating an existing file over creating a near-duplicate.
- Split files when they become crowded or start answering multiple unrelated questions.
- Update affected index files when paths are added, renamed, moved, merged, or removed.

## Update rules

- Lead files with the current summary and durable takeaways.
- Preserve stable section structure when revising a file repeatedly.
- Remove outdated information instead of letting stale context accumulate.
- Add new files only when an existing file no longer cleanly owns the topic.
`
}

function buildOrgDirectoryIndexContent(
  directory: OrgVaultDirectorySeed
) {
  return `# ${directory.title}

## What belongs here

${directory.summary}

## What files exist here

- This directory starts with only this index file.
- Kodi should add topic-specific files here as durable org memory is established.
- Kodi may also replace this directory with a better-fitting structure if the starter scaffold stops matching the org.

## What each file is for

- \`${directory.indexFileName}\` tracks what belongs in this directory and helps Kodi find the right target file before reading broadly.

## Naming and structural conventions

- Prefer one file per durable topic or question.
- Keep filenames human-readable and stable over time.
- Update this index when files are created, renamed, moved, merged, or removed.
`
}

function buildMemberDirectoryIndexContent(
  directory: OrgVaultDirectorySeed
) {
  return `# ${directory.title}

## What belongs here

${directory.summary}

## What files exist here

- This directory starts with only this index file.
- Kodi should add member-scoped files here as durable private context is established.
- Kodi may also replace this directory with a better-fitting structure if the starter scaffold stops matching the member's real working context.

## What each file is for

- \`${directory.indexFileName}\` tracks what belongs in this directory and helps Kodi navigate member memory without reading broadly.

## Naming and structural conventions

- Prefer one file per durable topic or question.
- Keep filenames human-readable and stable over time.
- Update this index when files are created, renamed, moved, merged, or removed.
`
}

function buildOrgVaultSeedFiles(
  org: Pick<Organization, 'id' | 'name' | 'slug'>
) {
  const files: OrgVaultSeedFile[] = [
    {
      path: 'MEMORY.md',
      content: buildOrgManifestContent(org),
      title: 'Kodi Memory',
      isManifest: true,
    },
  ]

  for (const directory of ORG_VAULT_DIRECTORIES) {
    if (!directory.indexFileName) continue

    files.push({
      path: `${directory.path}/${directory.indexFileName}`,
      content: buildOrgDirectoryIndexContent(directory),
      title: `${directory.title} index`,
      isIndex: true,
    })
  }

  return files
}

function buildMemberVaultSeedFiles(identity: MemberVaultIdentity) {
  const files: OrgVaultSeedFile[] = [
    {
      path: 'MEMORY.md',
      content: buildMemberManifestContent(identity),
      title: 'Kodi Memory',
      isManifest: true,
    },
  ]

  for (const directory of MEMBER_VAULT_DIRECTORIES) {
    if (!directory.indexFileName) continue

    files.push({
      path: `${directory.path}/${directory.indexFileName}`,
      content: buildMemberDirectoryIndexContent(directory),
      title: `${directory.title} index`,
      isIndex: true,
    })
  }

  return files
}

function parentPath(path: string) {
  const parts = path.split('/')
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('/')
}

function buildOrgVaultPathRecords(
  directories: Array<Pick<OrgVaultDirectorySeed, 'path' | 'title'>>,
  files: OrgVaultSeedFile[]
) {
  const directoryRecords: OrgVaultSeedPathRecord[] = directories.map(
    (directory) => ({
      path: directory.path,
      pathType: 'directory',
      parentPath: null,
      title: directory.title,
      isManifest: false,
      isIndex: false,
    })
  )

  const fileRecords: OrgVaultSeedPathRecord[] = files.map((file) => ({
    path: file.path,
    pathType: 'file',
    parentPath: parentPath(file.path),
    title: file.title,
    isManifest: file.isManifest ?? false,
    isIndex: file.isIndex ?? false,
  }))

  return [...directoryRecords, ...fileRecords]
}

export function buildOrgVaultSeedPlan(
  org: Pick<Organization, 'id' | 'name' | 'slug'>
): OrgVaultSeedPlan {
  const rootPath = buildOrgVaultRootPath(org.id)
  const directories = ORG_VAULT_DIRECTORIES.map(({ path, title }) => ({
    path,
    title,
  }))
  const files = buildOrgVaultSeedFiles(org)

  return {
    rootPath,
    manifestPath: `${rootPath}/MEMORY.md`,
    directories,
    files,
    pathRecords: buildOrgVaultPathRecords(directories, files),
  }
}

export function buildMemberVaultSeedPlan(
  identity: MemberVaultIdentity
): MemberVaultSeedPlan {
  const rootPath = buildMemberVaultRootPath(
    identity.org.id,
    identity.orgMember.id
  )
  const directories = MEMBER_VAULT_DIRECTORIES.map(({ path, title }) => ({
    path,
    title,
  }))
  const files = buildMemberVaultSeedFiles(identity)

  return {
    rootPath,
    manifestPath: `${rootPath}/MEMORY.md`,
    directories,
    files,
    pathRecords: buildOrgVaultPathRecords(directories, files),
  }
}

export async function ensureOrgMemoryVault(
  database: typeof db,
  org: Pick<Organization, 'id' | 'name' | 'slug'>,
  storage?: MemoryStorage
) {
  const resolvedStorage =
    storage ?? (await import('./storage')).createMemoryStorage()

  const existing = await database.query.memoryVaults.findFirst({
    where: and(
      eq(memoryVaults.orgId, org.id),
      eq(memoryVaults.scopeType, 'org')
    ),
  })

  if (existing) {
    return existing
  }

  const seedPlan = buildOrgVaultSeedPlan(org)
  const syncRecords = await collectMemoryPathSyncRecords(resolvedStorage, {
    rootPath: seedPlan.rootPath,
    manifestPath: seedPlan.manifestPath,
  })

  for (const directory of seedPlan.directories) {
    await resolvedStorage.createDirectory(`${seedPlan.rootPath}/${directory.path}`)
  }

  for (const file of seedPlan.files) {
    await resolvedStorage.writeFile({
      path: `${seedPlan.rootPath}/${file.path}`,
      body: file.content,
      contentType: 'text/markdown; charset=utf-8',
    })
  }

  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`memory-org-vault:${org.id}`}))`
    )

    const current = await tx.query.memoryVaults.findFirst({
      where: and(
        eq(memoryVaults.orgId, org.id),
        eq(memoryVaults.scopeType, 'org')
      ),
    })

    if (current) {
      return current
    }

    const [vault] = await tx
      .insert(memoryVaults)
      .values({
        orgId: org.id,
        scopeType: 'org',
        rootPath: seedPlan.rootPath,
        manifestPath: seedPlan.manifestPath,
      })
      .returning()

    if (!vault) {
      throw new Error(`Failed to create org memory vault for org ${org.id}`)
    }

    await applyMemoryPathSyncRecords(
      tx as MemoryPathSyncExecutor,
      vault.id,
      syncRecords
    )

    return vault
  })
}

export async function ensureMemberMemoryVault(
  database: typeof db,
  identity: MemberVaultIdentity,
  storage?: MemoryStorage
) {
  const resolvedStorage =
    storage ?? (await import('./storage')).createMemoryStorage()

  const existing = await database.query.memoryVaults.findFirst({
    where: and(
      eq(memoryVaults.orgId, identity.org.id),
      eq(memoryVaults.scopeType, 'member'),
      eq(memoryVaults.orgMemberId, identity.orgMember.id)
    ),
  })

  if (existing) {
    return existing
  }

  const seedPlan = buildMemberVaultSeedPlan(identity)
  const syncRecords = await collectMemoryPathSyncRecords(resolvedStorage, {
    rootPath: seedPlan.rootPath,
    manifestPath: seedPlan.manifestPath,
  })

  for (const directory of seedPlan.directories) {
    await resolvedStorage.createDirectory(`${seedPlan.rootPath}/${directory.path}`)
  }

  for (const file of seedPlan.files) {
    await resolvedStorage.writeFile({
      path: `${seedPlan.rootPath}/${file.path}`,
      body: file.content,
      contentType: 'text/markdown; charset=utf-8',
    })
  }

  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`memory-member-vault:${identity.org.id}:${identity.orgMember.id}`}))`
    )

    const current = await tx.query.memoryVaults.findFirst({
      where: and(
        eq(memoryVaults.orgId, identity.org.id),
        eq(memoryVaults.scopeType, 'member'),
        eq(memoryVaults.orgMemberId, identity.orgMember.id)
      ),
    })

    if (current) {
      return current
    }

    const [vault] = await tx
      .insert(memoryVaults)
      .values({
        orgId: identity.org.id,
        scopeType: 'member',
        orgMemberId: identity.orgMember.id,
        rootPath: seedPlan.rootPath,
        manifestPath: seedPlan.manifestPath,
      })
      .returning()

    if (!vault) {
      throw new Error(
        `Failed to create member memory vault for org member ${identity.orgMember.id}`
      )
    }

    await applyMemoryPathSyncRecords(
      tx as MemoryPathSyncExecutor,
      vault.id,
      syncRecords
    )

    return vault
  })
}
