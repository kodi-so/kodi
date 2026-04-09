import type { MeetingProviderSlug } from './events'

function parseHostname(joinUrl: string) {
  try {
    return new URL(joinUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isGoogleMeetHostname(hostname: string) {
  return hostname.includes('meet.google.com')
}

export function isZoomHostname(hostname: string) {
  return (
    hostname === 'zoom.us' ||
    hostname.endsWith('.zoom.us') ||
    hostname === 'zoomgov.com' ||
    hostname.endsWith('.zoomgov.com')
  )
}

export function inferMeetingProviderFromUrl(
  joinUrl: string
): MeetingProviderSlug | null {
  const hostname = parseHostname(joinUrl)
  if (!hostname) return null

  if (isGoogleMeetHostname(hostname)) return 'google_meet'
  if (isZoomHostname(hostname)) return 'zoom'

  return null
}

export function parseGoogleMeetId(joinUrl: string) {
  try {
    const url = new URL(joinUrl)
    if (!isGoogleMeetHostname(url.hostname.toLowerCase())) return null

    const match = url.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function parseZoomMeetingId(joinUrl: string) {
  try {
    const url = new URL(joinUrl)
    if (!isZoomHostname(url.hostname.toLowerCase())) return null

    const match = url.pathname.match(/\/(?:wc\/)?(?:j|s)\/(\d+)/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function resolveMeetingIdFromJoinUrl(
  joinUrl: string,
  provider: MeetingProviderSlug
) {
  if (provider === 'google_meet') return parseGoogleMeetId(joinUrl)
  if (provider === 'zoom') return parseZoomMeetingId(joinUrl)
  return null
}
