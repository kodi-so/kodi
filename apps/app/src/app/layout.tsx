import type { Metadata } from 'next'
import { ABeeZee } from 'next/font/google'
import '@kodi/ui/styles/brand-theme.css'
import './globals.css'

const abeezee = ABeeZee({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-abeezee',
})

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
    <html lang="en" className={abeezee.variable}>
      <body>{children}</body>
    </html>
  )
}
