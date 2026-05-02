CREATE TYPE "meeting_session_provider" AS ENUM ('zoom', 'google_meet', 'local');
--> statement-breakpoint
CREATE TYPE "local_meeting_mode" AS ENUM ('solo', 'room');
--> statement-breakpoint
CREATE TYPE "local_meeting_permission_state" AS ENUM ('unknown', 'prompt', 'granted', 'denied');
--> statement-breakpoint
CREATE TYPE "local_meeting_capture_state" AS ENUM ('ready', 'capturing', 'paused', 'reconnecting', 'failed', 'ended');
--> statement-breakpoint
CREATE TYPE "local_meeting_transcription_state" AS ENUM ('not_started', 'connecting', 'transcribing', 'degraded', 'failed', 'ended');
--> statement-breakpoint

ALTER TABLE "meeting_sessions"
  ALTER COLUMN "provider" TYPE "meeting_session_provider"
  USING "provider"::text::"meeting_session_provider";
--> statement-breakpoint

CREATE TABLE "local_meeting_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "meeting_session_id" text NOT NULL,
  "started_by_user_id" text,
  "mode" "local_meeting_mode" NOT NULL,
  "permission_state" "local_meeting_permission_state" DEFAULT 'unknown' NOT NULL,
  "capture_state" "local_meeting_capture_state" DEFAULT 'ready' NOT NULL,
  "transcription_state" "local_meeting_transcription_state" DEFAULT 'not_started' NOT NULL,
  "input_device_id" text,
  "input_device_label" text,
  "output_device_id" text,
  "output_device_label" text,
  "browser_family" text,
  "browser_version" text,
  "platform" text,
  "ingest_token_hash" text NOT NULL,
  "ingest_token_expires_at" timestamp NOT NULL,
  "ingest_token_revoked_at" timestamp,
  "last_sequence" integer DEFAULT 0 NOT NULL,
  "last_heartbeat_at" timestamp,
  "last_audio_chunk_at" timestamp,
  "last_transcript_at" timestamp,
  "paused_at" timestamp,
  "resumed_at" timestamp,
  "ended_at" timestamp,
  "failure_reason" text,
  "diagnostics" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_meeting_sessions" ADD CONSTRAINT "local_meeting_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "local_meeting_sessions" ADD CONSTRAINT "local_meeting_sessions_meeting_session_id_meeting_sessions_id_fk" FOREIGN KEY ("meeting_session_id") REFERENCES "public"."meeting_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "local_meeting_sessions" ADD CONSTRAINT "local_meeting_sessions_started_by_user_id_user_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "local_meeting_sessions_meeting_session_uidx" ON "local_meeting_sessions" USING btree ("meeting_session_id");
--> statement-breakpoint
CREATE INDEX "local_meeting_sessions_org_capture_idx" ON "local_meeting_sessions" USING btree ("org_id","capture_state");
--> statement-breakpoint
CREATE UNIQUE INDEX "local_meeting_sessions_token_hash_uidx" ON "local_meeting_sessions" USING btree ("ingest_token_hash");
--> statement-breakpoint
CREATE INDEX "local_meeting_sessions_heartbeat_idx" ON "local_meeting_sessions" USING btree ("last_heartbeat_at");
