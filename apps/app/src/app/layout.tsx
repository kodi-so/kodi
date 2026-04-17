import type { Metadata } from 'next'
import '@kodi/ui/styles/brand-theme.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kodi App',
  description: 'Kodi helps teams turn meetings into completed work.',
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
