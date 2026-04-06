import type { Metadata } from 'next'
import '@kodi/ui/styles/brand-theme.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kodi',
  description: 'Kodi turns meetings into clear decisions and completed work.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
