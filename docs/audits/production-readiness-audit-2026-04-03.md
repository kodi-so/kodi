# Kodi Production Readiness Audit

Date: 2026-04-03

## Executive Summary

Kodi has a solid product and repo foundation, but it is not yet operating with production-grade frontend consistency, tooling reliability, or maintainability guardrails.

The highest-risk issues are:

1. Root quality gates are broken.
2. Brand/design tokens are not centralized in code.
3. Large route files own too much UI, data, and workflow logic.
4. Shared UI abstractions are too thin to keep app and web consistent.
5. The repo has effectively no automated test coverage.

## What Is Working Well

- The monorepo structure is clear and directionally strong: separate apps plus shared `db`, `ui`, and TypeScript config packages.
- Shared UI primitives already exist in `@kodi/ui`, which gives the codebase a good base to build on.
- The product architecture is coherent: Next.js frontends, Hono+tRPC API, Drizzle DB package, and dedicated integration/runtime services.
- The codebase uses TypeScript broadly, which means maintainability can improve quickly once the broken type/lint guardrails are repaired.
- The brand direction is documented in the brandbook, which is a good source of truth for future tokenization.

## Priority Findings

### P0: Root quality gates are broken

- Root typecheck currently fails in `@kodi/api`, primarily around Drizzle typing and query composition.
- Root lint currently fails because `@kodi/ui` declares an ESLint script but `eslint` is not installed or configured in the repo.
- This means the repo cannot currently rely on CI-style safety checks before merging changes.

Evidence:

- `bun run typecheck` fails in [apps/api/src/context.ts](/Users/gabeliss/Desktop/kodi/apps/api/src/context.ts)
- `bun run typecheck` fails in [apps/api/src/routers/chat/router.ts](/Users/gabeliss/Desktop/kodi/apps/api/src/routers/chat/router.ts)
- `bun run lint` fails from [packages/ui/package.json](/Users/gabeliss/Desktop/kodi/packages/ui/package.json)

### P0: Brand tokens are not centralized in code

- The approved brand palette exists in docs, not in a shared token source consumed by app, web, email, and UI components.
- App and web globals still use default ShadCN-style tokens rather than named Kodi brand tokens.
- Several surfaces still hardcode literal hex values directly in route files and email HTML.

Evidence:

- Brand palette only documented in [docs/brand/kodi-brandbook.md](/Users/gabeliss/Desktop/kodi/docs/brand/kodi-brandbook.md)
- Default theme vars in [apps/app/src/app/globals.css](/Users/gabeliss/Desktop/kodi/apps/app/src/app/globals.css)
- Default theme vars in [apps/web/src/app/globals.css](/Users/gabeliss/Desktop/kodi/apps/web/src/app/globals.css)
- Hardcoded auth/invite colors in [apps/app/src/app/(auth)/login/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(auth)/login/page.tsx)
- Hardcoded auth/invite colors in [apps/app/src/app/(auth)/signup/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(auth)/signup/page.tsx)
- Hardcoded invite/email colors in [apps/app/src/app/invite/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/invite/page.tsx)
- Hardcoded email colors in [apps/api/src/routers/invite/router.ts](/Users/gabeliss/Desktop/kodi/apps/api/src/routers/invite/router.ts)

### P0: The frontend is not DRY enough

- Shared theming is not centralized, so pages repeatedly restyle `Card`, `Button`, `Input`, and layout shells locally.
- App and web have duplicated Tailwind theme extensions instead of a shared theme package or preset.
- Font setup is inconsistent between brand direction and implementation.

Evidence:

- Duplicate Tailwind config in [apps/app/tailwind.config.ts](/Users/gabeliss/Desktop/kodi/apps/app/tailwind.config.ts)
- Duplicate Tailwind config in [apps/web/tailwind.config.ts](/Users/gabeliss/Desktop/kodi/apps/web/tailwind.config.ts)
- Thin UI abstraction in [packages/ui/src/components/button.tsx](/Users/gabeliss/Desktop/kodi/packages/ui/src/components/button.tsx)
- Thin UI abstraction in [packages/ui/src/components/card.tsx](/Users/gabeliss/Desktop/kodi/packages/ui/src/components/card.tsx)
- Web font setup in [apps/web/src/app/layout.tsx](/Users/gabeliss/Desktop/kodi/apps/web/src/app/layout.tsx)
- App layout has no shared font or brand setup in [apps/app/src/app/layout.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/layout.tsx)

### P1: Large route files are carrying too much responsibility

- Several files combine data fetching, orchestration logic, conditional UI, styling, and copy in one place.
- This makes review harder, reuse rarer, and regressions more likely.

Largest hotspots:

- [apps/api/src/lib/tool-access-runtime.ts](/Users/gabeliss/Desktop/kodi/apps/api/src/lib/tool-access-runtime.ts)
- [apps/web/src/app/page.tsx](/Users/gabeliss/Desktop/kodi/apps/web/src/app/page.tsx)
- [apps/app/src/app/(app)/chat/_components/chat-interface.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(app)/chat/_components/chat-interface.tsx)
- [apps/app/src/app/(app)/integrations/[toolkitSlug]/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(app)/integrations/[toolkitSlug]/page.tsx)
- [apps/app/src/app/(app)/meetings/[meetingSessionId]/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(app)/meetings/[meetingSessionId]/page.tsx)
- [apps/app/src/app/(app)/meetings/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(app)/meetings/page.tsx)
- [apps/app/src/app/(app)/approvals/page.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(app)/approvals/page.tsx)

### P1: The repo has almost no automated tests

- There are package test scripts in places, but there are effectively no test or spec files in `apps` or `packages`.
- This is a major production-readiness gap for auth, meetings, tool access, and approvals.

### P1: Dependency and package-manager hygiene need cleanup

- The repo contains both `bun.lock` and `package-lock.json`.
- `package-lock.json` still references `drizzle-orm@0.30.10`, while the workspace has moved to `0.45.1`.
- This is not the only cause of typecheck failure, but it is a maintainability smell and likely contributor to dependency confusion.

Evidence:

- Root lockfiles in [bun.lock](/Users/gabeliss/Desktop/kodi/bun.lock) and [package-lock.json](/Users/gabeliss/Desktop/kodi/package-lock.json)

### P1: There is too much route-level client state

- The app uses `use client` widely across route files, including pages that could be split into server/data shells plus smaller client islands.
- This increases bundle size, makes component responsibilities muddy, and hurts long-term composability.

Evidence:

- Client-heavy pages under [apps/app/src/app](/Users/gabeliss/Desktop/kodi/apps/app/src/app)

### P2: Escape hatches and type looseness are showing up in critical paths

- There are `any` casts and eslint suppressions in auth/context and chat history mapping.
- These may be pragmatic short-term, but they reduce trust in the type system right where the app needs it most.

Evidence:

- `any` auth singleton in [apps/api/src/context.ts](/Users/gabeliss/Desktop/kodi/apps/api/src/context.ts)
- Chat row casts in [apps/app/src/app/(app)/chat/_components/chat-interface.tsx](/Users/gabeliss/Desktop/kodi/apps/app/src/app/(app)/chat/_components/chat-interface.tsx)

## Recommended Remediation Themes

### 1. Establish a real design system

- Create a shared token package or shared theme source for colors, typography, spacing, radii, shadows, and semantic statuses.
- Stop introducing raw hex values in app/web/email code except for external brand assets like Google logos.
- Make app and web consume the same named tokens.

### 2. Restore trust in quality gates

- Fix root typecheck.
- Install and configure ESLint consistently across the monorepo.
- Add CI expectations for lint, typecheck, and tests before merge.

### 3. Decompose large route files

- Extract page sections, data hooks, view models, and presentational components.
- Keep route files thin and compositional.

### 4. Expand shared UI beyond primitives

- Move repeated shells, section headers, empty states, status pills, and auth/invite layouts into reusable components.
- Build brand-safe composition primitives so page authors do not invent styles per route.

### 5. Add test coverage where risk is highest

- Start with auth, org membership, approvals, meetings, and tool access policy logic.
- Add at least smoke coverage for landing/app critical flows.

## Suggested Order of Execution

1. Fix lint and typecheck.
2. Centralize brand tokens and theme consumption.
3. Repair broken/duplicated frontend composition patterns.
4. Split the largest route files.
5. Add tests and CI guardrails.
