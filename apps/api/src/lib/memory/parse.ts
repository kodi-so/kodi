import { isDirectoryIndexPath } from './paths'

export type MemoryDocumentPathType = 'file' | 'directory'

export type MarkdownSection = {
  heading: string
  level: number
  content: string
}

export type MemoryPathReference = {
  path: string
  pathType: MemoryDocumentPathType
  description: string | null
}

export type ParsedMemoryManifest = {
  title: string
  scopeType: 'org' | 'member' | 'unknown'
  scopeSummary: string
  organizationSummary: string
  importantEntryPoints: MemoryPathReference[]
  directoryGuide: MemoryPathReference[]
  structuralRules: string[]
  updateRules: string[]
  sections: MarkdownSection[]
}

export type ParsedMemoryDirectoryIndex = {
  title: string
  directoryTitle: string
  whatBelongsHere: string
  existingFileNotes: string[]
  filePurposes: MemoryPathReference[]
  namingConventions: string[]
  sections: MarkdownSection[]
}

export type ParsedMemoryDocument =
  | { kind: 'manifest'; document: ParsedMemoryManifest }
  | { kind: 'directoryIndex'; document: ParsedMemoryDirectoryIndex }
  | null

function normalizePath(path?: string) {
  if (!path) return ''
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function splitMarkdownLines(markdown: string) {
  return markdown.replace(/\r\n/g, '\n').split('\n')
}

function parseMarkdownSections(markdown: string) {
  const lines = splitMarkdownLines(markdown)
  const sections: MarkdownSection[] = []
  let currentSection:
    | {
        heading: string
        level: number
        lines: string[]
      }
    | undefined

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)

    if (headingMatch) {
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          content: currentSection.lines.join('\n').trim(),
        })
      }

      currentSection = {
        heading: headingMatch[2] ?? '',
        level: headingMatch[1]?.length ?? 1,
        lines: [],
      }
      continue
    }

    currentSection?.lines.push(line)
  }

  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      level: currentSection.level,
      content: currentSection.lines.join('\n').trim(),
    })
  }

  return sections
}

function getSectionContent(sections: MarkdownSection[], heading: string) {
  return sections.find((section) => section.heading === heading)?.content ?? ''
}

function parseBulletList(content: string) {
  return splitMarkdownLines(content)
    .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1]?.trim() ?? null)
    .filter((line): line is string => Boolean(line))
}

function inferPathType(path: string): MemoryDocumentPathType {
  return path.endsWith('/') ? 'directory' : 'file'
}

function dirname(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function joinPath(...parts: Array<string | undefined>) {
  return parts.map((part) => normalizePath(part)).filter(Boolean).join('/')
}

function normalizeReferencePath(path: string) {
  const normalized = normalizePath(path)
  return path.endsWith('/') ? `${normalized}/` : normalized
}

function resolveReferencePath(path: string, basePath?: string) {
  if (!basePath || path.includes('/')) {
    return path
  }

  const baseDirectory = dirname(basePath)
  if (!baseDirectory) {
    return path
  }

  return joinPath(baseDirectory, path)
}

function parsePathReference(
  item: string,
  options?: {
    basePath?: string
  }
): MemoryPathReference | null {
  const match =
    item.match(/`([^`]+)`\s*(?:—|-)\s*(.+)$/) ??
    item.match(/`([^`]+)`\s+(.+)$/)
  if (!match) return null

  const path = match[1]?.trim()
  const description = match[2]?.trim()

  if (!path) return null

  const resolvedPath = resolveReferencePath(path, options?.basePath)

  return {
    path: normalizeReferencePath(resolvedPath),
    pathType: inferPathType(path),
    description: description || null,
  }
}

function parsePathReferenceList(
  content: string,
  options?: {
    basePath?: string
  }
) {
  return parseBulletList(content)
    .map((item) => parsePathReference(item, options))
    .filter((item): item is MemoryPathReference => Boolean(item))
}

function inferManifestScopeType(scopeSummary: string) {
  const normalized = scopeSummary.toLowerCase()

  if (normalized.includes('private kodi member memory')) {
    return 'member' as const
  }

  if (normalized.includes('shared kodi memory')) {
    return 'org' as const
  }

  return 'unknown' as const
}

function getDocumentTitle(sections: MarkdownSection[]) {
  return sections.find((section) => section.level === 1)?.heading ?? 'Kodi Memory'
}

export function parseMemoryManifest(markdown: string): ParsedMemoryManifest {
  const sections = parseMarkdownSections(markdown)
  const scopeSummary = getSectionContent(sections, 'Scope')

  return {
    title: getDocumentTitle(sections),
    scopeType: inferManifestScopeType(scopeSummary),
    scopeSummary,
    organizationSummary: getSectionContent(sections, 'How this vault is organized'),
    importantEntryPoints: parsePathReferenceList(
      getSectionContent(sections, 'Important entry points')
    ),
    directoryGuide: parsePathReferenceList(
      getSectionContent(sections, 'Directory guide')
    ),
    structuralRules: parseBulletList(
      getSectionContent(sections, 'Structural rules')
    ),
    updateRules: parseBulletList(getSectionContent(sections, 'Update rules')),
    sections,
  }
}

export function parseMemoryDirectoryIndex(
  markdown: string,
  options?: {
    path?: string
  }
): ParsedMemoryDirectoryIndex {
  const sections = parseMarkdownSections(markdown)

  return {
    title: getDocumentTitle(sections),
    directoryTitle: getDocumentTitle(sections),
    whatBelongsHere: getSectionContent(sections, 'What belongs here'),
    existingFileNotes: parseBulletList(
      getSectionContent(sections, 'What files exist here')
    ),
    filePurposes: parsePathReferenceList(
      getSectionContent(sections, 'What each file is for'),
      { basePath: options?.path }
    ),
    namingConventions: parseBulletList(
      getSectionContent(sections, 'Naming and structural conventions')
    ),
    sections,
  }
}

export function parseMemoryDocument(
  path: string,
  markdown: string
): ParsedMemoryDocument {
  const normalizedPath = normalizePath(path)

  if (normalizedPath === 'MEMORY.md') {
    return {
      kind: 'manifest',
      document: parseMemoryManifest(markdown),
    }
  }

  if (isDirectoryIndexPath(normalizedPath)) {
    return {
      kind: 'directoryIndex',
      document: parseMemoryDirectoryIndex(markdown, { path: normalizedPath }),
    }
  }

  return null
}
