CREATE TABLE IF NOT EXISTS "toolkit_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "toolkit_slug" text NOT NULL,
  "toolkit_name" text,
  "auth_config_id" text,
  "auth_config_source" text,
  "connected_account_id" text NOT NULL,
  "connected_account_status" text,
  "connected_account_label" text,
  "external_user_id" text,
  "external_user_email" text,
  "scopes" text[],
  "metadata" jsonb,
  "last_validated_at" timestamp,
  "last_error_at" timestamp,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "toolkit_connections_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "toolkit_connections_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "toolkit_connections_org_user_connected_account_uidx"
  ON "toolkit_connections" USING btree ("org_id","user_id","connected_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "toolkit_connections_org_user_toolkit_idx"
  ON "toolkit_connections" USING btree ("org_id","user_id","toolkit_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "toolkit_connections_org_status_idx"
  ON "toolkit_connections" USING btree ("org_id","connected_account_status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "toolkit_policies" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "toolkit_slug" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "chat_reads_enabled" boolean DEFAULT true NOT NULL,
  "meeting_reads_enabled" boolean DEFAULT true NOT NULL,
  "drafts_enabled" boolean DEFAULT true NOT NULL,
  "writes_require_approval" boolean DEFAULT true NOT NULL,
  "admin_actions_enabled" boolean DEFAULT false NOT NULL,
  "allowed_action_patterns" text[],
  "created_by_user_id" text,
  "updated_by_user_id" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "toolkit_policies_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "toolkit_policies_created_by_user_id_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "toolkit_policies_updated_by_user_id_user_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "toolkit_policies_org_toolkit_uidx"
  ON "toolkit_policies" USING btree ("org_id","toolkit_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "toolkit_policies_org_enabled_idx"
  ON "toolkit_policies" USING btree ("org_id","enabled");
