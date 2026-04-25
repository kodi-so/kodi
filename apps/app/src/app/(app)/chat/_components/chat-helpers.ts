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

export function getDayKey(value: string | Date): string {
  return new Date(value).toDateString()
}

export function getMessageDayLabel(value: string | Date): string {
  const date = new Date(value)
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const now = new Date()
  const today = startOfDay(now)
  const target = startOfDay(date)
  const diffMs = today.getTime() - target.getTime()
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
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
