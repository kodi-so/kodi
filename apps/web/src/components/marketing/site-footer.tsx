import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { footerGroups, siteConfig } from '@/content/marketing/site-config'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-[1fr_auto_auto] lg:gap-16">
          {/* Brand */}
          <div className="space-y-4">
            <BrandLogo size={30} />
            <p className="max-w-xs text-sm leading-7 text-muted-foreground">
              {siteConfig.tagline}
            </p>
          </div>

          {/* Link groups */}
          {footerGroups.map((group) => (
            <div key={group.heading}>
              <p className="mb-4 text-xs font-normal uppercase tracking-[0.18em] text-muted-foreground">
                {group.heading}
              </p>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            &copy; {year} Kodi. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
