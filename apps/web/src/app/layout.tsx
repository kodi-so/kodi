import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kodi — AI Teammate for Meetings and Execution',
  description:
    'Bring an AI agent into calls, chat, and your business tools. Kodi listens, answers with live context, tracks decisions, and carries work forward.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Gugi&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
