# Kodi Marketing Site — Content and Component Operations

## Architecture overview

The landing site lives entirely in `apps/web`. It is a Next.js 14 App Router application with a modular content/component/layout system.

```
apps/web/src/
├── app/                        # Routes
│   ├── layout.tsx              # Root layout: header, footer, metadata, OG, structured data
│   ├── page.tsx                # Homepage — thin composition of section components
│   ├── integrations/page.tsx   # Integrations supporting page
│   ├── privacy/page.tsx        # Privacy policy (uses same shell)
│   ├── terms/page.tsx          # Terms of service (uses same shell)
│   ├── opengraph-image.tsx     # Edge-rendered OG image
│   ├── sitemap.ts              # Sitemap
│   ├── robots.ts               # Robots.txt
│   └── api/demo-request/       # Lead capture API route
├── components/marketing/       # All marketing-specific components
│   ├── section-shell.tsx       # Layout primitive: padding, max-width, background band
│   ├── section-eyebrow.tsx     # Small uppercase label above headings
│   ├── cta-cluster.tsx         # Primary + secondary CTA button pair
│   ├── marketing-card.tsx      # Card variant for marketing sections
│   ├── reveal-on-scroll.tsx    # Intersection-observer scroll reveal (client component)
│   ├── product-frame.tsx       # Product proof primitives (ProductWindow, ActionRow, etc.)
│   ├── site-header.tsx         # Sticky marketing header with mobile nav (client)
│   ├── site-footer.tsx         # Site footer with grouped links
│   ├── hero-section.tsx        # Hero: headline + product proof canvas
│   ├── proof-band.tsx          # Trust strip below hero
│   ├── story-chapters.tsx      # During / after / between meeting chapters
│   ├── live-context-chapter.tsx     # "Live context in the room" dark chapter
│   ├── controlled-autonomy-chapter.tsx  # Approval/execution flow chapter
│   ├── integrations-chapter.tsx     # Connected tools chapter
│   ├── audience-chapter.tsx    # Who Kodi is for (roles)
│   ├── trust-faq-chapter.tsx   # Trust proof + FAQ
│   ├── closing-cta.tsx         # Final CTA dark section
│   └── demo-form.tsx           # Walkthrough request form (client component)
└── content/marketing/          # Typed content — all copy lives here
    ├── site-config.ts          # Nav items, footer groups, CTA labels and URLs
    ├── homepage.ts             # Homepage section copy (hero, chapters, FAQ, audience)
    ├── integrations.ts         # Integration categories and names
    └── proof.ts                # Trust proof points
```

## How to update content

### Change a CTA label or URL

Edit `src/content/marketing/site-config.ts` — the `ctaConfig` object. The primary CTA (`Start free`) and secondary CTA (`Book a walkthrough`) are both defined here and used consistently across header, hero, chapters, and footer.

### Update homepage copy

Edit `src/content/marketing/homepage.ts`. Each homepage section has its own typed export:
- `heroContent` — headline, subhead, eyebrow, CTA labels
- `proofBandItems` — three stats in the trust band below the hero
- `storyChapters` — the three during/after/between chapter blocks
- `audienceModules` — the three role-based audience cards
- `faqItems` — FAQ questions and answers

### Add a nav item

Edit `primaryNav` in `src/content/marketing/site-config.ts`. The header and mobile menu both consume this array.

### Add a footer link group or link

Edit `footerGroups` in `src/content/marketing/site-config.ts`.

### Add an integration

Edit `integrationCategories` in `src/content/marketing/integrations.ts`. Each category has `id`, `label`, `description`, and an `integrations` array. New integrations are automatically rendered in both the homepage integrations chapter and the `/integrations` page.

### Update FAQ or trust proof points

Edit `faqItems` in `src/content/marketing/homepage.ts` or `trustProofPoints` in `src/content/marketing/proof.ts`.

## How to add a homepage section

1. Create a new component in `src/components/marketing/my-section.tsx`.
2. Import and add it to `src/app/page.tsx` at the desired position.
3. If the section has copy, add a typed export to `src/content/marketing/homepage.ts`.
4. Use `SectionShell` for the outer wrapper to inherit consistent padding and max-width.
5. Wrap animated content in `RevealOnScroll` for scroll-triggered fade-in.

## How to add a supporting page

1. Create `src/app/your-page/page.tsx` with a `Metadata` export.
2. Use `SectionShell` for layout consistency.
3. The site header and footer are rendered by `layout.tsx` — no need to add them per-page.
4. Add the page to `src/app/sitemap.ts`.
5. If it should appear in the nav, add it to `primaryNav` in `site-config.ts`.

## @kodi/ui vs apps/web boundary

Use `@kodi/ui` (imported from `packages/ui`) for components that are useful in both the marketing site and the app shell:
- `Button`, `Badge`, `BrandLogo`, `Card`, etc.

Keep inside `apps/web/src/components/marketing/` for anything tied to marketing storytelling:
- Product proof frames, story chapters, audience modules, demo forms
- `SectionShell`, `SectionEyebrow`, `CTACluster` — these started as marketing-specific and can be promoted to `@kodi/ui` when the package symlink situation is resolved in the monorepo.

## Asset strategy

### Brand logo
Served from `public/brand/kodi-logo.png`. Used by `BrandLogo` from `@kodi/ui`.

### OG image
Generated at edge via `src/app/opengraph-image.tsx`. To replace with a designed asset, add a `og-image.png` to `public/` and update the metadata in `layout.tsx`.

### Integration icons
Integration names are rendered as text chips. No remote icon CDN calls. To add branded icons, place SVG files in `public/integrations/<name>.svg` and update `IntegrationCategory` in `src/content/marketing/integrations.ts` to include an `iconPath` field.

### Product screenshots
If adding screenshots or designed product visuals, place them in `public/product/` and use `next/image` for proper optimization.

## Motion system

CSS-only motion is defined in `src/app/globals.css`:
- `.reveal` + `.is-visible`: fade+translate in for scroll reveals
- `.stagger` parent + `.reveal` children: staggered delays
- `.status-pulse`: breathing pulse for live indicators
- `.marquee-track`: horizontal scroll loop

`RevealOnScroll` (`src/components/marketing/reveal-on-scroll.tsx`) wraps any section and triggers `.is-visible` when it enters the viewport.

All animations respect `prefers-reduced-motion: reduce` — the animations are disabled in `globals.css` media query.

## Analytics

CTA click tracking is wired to `window.gtag` via `src/lib/marketing/analytics.ts`. Add a Google Analytics script tag to `layout.tsx` and events will fire automatically. The typed `MarketingEvent` union in `analytics.ts` enforces consistent event shapes across all CTAs.

## Lead capture

The demo request form (`DemoForm`) posts to `/api/demo-request`. The route handler at `src/app/api/demo-request/route.ts` currently logs the lead to the server console. Wire it to your email system or CRM by replacing the `console.log` block.

## Brand tokens

Marketing-specific color tokens are defined in:
- `packages/ui/src/styles/brand-theme.css` — CSS custom properties (`--kodi-room-dark`, `--kodi-warm-sand`, etc.)
- `packages/ui/src/tailwind-theme.ts` — Tailwind color mappings (`brand.room-dark`, `brand.warm-sand`, etc.)

These are consumed in `apps/web/tailwind.config.ts` via the `kodiTailwindTheme` spread.
