import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const orgMemberRoleEnum = pgEnum('org_member_role', ['owner', 'member'])
export const instanceStatusEnum = pgEnum('instance_status', [
  'pending',
  'installing',
  'running',
  'error',
  'suspended',
  'deleting',
  'deleted',
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
  // Provisioning fields (added in KOD-46)
  gatewayToken: text('gateway_token'),         // AES-256-GCM encrypted — the OpenClaw auth token
  dnsRecordId: text('dns_record_id'),          // Cloudflare DNS record ID (for cleanup on deprovision)
  litellmCustomerId: text('litellm_customer_id'), // LiteLLM user_id (orgId used as customer ID)
  litellmVirtualKey: text('litellm_virtual_key'), // AES-256-GCM encrypted — per-instance LiteLLM key
  errorMessage: text('error_message'),         // Last error message if status='error'
  sshUser: text('ssh_user').default('ubuntu'), // SSH username ('ubuntu' for AWS)
  lastHealthCheck: timestamp('last_health_check'), // When we last polled /health
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
