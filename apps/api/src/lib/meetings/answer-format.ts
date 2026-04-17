function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function markdownToMeetingPlainText(input: string): string {
  const withoutCodeFences = input
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/^```[^\n]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
    )
    .replace(/`([^`]+)`/g, '$1')

  const withoutLinks = withoutCodeFences.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')

  const withoutFormatting = withoutLinks
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, '- ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^>\s?/gm, '')

  return normalizeWhitespace(withoutFormatting)
}
