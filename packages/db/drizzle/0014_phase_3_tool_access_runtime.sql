DO $$
BEGIN
  CREATE TYPE "tool_session_source_type" AS ENUM ('chat', 'meeting', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "tool_action_category" AS ENUM ('read', 'draft', 'write', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tool_session_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "composio_session_id" text NOT NULL,
  "source_type" "tool_session_source_type" NOT NULL,
  "source_id" text,
  "enabled_toolkits" text[] NOT NULL,
  "connected_account_overrides" jsonb,
  "manage_connections_in_chat" boolean DEFAULT false NOT NULL,
  "workbench_enabled" boolean DEFAULT false NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expired_at" timestamp,
  CONSTRAINT "tool_session_runs_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tool_session_runs_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_session_runs_composio_session_id_uidx"
  ON "tool_session_runs" USING btree ("composio_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_session_runs_org_user_created_idx"
  ON "tool_session_runs" USING btree ("org_id","user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_session_runs_source_idx"
  ON "tool_session_runs" USING btree ("source_type","source_id");
--> statement-breakpoint

ALTER TABLE "tool_action_runs"
  ALTER COLUMN "tool" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "actor_user_id" text;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "approval_request_id" text;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "toolkit_slug" text;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "connected_account_id" text;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "tool_session_run_id" text;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "action_category" "tool_action_category";
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint

ALTER TABLE "tool_action_runs"
  ADD CONSTRAINT "tool_action_runs_actor_user_id_user_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD CONSTRAINT "tool_action_runs_approval_request_id_approval_requests_id_fk"
    FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tool_action_runs"
  ADD CONSTRAINT "tool_action_runs_tool_session_run_id_tool_session_runs_id_fk"
    FOREIGN KEY ("tool_session_run_id") REFERENCES "tool_session_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tool_action_runs_actor_user_idx"
  ON "tool_action_runs" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_action_runs_approval_request_idx"
  ON "tool_action_runs" USING btree ("approval_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_action_runs_toolkit_slug_idx"
  ON "tool_action_runs" USING btree ("toolkit_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_action_runs_tool_session_run_idx"
  ON "tool_action_runs" USING btree ("tool_session_run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_action_runs_org_idempotency_uidx"
  ON "tool_action_runs" USING btree ("org_id","idempotency_key");
