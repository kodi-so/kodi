import type { Metadata, Viewport } from 'next'
import '@kodi/ui/styles/brand-theme.css'
import './globals.css'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kodi.so'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Kodi — AI teammate for meetings and follow-through',
    template: '%s | Kodi',
  },
  description:
    'Kodi joins your meetings, answers with live business context, captures decisions, and moves the follow-through forward across the tools your team already uses.',
  keywords: [
    'AI meeting assistant',
    'meeting follow-up automation',
    'decision capture',
    'controlled autonomy',
    'team productivity',
    'meeting execution',
  ],
  authors: [{ name: 'Kodi' }],
  creator: 'Kodi',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'Kodi',
    title: 'Kodi — AI teammate for meetings and follow-through',
    description:
      'Kodi joins meetings, answers with live business context, and moves follow-through forward across the tools your team already uses.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Kodi — AI teammate for meetings and follow-through',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kodi — AI teammate for meetings and follow-through',
    description:
      'Kodi joins meetings, answers with live business context, and moves follow-through forward across the tools your team already uses.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#F6F4EE',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Kodi',
              applicationCategory: 'BusinessApplication',
              description:
                'AI teammate for meetings and follow-through. Kodi joins conversations, answers with live business context, and moves work forward across the tools your team uses.',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
                description: 'Free to start',
              },
              url: APP_URL,
            }),
          }}
        />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  )
}
