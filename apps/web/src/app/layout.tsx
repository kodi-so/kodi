import type { Metadata } from 'next'
import { ABeeZee, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

const brandFont = ABeeZee({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-kodi-brand',
})

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-kodi-body',
})

export const metadata: Metadata = {
  title: 'Kodi — AI Teammate for Meetings, Execution, and Control',
  description:
    'Kodi joins meetings, answers with live business context, and can organize, draft, or execute follow-through across your tools at the autonomy level you choose.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${brandFont.variable} ${bodyFont.variable}`}>
        {children}
      </body>
    </html>
  )
}
