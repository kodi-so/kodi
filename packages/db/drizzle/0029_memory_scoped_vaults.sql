CREATE TYPE "memory_scope_type" AS ENUM('org', 'member');

CREATE TYPE "memory_path_type" AS ENUM('file', 'directory');

CREATE TABLE "memory_vaults" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "scope_type" "memory_scope_type" NOT NULL,
  "org_member_id" text,
  "root_path" text NOT NULL,
  "manifest_path" text NOT NULL,
  "storage_backend" text DEFAULT 's3' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "memory_vaults_scope_member_check" CHECK (
    (
      "scope_type" = 'org'
      AND "org_member_id" IS NULL
    ) OR (
      "scope_type" = 'member'
      AND "org_member_id" IS NOT NULL
    )
  )
);

CREATE TABLE "memory_paths" (
  "id" text PRIMARY KEY NOT NULL,
  "vault_id" text NOT NULL,
  "path" text NOT NULL,
  "path_type" "memory_path_type" NOT NULL,
  "parent_path" text,
  "title" text,
  "is_manifest" boolean DEFAULT false NOT NULL,
  "is_index" boolean DEFAULT false NOT NULL,
  "last_updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "memory_vaults"
  ADD CONSTRAINT "memory_vaults_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id")
  REFERENCES "public"."organizations"("id")
  ON DELETE cascade
  ON UPDATE no action;

ALTER TABLE "memory_vaults"
  ADD CONSTRAINT "memory_vaults_org_member_id_org_members_id_fk"
  FOREIGN KEY ("org_member_id")
  REFERENCES "public"."org_members"("id")
  ON DELETE cascade
  ON UPDATE no action;

ALTER TABLE "memory_paths"
  ADD CONSTRAINT "memory_paths_vault_id_memory_vaults_id_fk"
  FOREIGN KEY ("vault_id")
  REFERENCES "public"."memory_vaults"("id")
  ON DELETE cascade
  ON UPDATE no action;

CREATE INDEX "memory_vaults_org_idx" ON "memory_vaults" USING btree ("org_id");

CREATE UNIQUE INDEX "memory_vaults_org_vault_uidx"
  ON "memory_vaults" USING btree ("org_id")
  WHERE "scope_type" = 'org';

CREATE UNIQUE INDEX "memory_vaults_member_vault_uidx"
  ON "memory_vaults" USING btree ("org_id", "org_member_id")
  WHERE "scope_type" = 'member';

CREATE UNIQUE INDEX "memory_paths_vault_path_uidx"
  ON "memory_paths" USING btree ("vault_id", "path");

CREATE INDEX "memory_paths_vault_parent_idx"
  ON "memory_paths" USING btree ("vault_id", "parent_path");

CREATE INDEX "memory_paths_vault_updated_idx"
  ON "memory_paths" USING btree ("vault_id", "last_updated_at");
