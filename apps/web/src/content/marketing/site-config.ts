export type NavItem = {
  label: string
  href: string
  isExternal?: boolean
}

export type FooterGroup = {
  heading: string
  links: NavItem[]
}

export const siteConfig = {
  name: 'Kodi',
  tagline: 'The AI teammate for lean, fast-moving teams.',
  description:
    'Kodi joins meetings, answers with live business context, and moves follow-through forward across the tools your team already uses.',
  url: 'https://kodi.so',
} as const

export const primaryNav: NavItem[] = [
  { label: 'Product', href: '/#how-it-works' },
  { label: 'Integrations', href: '/integrations' },
]

export const ctaConfig = {
  primary: {
    label: 'Start free',
    href: process.env.NEXT_PUBLIC_APP_URL ?? '/app',
  },
  secondary: {
    label: 'Book a walkthrough',
    href: '#demo',
  },
  chapterPrimary: {
    label: 'Put Kodi in your next meeting',
    href: process.env.NEXT_PUBLIC_APP_URL ?? '/app',
  },
  closing: {
    label: 'Start free trial',
    href: process.env.NEXT_PUBLIC_APP_URL ?? '/app',
  },
  closingSecondary: {
    label: 'Book a walkthrough',
    href: '#demo',
  },
} as const

export const footerGroups: FooterGroup[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]
