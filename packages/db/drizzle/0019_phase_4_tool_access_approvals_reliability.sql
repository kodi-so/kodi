ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "tool_session_run_id" text;

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "source_type" "tool_session_source_type";

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "source_id" text;

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "toolkit_slug" text;

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "connected_account_id" text;

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "action" text;

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "action_category" text;

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "request_payload" jsonb;

ALTER TABLE "approval_requests"
  ADD CONSTRAINT "approval_requests_tool_session_run_id_tool_session_runs_id_fk"
    FOREIGN KEY ("tool_session_run_id") REFERENCES "tool_session_runs"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "approval_requests_tool_session_idx"
  ON "approval_requests" USING btree ("tool_session_run_id");

CREATE INDEX IF NOT EXISTS "approval_requests_source_idx"
  ON "approval_requests" USING btree ("source_type","source_id");

CREATE INDEX IF NOT EXISTS "approval_requests_toolkit_idx"
  ON "approval_requests" USING btree ("toolkit_slug");

CREATE INDEX IF NOT EXISTS "approval_requests_connected_account_idx"
  ON "approval_requests" USING btree ("connected_account_id");

ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "source_type" "tool_session_source_type";

ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "source_id" text;

ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "target_text" text;

ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;

ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "transition_history" jsonb;

ALTER TABLE "tool_action_runs"
  ADD COLUMN IF NOT EXISTS "external_log_id" text;

CREATE INDEX IF NOT EXISTS "tool_action_runs_source_idx"
  ON "tool_action_runs" USING btree ("source_type","source_id");
