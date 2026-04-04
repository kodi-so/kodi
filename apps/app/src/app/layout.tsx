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
  title: 'Kodi App',
  description:
    'Kodi is the AI teammate for lean teams that can organize, draft, and execute follow-through within your guardrails.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${brandFont.variable} ${bodyFont.variable}`}>
        {children}
      </body>
    </html>
  )
}
