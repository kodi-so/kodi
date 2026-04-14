-- Phase 4 follow-up: durable voice media storage for Recall audio delivery

CREATE TABLE IF NOT EXISTS "meeting_voice_media" (
  "id" text PRIMARY KEY NOT NULL,
  "answer_id" text NOT NULL REFERENCES "meeting_answers"("id") ON DELETE cascade,
  "meeting_session_id" text NOT NULL REFERENCES "meeting_sessions"("id") ON DELETE cascade,
  "token" text NOT NULL,
  "content_type" text NOT NULL,
  "audio_base64" text NOT NULL,
  "byte_length" integer NOT NULL,
  "access_count" integer NOT NULL DEFAULT 0,
  "first_accessed_at" timestamp,
  "last_accessed_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_voice_media_token_uidx"
  ON "meeting_voice_media" ("token");

CREATE INDEX IF NOT EXISTS "meeting_voice_media_answer_idx"
  ON "meeting_voice_media" ("answer_id");

CREATE INDEX IF NOT EXISTS "meeting_voice_media_session_idx"
  ON "meeting_voice_media" ("meeting_session_id");

CREATE INDEX IF NOT EXISTS "meeting_voice_media_expires_at_idx"
  ON "meeting_voice_media" ("expires_at");
