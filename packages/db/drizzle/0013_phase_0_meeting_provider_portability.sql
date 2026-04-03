ALTER TABLE "meeting_sessions"
  ADD COLUMN IF NOT EXISTS "provider_meeting_instance_id" text;
--> statement-breakpoint
ALTER TABLE "meeting_sessions"
  ADD COLUMN IF NOT EXISTS "provider_bot_session_id" text;
--> statement-breakpoint

UPDATE "meeting_sessions"
SET
  "provider_meeting_instance_id" = COALESCE(
    "provider_meeting_instance_id",
    "provider_meeting_uuid",
    "metadata"->>'meeting_uuid'
  ),
  "provider_bot_session_id" = COALESCE(
    "provider_bot_session_id",
    "metadata"->>'session_id',
    "metadata"->>'rtms_stream_id'
  );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "meeting_sessions_provider_instance_idx"
  ON "meeting_sessions" USING btree ("provider","provider_meeting_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_sessions_provider_bot_session_idx"
  ON "meeting_sessions" USING btree ("provider_bot_session_id");
