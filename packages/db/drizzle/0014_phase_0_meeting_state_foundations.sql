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
