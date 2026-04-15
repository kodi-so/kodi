-- Phase 4: voice output status, event types, and timestamp columns

ALTER TYPE "meeting_answer_status" ADD VALUE IF NOT EXISTS 'speaking';
ALTER TYPE "meeting_answer_status" ADD VALUE IF NOT EXISTS 'delivered_to_voice';

ALTER TYPE "meeting_answer_event_type" ADD VALUE IF NOT EXISTS 'delivering_to_voice';
ALTER TYPE "meeting_answer_event_type" ADD VALUE IF NOT EXISTS 'delivered_to_voice';
ALTER TYPE "meeting_answer_event_type" ADD VALUE IF NOT EXISTS 'interrupted';

ALTER TABLE "meeting_answers"
  ADD COLUMN IF NOT EXISTS "delivered_to_voice_at" timestamp,
  ADD COLUMN IF NOT EXISTS "interrupted_at" timestamp;
