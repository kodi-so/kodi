CREATE TABLE IF NOT EXISTS "toolkit_account_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "toolkit_slug" text NOT NULL,
  "preferred_connected_account_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "toolkit_account_preferences_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "toolkit_account_preferences_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "toolkit_account_preferences_org_user_toolkit_uidx"
  ON "toolkit_account_preferences" USING btree ("org_id","user_id","toolkit_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "toolkit_account_preferences_org_user_account_idx"
  ON "toolkit_account_preferences" USING btree ("org_id","user_id","preferred_connected_account_id");
