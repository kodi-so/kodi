import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { orgMembers, organizations } from './orgs'

export const memoryScopeTypeEnum = pgEnum('memory_scope_type', [
  'org',
  'member',
])

export const memoryPathTypeEnum = pgEnum('memory_path_type', [
  'file',
  'directory',
])

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const memoryVaults = pgTable(
  'memory_vaults',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scopeType: memoryScopeTypeEnum('scope_type').notNull(),
    orgMemberId: text('org_member_id').references(() => orgMembers.id, {
      onDelete: 'cascade',
    }),
    rootPath: text('root_path').notNull(),
    manifestPath: text('manifest_path').notNull(),
    storageBackend: text('storage_backend').notNull().default('r2'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgScopeMemberCheck: check(
      'memory_vaults_scope_member_check',
      sql`(
        (${table.scopeType} = 'org' and ${table.orgMemberId} is null) or
        (${table.scopeType} = 'member' and ${table.orgMemberId} is not null)
      )`
    ),
    orgIdx: index('memory_vaults_org_idx').on(table.orgId),
    orgVaultUidx: uniqueIndex('memory_vaults_org_vault_uidx')
      .on(table.orgId)
      .where(sql`${table.scopeType} = 'org'`),
    memberVaultUidx: uniqueIndex('memory_vaults_member_vault_uidx')
      .on(table.orgId, table.orgMemberId)
      .where(sql`${table.scopeType} = 'member'`),
  })
)

export const memoryPaths = pgTable(
  'memory_paths',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vaultId: text('vault_id')
      .notNull()
      .references(() => memoryVaults.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    pathType: memoryPathTypeEnum('path_type').notNull(),
    parentPath: text('parent_path'),
    title: text('title'),
    isManifest: boolean('is_manifest').notNull().default(false),
    isIndex: boolean('is_index').notNull().default(false),
    contentSearchVector: tsvector('content_search_vector'),
    lastUpdatedAt: timestamp('last_updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    vaultPathUidx: uniqueIndex('memory_paths_vault_path_uidx').on(
      table.vaultId,
      table.path
    ),
    vaultParentIdx: index('memory_paths_vault_parent_idx').on(
      table.vaultId,
      table.parentPath
    ),
    vaultUpdatedIdx: index('memory_paths_vault_updated_idx').on(
      table.vaultId,
      table.lastUpdatedAt
    ),
  })
)

export const memoryVaultsRelations = relations(memoryVaults, ({ one, many }) => ({
  org: one(organizations, {
    fields: [memoryVaults.orgId],
    references: [organizations.id],
  }),
  orgMember: one(orgMembers, {
    fields: [memoryVaults.orgMemberId],
    references: [orgMembers.id],
  }),
  paths: many(memoryPaths),
}))

export const memoryPathsRelations = relations(memoryPaths, ({ one }) => ({
  vault: one(memoryVaults, {
    fields: [memoryPaths.vaultId],
    references: [memoryVaults.id],
  }),
}))

export type MemoryVault = typeof memoryVaults.$inferSelect
export type NewMemoryVault = typeof memoryVaults.$inferInsert
export type MemoryPath = typeof memoryPaths.$inferSelect
export type NewMemoryPath = typeof memoryPaths.$inferInsert
