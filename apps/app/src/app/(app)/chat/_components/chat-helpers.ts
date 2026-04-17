export function makeTempId(prefix: string) {
  return `temp-${prefix}-${crypto.randomUUID()}`
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

export function initials(name?: string | null) {
  if (!name) return 'K'

  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
