CREATE TYPE "public"."meeting_participation_mode" AS ENUM(
  'listen_only',
  'chat_enabled',
  'voice_enabled'
);

CREATE TABLE "meeting_copilot_settings" (
  "org_id" text PRIMARY KEY NOT NULL,
  "bot_display_name" text,
  "default_participation_mode" "meeting_participation_mode" DEFAULT 'chat_enabled' NOT NULL,
  "chat_responses_require_explicit_ask" boolean DEFAULT true NOT NULL,
  "voice_responses_require_explicit_prompt" boolean DEFAULT true NOT NULL,
  "allow_meeting_host_controls" boolean DEFAULT true NOT NULL,
  "consent_notice_enabled" boolean DEFAULT true NOT NULL,
  "transcript_retention_days" integer DEFAULT 30 NOT NULL,
  "artifact_retention_days" integer DEFAULT 180 NOT NULL,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_copilot_settings_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id")
    REFERENCES "public"."organizations"("id")
    ON DELETE cascade
    ON UPDATE no action,
  CONSTRAINT "meeting_copilot_settings_updated_by_user_id_fk"
    FOREIGN KEY ("updated_by")
    REFERENCES "public"."user"("id")
    ON DELETE set null
    ON UPDATE no action,
  CONSTRAINT "meeting_copilot_settings_transcript_retention_days_check"
    CHECK ("transcript_retention_days" > 0),
  CONSTRAINT "meeting_copilot_settings_artifact_retention_days_check"
    CHECK ("artifact_retention_days" > 0)
);

CREATE TABLE "meeting_session_controls" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "meeting_session_id" text NOT NULL,
  "participation_mode" "meeting_participation_mode" DEFAULT 'chat_enabled' NOT NULL,
  "allow_host_controls" boolean DEFAULT true NOT NULL,
  "live_responses_disabled" boolean DEFAULT false NOT NULL,
  "live_responses_disabled_reason" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_session_controls_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id")
    REFERENCES "public"."organizations"("id")
    ON DELETE cascade
    ON UPDATE no action,
  CONSTRAINT "meeting_session_controls_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id")
    REFERENCES "public"."meeting_sessions"("id")
    ON DELETE cascade
    ON UPDATE no action,
  CONSTRAINT "meeting_session_controls_updated_by_user_id_fk"
    FOREIGN KEY ("updated_by")
    REFERENCES "public"."user"("id")
    ON DELETE set null
    ON UPDATE no action
);

CREATE UNIQUE INDEX "meeting_session_controls_session_uidx"
  ON "meeting_session_controls" USING btree ("meeting_session_id");

CREATE INDEX "meeting_session_controls_org_session_idx"
  ON "meeting_session_controls" USING btree ("org_id", "meeting_session_id");
