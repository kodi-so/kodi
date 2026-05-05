import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core'
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
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  planId: planIdEnum('plan_id').notNull().default('pro'),
  status: subscriptionStatusEnum('status').notNull().default('incomplete'),
  currentPeriodStart: timestamp('current_period_start', {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const organizationSettings = pgTable('organization_settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  spendingCapCents: integer('spending_cap_cents'), // null = use plan default
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const usageSyncLog = pgTable(
  'usage_sync_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    litellmSpendCents: integer('litellm_spend_cents').notNull(),
    markedUpCents: integer('marked_up_cents').notNull(),
    overageCents: integer('overage_cents').notNull(),
    reportedToStripe: boolean('reported_to_stripe').notNull().default(false),
    carryOverCents: integer('carry_over_cents').notNull().default(0),
    stripeMeterEventId: text('stripe_meter_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orgPeriodIdx: index('usage_sync_log_org_period_idx').on(
      table.orgId,
      table.periodEnd
    ),
  })
)

// Relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  org: one(organizations, {
    fields: [subscriptions.orgId],
    references: [organizations.id],
  }),
}))

export const organizationSettingsRelations = relations(
  organizationSettings,
  ({ one }) => ({
    org: one(organizations, {
      fields: [organizationSettings.orgId],
      references: [organizations.id],
    }),
  }),
)

export const usageSyncLogRelations = relations(usageSyncLog, ({ one }) => ({
  org: one(organizations, {
    fields: [usageSyncLog.orgId],
    references: [organizations.id],
  }),
}))

// Types
export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
export type UsageSyncLogEntry = typeof usageSyncLog.$inferSelect
export type OrganizationSettings = typeof organizationSettings.$inferSelect
export type NewOrganizationSettings = typeof organizationSettings.$inferInsert
