# Billing Implementation Plan

> **Owner:** Sebastian
> **Created:** 2026-04-02
> **Status:** Planning
> **Goal:** Ship org-level subscriptions with usage-based metered billing so Kodi can onboard paying customers.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Key Decisions](#2-key-decisions)
3. [Phase 1 — Plans Config, DB Schema & Stripe Setup](#3-phase-1--plans-config-db-schema--stripe-setup)
4. [Phase 2 — Subscription Lifecycle (Checkout → Webhooks → Portal)](#4-phase-2--subscription-lifecycle-checkout--webhooks--portal)
5. [Phase 3 — Usage Metering Pipeline (LiteLLM → DB → Stripe)](#5-phase-3--usage-metering-pipeline-litellm--db--stripe)
6. [Phase 4 — Billing UI (Settings, Usage Dashboard, Spending Limits)](#6-phase-4--billing-ui-settings-usage-dashboard-spending-limits)
7. [Phase 5 — Foundation for Future Features (BYOK, Compute, Seats, Alerts)](#7-phase-5--foundation-for-future-features-byok-compute-seats-alerts)
8. [Data Flow Diagrams](#8-data-flow-diagrams)
9. [Edge Cases & Risks](#9-edge-cases--risks)
10. [Environment Variables](#10-environment-variables)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Overview & Architecture

### What we're building

A billing system where:

- **Organizations subscribe** to a plan (Pro or Business) with a flat monthly fee via Stripe Checkout.
- Each plan includes a **fixed credit allocation** (dollar amount of LLM usage included per month).
- Usage **above** the included credits is charged as **metered overage** on the same Stripe subscription.
- All token costs are sold at a **1.2x markup** over our raw LiteLLM costs (not communicated to users).
- Org owners can set a **monthly spending cap** to control overage costs.
- Stripe handles all invoicing, payment collection, and dunning.

### System boundaries

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│  API (tRPC)  │────▶│  Database    │
│  (Next.js)  │     │  (Hono)      │     │  (Postgres)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
              ┌─────▼─────┐ ┌─────▼─────┐
              │  Stripe   │ │  LiteLLM  │
              │  (billing)│ │  (usage)  │
              └───────────┘ └───────────┘
```

- **LiteLLM** = source of truth for raw token costs per request/key.
- **Stripe** = source of truth for subscription status, invoices, payment state.
- **Our DB** = stores the mapping between orgs, Stripe customers, subscriptions, plan config, usage sync state, and spending limits.

### Packages affected

| Package | What changes |
|---------|-------------|
| `packages/db` | New schema: `subscriptions`, `organization_settings`, `usage_sync_log`, new columns on `organizations` |
| `apps/api` | New `billing` tRPC router, usage sync cron logic, enhanced LiteLLM helpers |
| `apps/app` | Stripe env vars, billing settings UI, usage dashboard, checkout/portal redirects, webhook handler updates |

---

## 2. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Billing scope | Per-organization (not per-user) | Meeting decision. Org owner pays, all members share the budget. |
| Plan count | 2 (Pro + Business) | Keep it simple. Three is the ceiling. |
| Markup factor | 1.2x on all token usage | Applied universally. Not communicated to users. |
| Metering approach | Single Stripe meter reporting cost in cents | LiteLLM already calculates per-model costs. One meter avoids per-model complexity. |
| Usage data source | LiteLLM `/key/info` + `/spend/logs` | LiteLLM is the cost engine — it knows model pricing and calculates per-request cost. |
| LiteLLM budget math | `litellm_max_budget = user_visible_limit / 1.2` | So when LiteLLM hits its budget, the user's marked-up limit is reached. |
| Overage billing | Stripe metered billing (flat fee + usage on one subscription) | Stripe handles invoicing, dunning, retries. We just report cents. |
| Top-ups | Deferred to post-v0 | Metered billing covers the core use case. Top-ups add complexity. |
| Per-seat pricing | Deferred to post-v0 | Agreed direction but not needed yet. |
| Compute size upgrades | Deferred to post-v0 | Future feature, foundation only. |
| BYOK (bring your own keys) | Deferred to post-v0 (schema foundation in v0) | Business tier unlock. Need schema/config support. |
| Email alerts (approaching limits) | Deferred to post-v0 (planned tickets) | Need SES setup first. |
| Provisioning gating | Deferred to post-v0 (planned ticket) | Exact behavior TBD. |
| Free tier / trial | None | Users pay to use. |

---

## 3. Phase 1 — Plans Config, DB Schema & Stripe Setup

### 3.1 Plans Configuration

Create a shared plans config file used by both API and frontend.

**File:** `packages/db/src/lib/plans.ts` (in `@kodi/db` so both apps can import it)

```typescript
export const MARKUP_FACTOR = 1.2

export const PLANS = {
  pro: {
    name: 'Pro',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
    monthlyPriceCents: 5999,           // $59.99/mo
    includedCreditsCents: 1500,        // $15.00 visible to user
    includedCreditsRealCents: 1250,    // $12.50 actual LiteLLM budget ($15 / 1.2)
    defaultSpendingCapCents: 5000,     // $50.00 default monthly cap
    maxMembers: 5,                     // for future use
    computeTier: 'standard',           // for future use
    byokEnabled: false,               // for future use
  },
  business: {
    name: 'Business',
    stripePriceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? '',
    monthlyPriceCents: 15999,          // $159.99/mo
    includedCreditsCents: 5000,        // $50.00 visible to user
    includedCreditsRealCents: 4167,    // $41.67 actual LiteLLM budget ($50 / 1.2)
    defaultSpendingCapCents: 20000,    // $200.00 default monthly cap
    maxMembers: 25,                    // for future use
    computeTier: 'enhanced',           // for future use
    byokEnabled: true,                // for future use (Business tier unlock)
  },
} as const

export type PlanId = keyof typeof PLANS
export type PlanConfig = typeof PLANS[PlanId]

/** Convert a user-visible dollar amount to the real LiteLLM budget. */
export function toRealBudget(userVisibleCents: number): number {
  return Math.round(userVisibleCents / MARKUP_FACTOR)
}

/** Convert a real LiteLLM cost to the user-visible (marked-up) amount. */
export function toUserVisibleCost(realCostCents: number): number {
  return Math.round(realCostCents * MARKUP_FACTOR)
}
```

### 3.2 Database Schema Changes

**New file:** `packages/db/src/schema/billing.ts`

```sql
-- subscriptions table: links an org to a Stripe subscription
CREATE TABLE subscriptions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  plan_id         TEXT NOT NULL DEFAULT 'pro',       -- 'pro' | 'business'
  status          TEXT NOT NULL DEFAULT 'incomplete', -- 'active' | 'past_due' | 'canceled' | 'incomplete'
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- usage_sync_log table: tracks periodic LiteLLM → Stripe meter syncs
CREATE TABLE usage_sync_log (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  litellm_spend_cents   INTEGER NOT NULL,             -- raw LiteLLM cost in cents
  marked_up_cents       INTEGER NOT NULL,             -- after 1.2x markup
  overage_cents         INTEGER NOT NULL,             -- amount above included credits
  reported_to_stripe    BOOLEAN NOT NULL DEFAULT FALSE,
  carry_over_cents      INTEGER NOT NULL DEFAULT 0,   -- sub-cent remainder for next sync
  stripe_meter_event_id TEXT,                          -- Stripe meter event ID for audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX usage_sync_log_org_period_idx ON usage_sync_log(org_id, period_end);
```

**New table: `organization_settings`** — org-level preferences that persist across subscription changes:

```sql
CREATE TABLE organization_settings (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  spending_cap_cents    INTEGER,                      -- org owner sets this; null = plan default
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Why a separate table?** `spending_cap_cents` is an org owner preference, not a subscription attribute. It should survive plan changes, cancellations, and re-subscriptions. This table will also host future org-level settings (BYOK config, notification preferences, etc.).

**New columns on `organizations` table:**

```sql
ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
```

### 3.3 Stripe Product & Price Setup

This is a **manual setup step** (Stripe Dashboard or one-time script), not code. Document it as a runbook.

1. **Create Stripe Product:** "Kodi"
2. **Create two Prices (flat recurring):**
   - Pro: $59.99/month, recurring
   - Business: $159.99/month, recurring
3. **Create Stripe Meter:** `kodi_usage` (event_name: `kodi_usage`, aggregation: `sum`)
4. **Create metered Price on the same Product:** $0.01 per unit on meter `kodi_usage` (1 unit = 1 cent of overage)
5. Store Price IDs in env vars: `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`, `STRIPE_USAGE_PRICE_ID`
6. Store Meter event name in env var: `STRIPE_METER_EVENT_NAME`

### 3.4 Drizzle Schema (TypeScript)

The Drizzle schema in `packages/db/src/schema/billing.ts`:

```typescript
import { pgTable, text, timestamp, boolean, integer, index, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './orgs'

export const planIdEnum = pgEnum('plan_id', ['pro', 'business'])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'incomplete',
])

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull().unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  planId: planIdEnum('plan_id').notNull().default('pro'),
  status: subscriptionStatusEnum('status').notNull().default('incomplete'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    .$onUpdate(() => new Date()),
})

export const usageSyncLog = pgTable('usage_sync_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  litellmSpendCents: integer('litellm_spend_cents').notNull(),
  markedUpCents: integer('marked_up_cents').notNull(),
  overageCents: integer('overage_cents').notNull(),
  reportedToStripe: boolean('reported_to_stripe').notNull().default(false),
  carryOverCents: integer('carry_over_cents').notNull().default(0),
  stripeMeterEventId: text('stripe_meter_event_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('usage_sync_log_org_period_idx').on(table.orgId, table.periodEnd),
])

// Relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  org: one(organizations, {
    fields: [subscriptions.orgId],
    references: [organizations.id],
  }),
}))

export const usageSyncLogRelations = relations(usageSyncLog, ({ one }) => ({
  org: one(organizations, {
    fields: [usageSyncLog.orgId],
    references: [organizations.id],
  }),
}))

export const organizationSettings = pgTable('organization_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull().unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  spendingCapCents: integer('spending_cap_cents'),  // null = use plan default
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    .$onUpdate(() => new Date()),
})

export const organizationSettingsRelations = relations(organizationSettings, ({ one }) => ({
  org: one(organizations, {
    fields: [organizationSettings.orgId],
    references: [organizations.id],
  }),
}))

// Types
export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
export type UsageSyncLogEntry = typeof usageSyncLog.$inferSelect
export type OrganizationSettings = typeof organizationSettings.$inferSelect
export type NewOrganizationSettings = typeof organizationSettings.$inferInsert
```

Also add `stripeCustomerId` to the `organizations` table in `packages/db/src/schema/orgs.ts`:

```typescript
// Add to organizations table definition:
stripeCustomerId: text('stripe_customer_id'),
```

Export from `packages/db/src/schema/index.ts`:

```typescript
export * from './billing'
```

---

## 4. Phase 2 — Subscription Lifecycle (Checkout → Webhooks → Portal)

### 4.1 Billing tRPC Router

**New file:** `apps/api/src/routers/billing/router.ts`

Procedures:

| Procedure | Auth | Description |
|-----------|------|-------------|
| `billing.getStatus` | memberProcedure | Returns subscription status, plan, current period, spending cap, and current usage for the org |
| `billing.createCheckoutSession` | ownerProcedure | Creates a Stripe Checkout Session for the selected plan. Includes flat fee price + metered usage price as line items. Redirects user to Stripe. |
| `billing.createPortalSession` | ownerProcedure | Creates a Stripe Billing Portal session so the owner can manage payment method, view invoices, cancel. |
| `billing.updateSpendingCap` | ownerProcedure | Updates `spending_cap_cents` on `organization_settings` and recalculates the LiteLLM key budget accordingly. |
| `billing.getUsageHistory` | memberProcedure | Returns usage sync log entries for the current billing period (for the usage dashboard). |

### 4.2 Checkout Flow

```
User clicks "Subscribe to Pro" in UI
  → API: billing.createCheckoutSession({ planId: 'pro' })
    → Find or create Stripe Customer (store on organizations.stripe_customer_id)
    → stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        line_items: [
          { price: STRIPE_PRO_PRICE_ID, quantity: 1 },       // flat fee
          { price: STRIPE_USAGE_PRICE_ID },                   // metered usage
        ],
        metadata: { orgId, planId },
        success_url: APP_URL/settings/billing?success=true,
        cancel_url: APP_URL/settings/billing?canceled=true,
      })
    → Return checkout session URL
  → Frontend redirects to Stripe Checkout
  → User pays
  → Stripe sends checkout.session.completed webhook
```

### 4.3 Webhook Handler

**File:** `apps/app/src/app/api/webhooks/stripe/route.ts` (update existing skeleton)

Events to handle:

| Event | Handler |
|-------|---------|
| `checkout.session.completed` | Create/update subscription record in DB. Set status=active. Store Stripe customer ID + subscription ID. Set plan defaults (spending cap, LiteLLM budget). |
| `customer.subscription.updated` | Sync status, cancel_at_period_end, current_period_end. Handle plan upgrades/downgrades. |
| `customer.subscription.deleted` | Set status=canceled. (Instance deprovisioning is a separate future ticket.) |
| `invoice.payment_succeeded` | Set status=active, update period_end. **Reset monthly usage tracking** — reset LiteLLM key spend and update budget for new period. |
| `invoice.payment_failed` | Set status=past_due. |

### 4.4 Webhook → LiteLLM Budget Sync

On `checkout.session.completed` (new subscription):

```
1. Look up the plan config for the selected planId
2. Get the org's instance (if provisioned)
3. If instance has a LiteLLM virtual key:
   a. Set LiteLLM key max_budget = plan.includedCreditsRealCents / 100
      (e.g., Pro: $12.50 real budget = $15 user-visible at 1.2x)
4. Store subscription in DB
```

On `invoice.payment_succeeded` (monthly renewal):

```
1. Look up org's subscription → plan config
2. Get org's instance + LiteLLM key
3. Get current key spend from LiteLLM
4. Reset budget: new max_budget = current_spend + (plan.includedCreditsRealCents / 100)
   This effectively gives them a fresh allocation on top of wherever spend is
5. Update subscription period_end in DB
6. Reset carry_over_cents in usage_sync_log to 0 for the new period
```

### 4.5 Stripe Billing Portal

For managing payment methods, viewing invoices, and canceling:

```
billing.createPortalSession()
  → stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: APP_URL/settings/billing,
    })
  → Return portal URL
  → Frontend redirects
```

---

## 5. Phase 3 — Usage Metering Pipeline (LiteLLM → DB → Stripe)

This is the core metering logic that bridges LiteLLM spend tracking to Stripe invoicing.

### 5.1 Overview

```
Every hour (cron):
  For each org with an active subscription + running instance:
    1. Query LiteLLM /key/info for the org's virtual key → get current spend
    2. Calculate delta since last sync
    3. Apply 1.2x markup
    4. Subtract included credits (if not already exhausted for this period)
    5. If overage > 0, report to Stripe meter (in whole cents)
    6. Carry forward any sub-cent remainder
    7. Log everything to usage_sync_log
    8. If spend approaching spending cap → flag (alerts deferred to post-v0)
```

### 5.2 Usage Sync Logic (Pseudocode)

```typescript
async function syncUsageForOrg(org, subscription, orgSettings, instance) {
  const plan = PLANS[subscription.planId]
  const spendingCapCents = orgSettings?.spendingCapCents ?? plan.defaultSpendingCapCents

  // 1. Get current LiteLLM spend (in dollars)
  const keyInfo = await litellm.getKeyInfo(decrypt(instance.litellmVirtualKey))
  const currentSpendCents = Math.round(keyInfo.spend * 100)

  // 2. Get last sync for this org in current period
  const lastSync = await getLastSyncInPeriod(org.id, subscription.currentPeriodStart)
  const previousSpendCents = lastSync?.litellmSpendCents ?? 0
  const previousCarryOverCents = lastSync?.carryOverCents ?? 0

  // 3. Calculate delta
  const deltaSpendCents = currentSpendCents - previousSpendCents
  if (deltaSpendCents <= 0) return // no new usage

  // 4. Apply markup
  const markedUpDelta = deltaSpendCents * MARKUP_FACTOR
  const totalMarkedUpWithCarry = markedUpDelta + previousCarryOverCents

  // 5. Calculate total marked-up spend this period
  const totalMarkedUpSpendThisPeriod = currentSpendCents * MARKUP_FACTOR
  const includedCreditsCents = plan.includedCreditsCents

  // 6. Calculate overage (only the portion above included credits)
  // We need cumulative tracking: how much of the total marked-up spend exceeds included credits
  const previousTotalMarkedUp = previousSpendCents * MARKUP_FACTOR
  const previousOverageReported = lastSync?.cumulativeOverageReportedCents ?? 0

  const currentCumulativeOverage = Math.max(0, totalMarkedUpSpendThisPeriod - includedCreditsCents)
  const newOverageSinceLastSync = currentCumulativeOverage - previousOverageReported

  const overageWithCarry = newOverageSinceLastSync + previousCarryOverCents
  const wholeOverageCents = Math.floor(overageWithCarry)
  const newCarryOver = overageWithCarry - wholeOverageCents

  // 7. Report to Stripe meter (if overage > 0)
  let meterEventId = null
  if (wholeOverageCents > 0) {
    // Check spending cap
    const totalOverageThisPeriod = previousOverageReported + wholeOverageCents
    if (totalOverageThisPeriod > (spendingCapCents - includedCreditsCents)) {
      // Would exceed cap — report only up to cap
      const allowedOverage = Math.max(0, (spendingCapCents - includedCreditsCents) - previousOverageReported)
      if (allowedOverage > 0) {
        meterEventId = await reportToStripeMeter(org.stripeCustomerId, allowedOverage)
      }
      // Also update LiteLLM budget to stop further usage
      await litellm.updateKeyBudget(virtualKey, toRealBudget(spendingCapCents) / 100)
    } else {
      meterEventId = await reportToStripeMeter(org.stripeCustomerId, wholeOverageCents)
    }
  }

  // 8. Log to usage_sync_log
  await insertUsageSyncLog({
    orgId: org.id,
    periodStart: subscription.currentPeriodStart,
    periodEnd: new Date(), // now
    litellmSpendCents: currentSpendCents,
    markedUpCents: Math.round(totalMarkedUpSpendThisPeriod),
    overageCents: wholeOverageCents,
    reportedToStripe: meterEventId !== null,
    carryOverCents: Math.round(newCarryOver * 100) / 100,
    stripeMeterEventId: meterEventId,
  })
}
```

### 5.3 Stripe Meter Reporting

```typescript
async function reportToStripeMeter(
  stripeCustomerId: string,
  overageCents: number,
): Promise<string> {
  const event = await stripe.billing.meterEvents.create({
    event_name: env.STRIPE_METER_EVENT_NAME, // 'kodi_usage'
    payload: {
      value: String(overageCents),
      stripe_customer_id: stripeCustomerId,
    },
  })
  return event.identifier
}
```

### 5.4 Cron Job

The usage sync runs as a periodic job. Options:

- **Railway Cron Service** (preferred for our infra): a lightweight service that runs every hour
- **In-process interval** in the API server (simpler but less reliable)

For v0, implement as an API endpoint (`POST /api/billing/sync-usage`) protected by a shared secret, triggered by Railway Cron or an external cron service.

### 5.5 LiteLLM Budget Management

The LiteLLM key budget serves as a **hard stop** — when hit, LiteLLM rejects requests. This is our safety net.

Budget calculation:

```
litellm_budget = toRealBudget(spending_cap_cents) / 100

Where toRealBudget(userVisibleCents) = Math.round(userVisibleCents / 1.2)
```

Example:
- User spending cap = $50.00 (5000 cents)
- LiteLLM budget = 5000 / 1.2 / 100 = $41.67
- When LiteLLM spend hits $41.67, the user has been billed $50 at our markup

Budget updates happen:
- On subscription creation (set to plan default)
- On spending cap change (owner updates it)
- On monthly renewal (reset = current_spend + included_credits_real)
- On spending cap breach (lock to exact cap)

---

## 6. Phase 4 — Billing UI (Settings, Usage Dashboard, Spending Limits)

### 6.1 New Settings Section: Billing

Add a "Billing" tab to the existing `SettingsLayout` component at `apps/app/src/app/(app)/settings/_components/settings-layout.tsx`.

**New setting sections array entry:**
```typescript
{ href: '/settings/billing', label: 'Billing', icon: CreditCard },
```

### 6.2 Billing Settings Page

**File:** `apps/app/src/app/(app)/settings/billing/page.tsx`

Layout:

```
┌─────────────────────────────────────────────────────┐
│  Billing                                            │
│  Manage your subscription and usage                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Current Plan ─────────────────────────────────┐ │
│  │  Pro Plan               $59.99/mo              │ │
│  │  Status: Active                                │ │
│  │  Next billing: May 2, 2026                     │ │
│  │  [Manage Subscription]  [Upgrade to Business]  │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ Usage This Period ────────────────────────────┐ │
│  │  Included credits:  $8.42 / $15.00 used        │ │
│  │  ████████████░░░░░░░░░░  56%                   │ │
│  │                                                │ │
│  │  Overage:  $0.00                               │ │
│  │  Spending cap: $50.00/mo  [Edit]               │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ No Subscription ─────────────────────────────┐ │
│  │  (shown when no active subscription)           │ │
│  │                                                │ │
│  │  Choose a plan to get started:                 │ │
│  │  [Pro $59.99/mo]  [Business $159.99/mo]        │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**States:**
- **No subscription**: Show plan selection cards with "Subscribe" buttons → Stripe Checkout
- **Active subscription**: Show plan details, usage progress, spending cap, management buttons
- **Past due**: Show warning banner with "Update payment method" button → Stripe Portal
- **Canceled**: Show "Your plan ends on [date]" with option to resubscribe

### 6.3 Usage Display

The usage data comes from two sources:

1. **Real-time**: `billing.getStatus` calls LiteLLM `/key/info` for current spend, applies markup, and returns:
   - `includedCreditsUsedCents`: min(markedUpSpend, plan.includedCreditsCents)
   - `includedCreditsTotalCents`: plan.includedCreditsCents
   - `overageCents`: max(0, markedUpSpend - plan.includedCreditsCents)
   - `spendingCapCents`: orgSettings.spendingCapCents ?? plan.defaultSpendingCapCents

2. **Historical**: `billing.getUsageHistory` returns usage_sync_log entries for charts/details.

### 6.4 Spending Cap Editor

A simple input + save button within the billing settings card. Owner-only.

- Input: dollar amount (min $0, max TBD — maybe $1000 for Pro, $5000 for Business)
- On save: calls `billing.updateSpendingCap({ orgId, capCents })`
- API updates `organization_settings.spending_cap_cents` AND recalculates LiteLLM key budget

### 6.5 Plan Selection / Upgrade Flow

- **No sub → Subscribe**: Redirect to Stripe Checkout with selected plan
- **Pro → Business (upgrade)**: Create new Stripe Checkout Session in `subscription` mode with the Business price. Stripe handles proration.
- **Business → Pro (downgrade)**: Use Stripe Billing Portal (handles proration automatically)
- **Cancel**: Use Stripe Billing Portal

---

## 7. Phase 5 — Foundation for Future Features (BYOK, Compute, Seats, Alerts)

These are **planning/schema-only** tickets — no full implementation in v0.

### 7.1 BYOK (Bring Your Own Keys) — Business Tier

**Concept:** Business users can provide their own API keys (OpenAI, Anthropic, etc.) and bypass LiteLLM's built-in keys. No markup on their own keys.

**Foundation needed:**
- `byokEnabled` flag in plan config (already in PLANS)
- Schema for storing encrypted API keys per org: `org_api_keys` table (future)
- LiteLLM supports routing requests through user-provided keys
- When BYOK is active: skip metered billing for those requests

### 7.2 Compute Size Upgrades

**Concept:** Higher-tier plans get larger EC2 instances.

**Foundation needed:**
- `computeTier` in plan config (already in PLANS)
- Map compute tiers to EC2 instance types
- On plan upgrade/downgrade: resize or reprovision instance

### 7.3 Per-Seat Pricing

**Concept:** Charge per additional member beyond the plan's included count.

**Foundation needed:**
- `maxMembers` in plan config (already in PLANS)
- Stripe per-seat pricing (additional metered line item on subscription)
- On member add/remove: update Stripe subscription quantity

### 7.4 Email Alerts (Spending Limits)

**Concept:** Email org owner when approaching spending cap (e.g., 80%, 100%).

**Foundation needed:**
- Threshold configuration (hardcoded 80%/100% for v0 design)
- Email sending service (currently Resend, eventually AWS SES)
- Alert state tracking (don't re-send for same threshold)
- Check during usage sync: if crossed threshold, queue email

### 7.5 Provisioning Gating

**Concept:** Only allow instance provisioning for orgs with an active subscription.

**Foundation needed:**
- Check subscription status in `instance.provision` procedure
- Handle edge cases: what if subscription lapses? Suspend instance?
- Grace period logic

---

## 8. Data Flow Diagrams

### 8.1 Subscription Creation Flow

```
User (owner) → UI: clicks "Subscribe to Pro"
  → API: billing.createCheckoutSession({ planId: 'pro' })
    → Stripe: create Customer (if new)
    → DB: store stripeCustomerId on organizations
    → Stripe: create Checkout Session (flat + metered prices)
    → Return: checkout URL
  → UI: redirect to Stripe Checkout
  → User: enters payment details, pays
  → Stripe: sends checkout.session.completed webhook
    → Webhook handler:
      → DB: INSERT into subscriptions (status=active, plan=pro)
      → LiteLLM: set key max_budget = $12.50 (Pro included / 1.2)
      → DB: log activity
```

### 8.2 Hourly Usage Sync Flow

```
Cron (every hour) → API: POST /api/billing/sync-usage
  → For each active subscription with a running instance:
    → LiteLLM: GET /key/info → current spend ($)
    → Calculate:
      - delta since last sync
      - apply 1.2x markup
      - subtract included credits
      - determine overage in whole cents
      - check spending cap
    → If overage > 0:
      → Stripe: report meter event (cents)
    → DB: INSERT into usage_sync_log
    → If approaching cap:
      → (future) Send email alert
      → If at cap: update LiteLLM budget to hard-stop
```

### 8.3 Monthly Renewal Flow

```
Stripe: invoice.payment_succeeded webhook
  → Webhook handler:
    → DB: UPDATE subscription (status=active, new period_end)
    → LiteLLM: get current spend
    → LiteLLM: set new max_budget = current_spend + (includedCreditsReal)
      (This gives them a fresh credit allocation without resetting spend counter)
    → DB: reset carry_over_cents for new period
```

### 8.4 Spending Cap Update Flow

```
Owner → UI: changes spending cap to $75
  → API: billing.updateSpendingCap({ capCents: 7500 })
    → DB: UPSERT organization_settings SET spending_cap_cents = 7500
    → LiteLLM: set key max_budget = toRealBudget(7500) / 100 = $62.50
    → Return: success
```

---

## 9. Edge Cases & Risks

### 9.1 Race conditions

| Scenario | Mitigation |
|----------|-----------|
| Two usage syncs run simultaneously | Use `pg_advisory_lock` keyed on org ID during sync |
| Webhook arrives during sync | Webhook and sync write to different tables; subscription status vs usage_sync_log |
| User upgrades plan mid-cycle | Stripe handles proration. Our webhook updates the plan config. Next sync uses new plan's included credits. |

### 9.2 LiteLLM unavailability

| Scenario | Mitigation |
|----------|-----------|
| LiteLLM API down during sync | Retry with exponential backoff. Log error. Skip org for this cycle. |
| LiteLLM spend data inconsistent | Always use monotonically increasing spend. If delta < 0, skip (likely a reset or data issue). |

### 9.3 Stripe failures

| Scenario | Mitigation |
|----------|-----------|
| Meter event fails to report | Log error, do NOT advance the sync state. Retry next cycle. |
| Webhook signature invalid | Return 400, do not process. |
| Webhook handler throws | Return 500 so Stripe retries (Stripe retries for up to 3 days). |
| Duplicate webhook delivery | All handlers must be idempotent — use upsert patterns. |

### 9.4 Budget edge cases

| Scenario | Mitigation |
|----------|-----------|
| Spending cap set lower than current usage | Don't claw back. Set LiteLLM budget to current_spend (effectively stops new usage). Alert user that they've already exceeded the new cap. |
| Plan downgrade with higher current usage | Keep current usage; new included credits apply to future billing period. |
| LiteLLM budget drift | Each sync recalculates and corrects the LiteLLM budget based on current state. |

### 9.5 Precision

- All internal calculations use **cents** (integers) to avoid floating-point issues.
- LiteLLM returns spend in dollars (float). Convert to cents immediately: `Math.round(spend * 100)`.
- Carry-over sub-cent amounts tracked per sync cycle.

---

## 10. Environment Variables

New env vars needed (add to both `apps/app/src/env.ts` and `apps/api/src/env.ts` as appropriate):

| Variable | Where | Description |
|----------|-------|-------------|
| `STRIPE_SECRET_KEY` | app, api | Already exists in app. Add to api if needed for sync. |
| `STRIPE_WEBHOOK_SECRET` | app | Already exists. |
| `STRIPE_PRO_PRICE_ID` | app, api | Stripe Price ID for Pro flat fee |
| `STRIPE_BUSINESS_PRICE_ID` | app, api | Stripe Price ID for Business flat fee |
| `STRIPE_USAGE_PRICE_ID` | app, api | Stripe Price ID for metered usage |
| `STRIPE_METER_EVENT_NAME` | api | Meter event name (e.g., `kodi_usage`) |
| `USAGE_SYNC_SECRET` | api | Shared secret to protect the sync endpoint |
| `APP_URL` | app, api | Already exists in api. Needed for Checkout redirect URLs. |

---

## 11. Testing Strategy

### Unit tests

- Plans config: verify markup calculations, `toRealBudget`, `toUserVisibleCost`
- Usage sync logic: verify overage calculation, carry-over, spending cap enforcement
- Webhook handlers: mock Stripe events, verify DB state changes

### Integration tests

- Full checkout flow: create checkout → simulate webhook → verify subscription in DB
- Usage sync: seed LiteLLM mock data → run sync → verify Stripe meter events + DB logs
- Monthly renewal: simulate invoice.payment_succeeded → verify LiteLLM budget reset

### Manual testing

- Stripe CLI: `stripe listen --forward-to localhost:3001/api/webhooks/stripe`
- Stripe test mode: full checkout flow with test cards
- LiteLLM: verify key budget updates via `/key/info`

---

## Phase Summary

| Phase | Scope | Depends on |
|-------|-------|-----------|
| **Phase 1** | Plans config, DB schema, Stripe product setup, migration | Nothing |
| **Phase 2** | Subscription lifecycle: checkout, webhooks, portal, billing tRPC router | Phase 1 |
| **Phase 3** | Usage metering: LiteLLM sync, Stripe meter reporting, cron | Phase 2 |
| **Phase 4** | Billing UI: settings page, usage display, spending cap, plan selection | Phase 2 (UI can start in parallel with Phase 3) |
| **Phase 5** | Foundation tickets: BYOK, compute, seats, alerts, provisioning gating | Phase 1 (schema only, no dependencies on billing being live) |
