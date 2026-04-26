import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { subscriptions, organizationSettings } from './billing'

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
  stripeCustomerId: text('stripe_customer_id'),
  image: text('image'), // workspace logo — data URL or external URL
  status: text('status').notNull().default('active'), // 'active' | 'pending_billing'
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
  instanceUrl: text('instance_url'), // Explicit URL override; falls back to https://<hostname> or OPENCLAW_DEV_URL
  // Provisioning fields (added in KOD-46)
  gatewayToken: text('gateway_token'),         // AES-256-GCM encrypted — the OpenClaw auth token
  dnsRecordId: text('dns_record_id'),          // Cloudflare DNS record ID (for cleanup on deprovision)
  litellmCustomerId: text('litellm_customer_id'), // LiteLLM user_id (orgId used as customer ID)
  litellmVirtualKey: text('litellm_virtual_key'), // AES-256-GCM encrypted — per-instance LiteLLM key
  errorMessage: text('error_message'),         // Last error message if status='error'
  sshUser: text('ssh_user').default('ubuntu'), // SSH username ('ubuntu' for AWS)
  lastHealthCheck: timestamp('last_health_check'), // When we last polled /health
  // kodi-bridge plugin fields (KOD-353)
  pluginVersionInstalled: text('plugin_version_installed'),     // Current plugin bundle version on this instance
  pluginHmacSecretEncrypted: text('plugin_hmac_secret_encrypted'), // AES-256-GCM encrypted — shared HMAC secret for Kodi ↔ plugin signing
  lastPluginHeartbeatAt: timestamp('last_plugin_heartbeat_at'),  // Last time the plugin sent a heartbeat event
  bundleVersionTarget: text('bundle_version_target'),           // Pinned target version for canary rollouts (null = follow `latest`)
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Drizzle relations
export const organizationsRelations = relations(
  organizations,
  ({ many, one }) => ({
    members: many(orgMembers),
    instances: many(instances),
    subscription: one(subscriptions),
    settings: one(organizationSettings),
  }),
)

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
