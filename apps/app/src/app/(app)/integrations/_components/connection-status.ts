export type ConnectionStatus =
  | 'ACTIVE'
  | 'FAILED'
  | 'EXPIRED'
  | 'INACTIVE'
  | 'INITIATED'
  | 'INITIALIZING'

export type ConnectionTone = 'success' | 'danger' | 'info' | 'neutral'

type StatusMeta = { tone: ConnectionTone; label: string }

export const statusMeta = {
  ACTIVE: { tone: 'success', label: 'Connected' },
  FAILED: { tone: 'danger', label: 'Reconnect required' },
  EXPIRED: { tone: 'danger', label: 'Expired — reconnect' },
  INACTIVE: { tone: 'neutral', label: 'Disabled' },
  INITIATED: { tone: 'info', label: 'Connecting…' },
  INITIALIZING: { tone: 'info', label: 'Connecting…' },
} as const satisfies Record<ConnectionStatus, StatusMeta>

const NOT_CONNECTED: StatusMeta = { tone: 'neutral', label: 'Not connected' }

export function statusFor(raw: string | null | undefined): StatusMeta {
  if (!raw) return NOT_CONNECTED
  const hit = statusMeta[raw as ConnectionStatus]
  return hit ?? { tone: 'neutral', label: raw }
}

export function toneTextClass(tone: ConnectionTone): string {
  switch (tone) {
    case 'success':
      return 'text-brand-success'
    case 'danger':
      return 'text-brand-danger'
    case 'info':
      return 'text-brand-info'
    default:
      return 'text-muted-foreground'
  }
}

export function toneDotClass(tone: ConnectionTone): string {
  switch (tone) {
    case 'success':
      return 'bg-brand-success'
    case 'danger':
      return 'bg-brand-danger'
    case 'info':
      return 'bg-brand-info'
    default:
      return 'bg-muted-foreground/40'
  }
}
