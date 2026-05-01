import { collectMemoryPathSyncRecords, type MemoryPathSyncRecord } from './paths'
import {
  parseMemoryDirectoryIndex,
  parseMemoryManifest,
  type MemoryPathReference,
} from './parse'
import type { MemoryStorage } from './storage'

type MemoryNavigationRepairVault = {
  rootPath: string
  manifestPath: string
}

export type MemoryNavigationRepairResult = {
  writtenPaths: string[]
}

function normalizePath(path?: string | null) {
  if (!path) return ''
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function joinPath(...parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizePath(part)).filter(Boolean).join('/')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

function buildDirectoryIndexPath(directoryPath: string) {
  const normalizedDirectoryPath = normalizePath(directoryPath)
  const stem = basename(normalizedDirectoryPath)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!stem) {
    throw new Error(
      `Could not derive a directory index filename for ${normalizedDirectoryPath}.`
    )
  }

  return joinPath(normalizedDirectoryPath, `${stem}.md`)
}

function toPathReference(path: string, isDirectory = false) {
  const normalizedPath = normalizePath(path)
  return isDirectory ? `${normalizedPath}/` : normalizedPath
}

function describeDirectory(record: MemoryPathSyncRecord) {
  return `Directory for ${record.title.toLowerCase()} memory and navigation.`
}

function describeIndex(path: string, title: string) {
  return `\`${basename(path)}\` — index for ${title}.`
}

function describeRecord(record: MemoryPathSyncRecord, directoryTitle: string) {
  if (record.pathType === 'directory') {
    return `Subdirectory for ${record.title.toLowerCase()} within ${directoryTitle}.`
  }

  return `Durable memory file for ${record.title.toLowerCase()} in ${directoryTitle}.`
}

function renderBulletSection(items: string[]) {
  return items.length > 0 ? items.join('\n') : '- None yet.'
}

function preserveDescriptions(
  references: MemoryPathReference[]
) {
  return new Map(
    references.map((reference) => [normalizePath(reference.path), reference.description])
  )
}

function buildManifestContent(input: {
  currentContent: string
  records: MemoryPathSyncRecord[]
}) {
  const parsed = parseMemoryManifest(input.currentContent)
  const existingEntryDescriptions = preserveDescriptions(parsed.importantEntryPoints)
  const existingDirectoryDescriptions = preserveDescriptions(parsed.directoryGuide)
  const topLevelDirectories = input.records
    .filter((record) => record.pathType === 'directory' && record.parentPath === null)
    .sort((left, right) => left.path.localeCompare(right.path))

  const importantEntryPoints = [
    `- \`MEMORY.md\` — ${existingEntryDescriptions.get('MEMORY.md') ?? 'this manifest for the scoped vault'}`,
    ...topLevelDirectories.map((directory) => {
      const indexPath = buildDirectoryIndexPath(directory.path)
      return `- \`${indexPath}\` — ${
        existingEntryDescriptions.get(indexPath) ??
        `index for the ${directory.title} directory`
      }`
    }),
  ]

  const directoryGuide = topLevelDirectories.map(
    (directory) =>
      `- \`${toPathReference(directory.path, true)}\` — ${
        existingDirectoryDescriptions.get(toPathReference(directory.path, true)) ??
        describeDirectory(directory)
      }`
  )

  const structuralRules = parsed.structuralRules.length > 0
    ? parsed.structuralRules.map((rule) => `- ${rule}`)
    : ['- Keep navigation aligned with the live vault structure.']
  const updateRules = parsed.updateRules.length > 0
    ? parsed.updateRules.map((rule) => `- ${rule}`)
    : ['- Keep navigation concise and current.']

  return `# ${parsed.title}

## Scope

${parsed.scopeSummary}

## How this vault is organized

${parsed.organizationSummary}

## Important entry points

${renderBulletSection(importantEntryPoints)}

## Directory guide

${renderBulletSection(directoryGuide)}

## Structural rules

${renderBulletSection(structuralRules)}

## Update rules

${renderBulletSection(updateRules)}
`
}

function buildDirectoryIndexContent(input: {
  directory: MemoryPathSyncRecord
  currentContent: string | null
  childRecords: MemoryPathSyncRecord[]
}) {
  const directoryPath = input.directory.path
  const currentIndexPath = buildDirectoryIndexPath(directoryPath)
  const parsed = input.currentContent
    ? parseMemoryDirectoryIndex(input.currentContent, { path: currentIndexPath })
    : null
  const existingDescriptions = parsed
    ? preserveDescriptions(parsed.filePurposes)
    : new Map<string, string | null>()

  const nonIndexChildren = input.childRecords
    .filter((record) => !record.isIndex)
    .sort((left, right) => left.path.localeCompare(right.path))

  const whatBelongsHere =
    parsed?.whatBelongsHere.trim() ||
    `Durable memory files and subdirectories for ${input.directory.title}.`

  const whatFilesExistHere =
    nonIndexChildren.length > 0
      ? nonIndexChildren.map((record) => {
          const displayPath =
            record.parentPath === directoryPath
              ? basename(record.path)
              : record.path
          return `- \`${toPathReference(displayPath, record.pathType === 'directory')}\` — ${record.title}`
        })
      : [
          '- This directory currently has no topic files or subdirectories.',
          '- Kodi may add or reorganize paths here as the memory structure evolves.',
        ]

  const filePurposes =
    nonIndexChildren.length > 0
      ? nonIndexChildren.map((record) => {
          const referencePath =
            record.parentPath === directoryPath
              ? toPathReference(
                  basename(record.path),
                  record.pathType === 'directory'
                )
              : toPathReference(record.path, record.pathType === 'directory')

          return `- \`${referencePath}\` — ${
            existingDescriptions.get(normalizePath(referencePath)) ??
            existingDescriptions.get(normalizePath(record.path)) ??
            describeRecord(record, input.directory.title)
          }`
        })
      : [
          `- \`${basename(currentIndexPath)}\` — tracks what belongs in this directory and helps Kodi navigate it safely.`,
        ]

  const namingConventions =
    parsed?.namingConventions.length && parsed.namingConventions.length > 0
      ? parsed.namingConventions.map((rule) => `- ${rule}`)
      : [
          '- Keep file titles concise and distinguish them by durable topic or purpose.',
          '- Prefer evolving existing files over creating overlapping near-duplicates.',
        ]

  return `# ${parsed?.title ?? input.directory.title}

## What belongs here

${whatBelongsHere}

## What files exist here

${renderBulletSection(whatFilesExistHere)}

## What each file is for

${renderBulletSection(filePurposes)}

## Naming and structural conventions

${renderBulletSection(namingConventions)}
`
}

export async function repairStructuralNavigation(input: {
  vault: MemoryNavigationRepairVault
  storage: MemoryStorage
}) {
  const records = await collectMemoryPathSyncRecords(input.storage, input.vault)
  const recordMap = new Map(records.map((record) => [record.path, record]))
  const manifestRecord = recordMap.get('MEMORY.md')

  if (!manifestRecord?.content) {
    throw new Error('Memory navigation repair requires an existing MEMORY.md file.')
  }

  const writes = new Map<string, string>()
  const topLevelDirectories = records.filter(
    (record) => record.pathType === 'directory' && record.parentPath === null
  )

  for (const directory of topLevelDirectories) {
    const currentIndexPath =
      records.find(
        (record) => record.parentPath === directory.path && record.isIndex
      )?.path ?? buildDirectoryIndexPath(directory.path)
    const currentIndexContent = recordMap.get(currentIndexPath)?.content ?? null
    const childRecords = records.filter((record) => record.parentPath === directory.path)
    const nextIndexContent = buildDirectoryIndexContent({
      directory,
      currentContent: currentIndexContent,
      childRecords,
    })

    if (currentIndexContent !== nextIndexContent) {
      writes.set(currentIndexPath, nextIndexContent)
    }
  }

  const nextManifestContent = buildManifestContent({
    currentContent: manifestRecord.content,
    records,
  })

  if (manifestRecord.content !== nextManifestContent) {
    writes.set('MEMORY.md', nextManifestContent)
  }

  for (const [relativePath, content] of writes) {
    await input.storage.writeFile({
      path: joinPath(input.vault.rootPath, relativePath),
      body: content,
      contentType: 'text/markdown; charset=utf-8',
    })
  }

  return {
    writtenPaths: [...writes.keys()].sort((left, right) =>
      left.localeCompare(right)
    ),
  } satisfies MemoryNavigationRepairResult
}
