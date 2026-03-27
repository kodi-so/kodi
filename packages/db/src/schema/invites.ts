import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './orgs'

export const orgInvites = pgTable('org_invites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull().unique(), // signed JWT
  invitedBy: text('invited_by').notNull(), // userId of the owner who sent it
  usedAt: timestamp('used_at'), // null = not yet used
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const orgInvitesRelations = relations(orgInvites, ({ one }) => ({
  org: one(organizations, {
    fields: [orgInvites.orgId],
    references: [organizations.id],
  }),
}))

export type OrgInvite = typeof orgInvites.$inferSelect
export type NewOrgInvite = typeof orgInvites.$inferInsert
