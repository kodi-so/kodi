import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kodi App',
  description: 'Kodi — the platform your team deserves',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
