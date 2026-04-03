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
--> statement-breakpoint

ALTER TABLE "meeting_state_snapshots"
  ADD COLUMN IF NOT EXISTS "rolling_notes" text;
--> statement-breakpoint
ALTER TABLE "meeting_state_snapshots"
  ADD COLUMN IF NOT EXISTS "candidate_tasks" jsonb;
--> statement-breakpoint
ALTER TABLE "meeting_state_snapshots"
  ADD COLUMN IF NOT EXISTS "draft_actions" jsonb;
--> statement-breakpoint
ALTER TABLE "meeting_state_snapshots"
  ADD COLUMN IF NOT EXISTS "last_processed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "meeting_state_snapshots"
  ADD COLUMN IF NOT EXISTS "last_classified_at" timestamp;
--> statement-breakpoint

UPDATE "meeting_state_snapshots"
SET
  "rolling_notes" = COALESCE("rolling_notes", "summary"),
  "candidate_tasks" = COALESCE("candidate_tasks", "candidate_action_items"),
  "last_processed_at" = COALESCE("last_processed_at", "created_at"),
  "last_classified_at" = COALESCE("last_classified_at", "created_at");
--> statement-breakpoint

DO $$ BEGIN
 ALTER TYPE "meeting_event_source" ADD VALUE IF NOT EXISTS 'recall_webhook';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TYPE "meeting_session_status" ADD VALUE IF NOT EXISTS 'preparing';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "meeting_session_status" ADD VALUE IF NOT EXISTS 'admitted';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "meeting_session_status" ADD VALUE IF NOT EXISTS 'listening';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "meeting_session_status" ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "meeting_session_status" ADD VALUE IF NOT EXISTS 'ended';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
