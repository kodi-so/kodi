DROP INDEX IF EXISTS "tool_session_runs_composio_session_id_uidx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_session_runs_composio_session_id_idx"
  ON "tool_session_runs" USING btree ("composio_session_id");
