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
--> statement-breakpoint

UPDATE "meeting_sessions"
SET "status" = CASE
  WHEN "status" = 'live' THEN 'listening'::meeting_session_status
  WHEN "status" IN ('summarizing', 'awaiting_approval', 'executing') THEN 'processing'::meeting_session_status
  WHEN "status" = 'completed' THEN 'ended'::meeting_session_status
  ELSE "status"
END;
