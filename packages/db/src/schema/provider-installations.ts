import { relations } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { organizations } from './orgs'

export const conferenceProviderEnum = pgEnum('conference_provider', [
  'zoom',
  'google_meet',
  'local',
  'slack',
])

export const providerInstallationStatusEnum = pgEnum(
  'provider_installation_status',
  ['pending', 'active', 'revoked', 'error']
)

export const providerInstallations = pgTable(
  'provider_installations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: conferenceProviderEnum('provider').notNull(),
    installerUserId: text('installer_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    externalAccountId: text('external_account_id'),
    externalAccountEmail: text('external_account_email'),
    status: providerInstallationStatusEnum('status')
      .notNull()
      .default('pending'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at'),
    scopes: text('scopes').array(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgProviderUidx: uniqueIndex('provider_installations_org_provider_uidx').on(
      table.orgId,
      table.provider
    ),
    orgStatusIdx: index('provider_installations_org_status_idx').on(
      table.orgId,
      table.status
    ),
    externalAccountIdx: index('provider_installations_external_account_idx').on(
      table.externalAccountId
    ),
  })
)

export const providerInstallationsRelations = relations(
  providerInstallations,
  ({ one }) => ({
    org: one(organizations, {
      fields: [providerInstallations.orgId],
      references: [organizations.id],
    }),
    installerUser: one(user, {
      fields: [providerInstallations.installerUserId],
      references: [user.id],
    }),
  })
)

export type ProviderInstallation = typeof providerInstallations.$inferSelect
export type NewProviderInstallation = typeof providerInstallations.$inferInsert
