import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const orgMemberRoleEnum = pgEnum('org_member_role', ['owner', 'member'])
export const instanceStatusEnum = pgEnum('instance_status', [
  'pending',
  'installing',
  'running',
  'error',
  'suspended',
])

export const organizations = pgTable('organizations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id').notNull(), // references user.id (Better-Auth)
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const orgMembers = pgTable('org_members', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // references user.id (Better-Auth)
  role: orgMemberRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const instances = pgTable('instances', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  status: instanceStatusEnum('status').notNull().default('pending'),
  ec2InstanceId: text('ec2_instance_id'),
  ipAddress: text('ip_address'),
  hostname: text('hostname'),
  litellmKey: text('litellm_key'), // AES-256-GCM encrypted (added in KOD-8)
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Drizzle relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  instances: many(instances),
}))

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
}))

export const instancesRelations = relations(instances, ({ one }) => ({
  org: one(organizations, {
    fields: [instances.orgId],
    references: [organizations.id],
  }),
}))

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type OrgMember = typeof orgMembers.$inferSelect
export type NewOrgMember = typeof orgMembers.$inferInsert
export type Instance = typeof instances.$inferSelect
export type NewInstance = typeof instances.$inferInsert
