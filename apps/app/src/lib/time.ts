export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelative(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const diffMs = Date.now() - parsed.getTime()
  const abs = Math.abs(diffMs)
  const future = diffMs < 0
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  let text: string
  if (abs < minute) text = 'just now'
  else if (abs < hour) text = `${Math.round(abs / minute)}m`
  else if (abs < day) text = `${Math.round(abs / hour)}h`
  else if (abs < 30 * day) text = `${Math.round(abs / day)}d`
  else return formatDate(parsed)

  if (text === 'just now') return text
  return future ? `in ${text}` : `${text} ago`
}
