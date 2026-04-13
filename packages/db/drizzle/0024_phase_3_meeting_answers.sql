-- Phase 3: meeting answers and answer audit trail

CREATE TYPE "meeting_answer_status" AS ENUM (
  'requested',
  'preparing',
  'grounded',
  'suppressed',
  'delivered_to_ui',
  'delivered_to_chat',
  'failed',
  'canceled',
  'stale'
);

CREATE TYPE "meeting_answer_event_type" AS ENUM (
  'requested',
  'generating',
  'grounded',
  'suppressed',
  'canceled',
  'delivering_to_ui',
  'delivered_to_ui',
  'delivering_to_chat',
  'delivered_to_chat',
  'failed',
  'stale'
);

CREATE TABLE IF NOT EXISTS "meeting_answers" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL REFERENCES "meeting_sessions"("id") ON DELETE CASCADE,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "requested_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "source" text NOT NULL DEFAULT 'ui',
  "question" text NOT NULL,
  "answer_text" text,
  "status" "meeting_answer_status" NOT NULL DEFAULT 'requested',
  "suppression_reason" text,
  "grounding_context" jsonb,
  "delivered_to_zoom_chat_at" timestamp,
  "canceled_at" timestamp,
  "stale_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "meeting_answer_events" (
  "id" text PRIMARY KEY NOT NULL,
  "answer_id" text NOT NULL REFERENCES "meeting_answers"("id") ON DELETE CASCADE,
  "meeting_session_id" text NOT NULL REFERENCES "meeting_sessions"("id") ON DELETE CASCADE,
  "event_type" "meeting_answer_event_type" NOT NULL,
  "metadata" jsonb,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "meeting_answers_session_idx" ON "meeting_answers" ("meeting_session_id");
CREATE INDEX IF NOT EXISTS "meeting_answers_org_idx" ON "meeting_answers" ("org_id");
CREATE INDEX IF NOT EXISTS "meeting_answers_session_status_idx" ON "meeting_answers" ("meeting_session_id", "status");
CREATE INDEX IF NOT EXISTS "meeting_answer_events_answer_idx" ON "meeting_answer_events" ("answer_id");
CREATE INDEX IF NOT EXISTS "meeting_answer_events_session_idx" ON "meeting_answer_events" ("meeting_session_id");
