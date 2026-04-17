CREATE TYPE "public"."meeting_adapter_health_status" AS ENUM('healthy', 'degraded', 'down');

ALTER TABLE "meeting_events" ADD COLUMN "dedupe_key" text;

CREATE TABLE "meeting_session_health" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL,
  "provider" "conference_provider" NOT NULL,
  "status" "meeting_adapter_health_status" NOT NULL,
  "lifecycle_state" text,
  "detail" text,
  "metadata" jsonb,
  "observed_at" timestamp NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "meeting_session_health"
  ADD CONSTRAINT "meeting_session_health_meeting_session_id_meeting_sessions_id_fk"
  FOREIGN KEY ("meeting_session_id")
  REFERENCES "public"."meeting_sessions"("id")
  ON DELETE cascade
  ON UPDATE no action;

CREATE UNIQUE INDEX "meeting_events_session_dedupe_uidx"
  ON "meeting_events" USING btree ("meeting_session_id","dedupe_key");

CREATE UNIQUE INDEX "meeting_session_health_session_uidx"
  ON "meeting_session_health" USING btree ("meeting_session_id");

CREATE INDEX "meeting_session_health_session_observed_idx"
  ON "meeting_session_health" USING btree ("meeting_session_id","observed_at");
