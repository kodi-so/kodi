CREATE TYPE "calendar_provider" AS ENUM ('google_calendar', 'outlook_calendar');
--> statement-breakpoint
CREATE TYPE "calendar_response_status" AS ENUM ('accepted', 'tentative', 'declined', 'needs_action', 'unknown');
--> statement-breakpoint
CREATE TYPE "desktop_update_channel" AS ENUM ('internal', 'beta', 'stable');
--> statement-breakpoint
CREATE TYPE "desktop_platform" AS ENUM ('darwin', 'win32', 'linux', 'unknown');
--> statement-breakpoint
CREATE TABLE "desktop_auth_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "device_id" text NOT NULL,
  "code_hash" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "consumed_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desktop_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "device_id" text NOT NULL,
  "access_token_hash" text NOT NULL,
  "refresh_token_hash" text NOT NULL,
  "access_token_expires_at" timestamp NOT NULL,
  "refresh_token_expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desktop_devices" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "platform" "desktop_platform" DEFAULT 'unknown' NOT NULL,
  "app_version" text,
  "update_channel" "desktop_update_channel" DEFAULT 'internal' NOT NULL,
  "device_name" text,
  "last_heartbeat_at" timestamp,
  "active_meeting_session_id" text,
  "diagnostics" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desktop_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "reminders_enabled" boolean DEFAULT true NOT NULL,
  "reminder_lead_time_minutes" integer DEFAULT 1 NOT NULL,
  "move_aside_enabled" boolean DEFAULT true NOT NULL,
  "launch_at_login" boolean DEFAULT false NOT NULL,
  "default_local_session_mode" text DEFAULT 'solo' NOT NULL,
  "update_channel" "desktop_update_channel" DEFAULT 'internal' NOT NULL,
  "active_calendar_connection_ids" text[],
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_candidates" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text NOT NULL,
  "calendar_provider" "calendar_provider" NOT NULL,
  "connected_account_id" text NOT NULL,
  "external_event_id" text NOT NULL,
  "ical_uid" text,
  "title" text NOT NULL,
  "description" text,
  "location" text,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp,
  "response_status" "calendar_response_status" DEFAULT 'unknown' NOT NULL,
  "attendees" jsonb,
  "join_url" text,
  "conference_provider" "conference_provider",
  "external_meeting_id" text,
  "is_canceled" boolean DEFAULT false NOT NULL,
  "is_likely_meeting" boolean DEFAULT true NOT NULL,
  "duplicate_group_key" text,
  "meeting_session_id" text,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desktop_auth_codes" ADD CONSTRAINT "desktop_auth_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_auth_codes" ADD CONSTRAINT "desktop_auth_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD CONSTRAINT "desktop_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD CONSTRAINT "desktop_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_active_meeting_session_id_meeting_sessions_id_fk" FOREIGN KEY ("active_meeting_session_id") REFERENCES "public"."meeting_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_preferences" ADD CONSTRAINT "desktop_preferences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_preferences" ADD CONSTRAINT "desktop_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_event_candidates" ADD CONSTRAINT "calendar_event_candidates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_event_candidates" ADD CONSTRAINT "calendar_event_candidates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_event_candidates" ADD CONSTRAINT "calendar_event_candidates_meeting_session_id_meeting_sessions_id_fk" FOREIGN KEY ("meeting_session_id") REFERENCES "public"."meeting_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_auth_codes_hash_uidx" ON "desktop_auth_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "desktop_auth_codes_org_user_idx" ON "desktop_auth_codes" USING btree ("org_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_sessions_access_token_uidx" ON "desktop_sessions" USING btree ("access_token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_sessions_refresh_token_uidx" ON "desktop_sessions" USING btree ("refresh_token_hash");
--> statement-breakpoint
CREATE INDEX "desktop_sessions_org_user_device_idx" ON "desktop_sessions" USING btree ("org_id","user_id","device_id");
--> statement-breakpoint
CREATE INDEX "desktop_devices_org_user_idx" ON "desktop_devices" USING btree ("org_id","user_id");
--> statement-breakpoint
CREATE INDEX "desktop_devices_heartbeat_idx" ON "desktop_devices" USING btree ("last_heartbeat_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_preferences_org_user_uidx" ON "desktop_preferences" USING btree ("org_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_candidates_source_uidx" ON "calendar_event_candidates" USING btree ("org_id","user_id","calendar_provider","connected_account_id","external_event_id");
--> statement-breakpoint
CREATE INDEX "calendar_event_candidates_org_user_start_idx" ON "calendar_event_candidates" USING btree ("org_id","user_id","starts_at");
--> statement-breakpoint
CREATE INDEX "calendar_event_candidates_session_idx" ON "calendar_event_candidates" USING btree ("meeting_session_id");
--> statement-breakpoint
CREATE INDEX "calendar_event_candidates_duplicate_idx" ON "calendar_event_candidates" USING btree ("org_id","user_id","duplicate_group_key");
