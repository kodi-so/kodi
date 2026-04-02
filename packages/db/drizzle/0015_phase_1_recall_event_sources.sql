DO $$ BEGIN
 ALTER TYPE "meeting_event_source" ADD VALUE IF NOT EXISTS 'recall_webhook';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
