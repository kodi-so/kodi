export type MemoryScope = 'org' | 'member'

export type MemoryViewModelInput = {
  selectedPath: string
  hasManifest: boolean
  hasDirectory: boolean
  hasSelectedFile: boolean
}

export type MemoryViewKind =
  | 'manifest'
  | 'directory'
  | 'file'
  | 'unavailable'

export function parseMemoryScope(value: string | null): MemoryScope {
  return value === 'member' ? 'member' : 'org'
}

export function formatPathLabel(path: string) {
  if (!path) return 'Memory'
  return path.replace(/\.md$/i, '').replace(/[-_]+/g, ' ')
}

export function basename(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function buildMemoryUrl(scope: MemoryScope, path?: string | null) {
  const params = new URLSearchParams()
  if (scope === 'member') params.set('scope', 'member')
  if (path) params.set('path', path)
  const query = params.toString()
  return `/memory${query ? `?${query}` : ''}`
}

export function buildScopeSwitchUrl(
  currentSearch: string,
  nextScope: MemoryScope
) {
  const params = new URLSearchParams(currentSearch)
  if (nextScope === 'member') {
    params.set('scope', 'member')
  } else {
    params.delete('scope')
  }
  params.delete('path')

  const query = params.toString()
  return `/memory${query ? `?${query}` : ''}`
}

export function buildMemoryChatPrompt({
  activeOrgName,
  scope,
  path,
  question,
}: {
  activeOrgName: string
  scope: MemoryScope
  path: string
  question: string
}) {
  const trimmedQuestion = question.trim()
  if (!trimmedQuestion) return null

  const scopeLabel = scope === 'member' ? 'private memory' : 'shared memory'
  const location = path || 'the memory root'
  return `In ${activeOrgName}'s ${scopeLabel}, looking at ${location}, ${trimmedQuestion}`
}

export function buildMemoryChatUrl(prompt: string) {
  const params = new URLSearchParams()
  params.set('dm', 'kodi')
  params.set('prompt', prompt)
  return `/chat?${params.toString()}`
}

export function selectMemoryViewKind({
  selectedPath,
  hasManifest,
  hasDirectory,
  hasSelectedFile,
}: MemoryViewModelInput): MemoryViewKind {
  if (hasSelectedFile) return 'file'
  if (selectedPath && hasDirectory) return 'directory'
  if (hasManifest) return 'manifest'
  return 'unavailable'
}
