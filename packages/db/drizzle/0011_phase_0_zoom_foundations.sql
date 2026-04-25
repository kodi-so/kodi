DO $$ BEGIN
 CREATE TYPE "conference_provider" AS ENUM('zoom', 'google_meet', 'slack');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "provider_installation_status" AS ENUM('pending', 'active', 'revoked', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "meeting_session_status" AS ENUM('scheduled', 'joining', 'live', 'summarizing', 'awaiting_approval', 'executing', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "meeting_event_source" AS ENUM('zoom_webhook', 'rtms', 'kodi_ui', 'agent', 'worker');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "meeting_artifact_type" AS ENUM('summary', 'decision_log', 'goals', 'action_items', 'draft_ticket_batch', 'execution_plan');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "work_item_kind" AS ENUM('goal', 'outcome', 'task', 'ticket', 'follow_up');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "work_item_status" AS ENUM('draft', 'approved', 'synced', 'executing', 'done', 'cancelled', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "tool_provider" AS ENUM('linear', 'github', 'slack', 'jira', 'notion', 'zoom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "tool_connection_status" AS ENUM('pending', 'active', 'error', 'revoked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "tool_action_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "approval_request_status" AS ENUM('pending', 'approved', 'rejected', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_installations" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "provider" "conference_provider" NOT NULL,
  "installer_user_id" text,
  "external_account_id" text,
  "external_account_email" text,
  "status" "provider_installation_status" DEFAULT 'pending' NOT NULL,
  "access_token_encrypted" text,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamp,
  "scopes" text[],
  "metadata" jsonb,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "provider_installations_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "provider_installations_installer_user_id_user_id_fk"
    FOREIGN KEY ("installer_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_installations_org_provider_uidx"
  ON "provider_installations" USING btree ("org_id","provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_installations_org_status_idx"
  ON "provider_installations" USING btree ("org_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_installations_external_account_idx"
  ON "provider_installations" USING btree ("external_account_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "provider" "conference_provider" NOT NULL,
  "provider_installation_id" text,
  "provider_meeting_id" text,
  "provider_meeting_uuid" text,
  "host_user_id" text,
  "title" text,
  "agenda" text,
  "language" text,
  "status" "meeting_session_status" DEFAULT 'scheduled' NOT NULL,
  "consent_state" text,
  "live_summary" text,
  "final_summary" text,
  "scheduled_start_at" timestamp,
  "actual_start_at" timestamp,
  "ended_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_sessions_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "meeting_sessions_provider_installation_id_provider_installations_id_fk"
    FOREIGN KEY ("provider_installation_id") REFERENCES "provider_installations"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "meeting_sessions_host_user_id_user_id_fk"
    FOREIGN KEY ("host_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_sessions_org_status_idx"
  ON "meeting_sessions" USING btree ("org_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_sessions_org_created_idx"
  ON "meeting_sessions" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_sessions_provider_meeting_idx"
  ON "meeting_sessions" USING btree ("provider","provider_meeting_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_participants" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL,
  "provider_participant_id" text,
  "display_name" text,
  "email" text,
  "joined_at" timestamp,
  "left_at" timestamp,
  "is_host" boolean DEFAULT false NOT NULL,
  "is_internal" boolean,
  "user_id" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_participants_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "meeting_participants_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_participants_session_idx"
  ON "meeting_participants" USING btree ("meeting_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_participants_user_idx"
  ON "meeting_participants" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_events" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "event_type" text NOT NULL,
  "source" "meeting_event_source" NOT NULL,
  "payload" jsonb,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_events_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_events_session_sequence_idx"
  ON "meeting_events" USING btree ("meeting_session_id","sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_events_session_type_idx"
  ON "meeting_events" USING btree ("meeting_session_id","event_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "transcript_segments" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL,
  "event_id" text,
  "speaker_participant_id" text,
  "speaker_name" text,
  "content" text NOT NULL,
  "start_offset_ms" integer,
  "end_offset_ms" integer,
  "confidence" real,
  "is_partial" boolean DEFAULT false NOT NULL,
  "source" "meeting_event_source" DEFAULT 'rtms' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "transcript_segments_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "transcript_segments_event_id_meeting_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "meeting_events"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "transcript_segments_speaker_participant_id_meeting_participants_id_fk"
    FOREIGN KEY ("speaker_participant_id") REFERENCES "meeting_participants"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcript_segments_session_created_idx"
  ON "transcript_segments" USING btree ("meeting_session_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcript_segments_speaker_idx"
  ON "transcript_segments" USING btree ("speaker_participant_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_state_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL,
  "summary" text,
  "active_topics" jsonb,
  "decisions" jsonb,
  "open_questions" jsonb,
  "risks" jsonb,
  "candidate_action_items" jsonb,
  "last_event_sequence" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_state_snapshots_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_state_snapshots_session_created_idx"
  ON "meeting_state_snapshots" USING btree ("meeting_session_id","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text NOT NULL,
  "artifact_type" "meeting_artifact_type" NOT NULL,
  "title" text,
  "content" text,
  "structured_data" jsonb,
  "status" text DEFAULT 'generated' NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_artifacts_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_artifacts_session_type_idx"
  ON "meeting_artifacts" USING btree ("meeting_session_id","artifact_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_items" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "meeting_session_id" text,
  "source_artifact_id" text,
  "kind" "work_item_kind" NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "owner_user_id" text,
  "status" "work_item_status" DEFAULT 'draft' NOT NULL,
  "priority" text,
  "due_at" timestamp,
  "external_system" text,
  "external_id" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "work_items_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "work_items_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "work_items_owner_user_id_user_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_org_status_idx"
  ON "work_items" USING btree ("org_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_org_created_idx"
  ON "work_items" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_meeting_session_idx"
  ON "work_items" USING btree ("meeting_session_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tool_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "tool" "tool_provider" NOT NULL,
  "status" "tool_connection_status" DEFAULT 'pending' NOT NULL,
  "connected_by_user_id" text,
  "external_account_id" text,
  "display_name" text,
  "credentials_ciphertext" text,
  "scopes" text[],
  "metadata" jsonb,
  "last_validated_at" timestamp,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tool_connections_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tool_connections_connected_by_user_id_user_id_fk"
    FOREIGN KEY ("connected_by_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connections_org_tool_idx"
  ON "tool_connections" USING btree ("org_id","tool");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connections_org_status_idx"
  ON "tool_connections" USING btree ("org_id","status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tool_action_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "meeting_session_id" text,
  "work_item_id" text,
  "tool_connection_id" text,
  "tool" "tool_provider" NOT NULL,
  "action" text NOT NULL,
  "status" "tool_action_run_status" DEFAULT 'pending' NOT NULL,
  "request_payload" jsonb,
  "response_payload" jsonb,
  "error" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tool_action_runs_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tool_action_runs_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "tool_action_runs_work_item_id_work_items_id_fk"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "tool_action_runs_tool_connection_id_tool_connections_id_fk"
    FOREIGN KEY ("tool_connection_id") REFERENCES "tool_connections"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_action_runs_org_status_idx"
  ON "tool_action_runs" USING btree ("org_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_action_runs_work_item_idx"
  ON "tool_action_runs" USING btree ("work_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_action_runs_meeting_session_idx"
  ON "tool_action_runs" USING btree ("meeting_session_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "meeting_session_id" text,
  "requested_by_user_id" text,
  "approval_type" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "status" "approval_request_status" DEFAULT 'pending' NOT NULL,
  "preview_payload" jsonb,
  "decided_by_user_id" text,
  "decided_at" timestamp,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "approval_requests_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "approval_requests_meeting_session_id_meeting_sessions_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_sessions"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "approval_requests_requested_by_user_id_user_id_fk"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "approval_requests_decided_by_user_id_user_id_fk"
    FOREIGN KEY ("decided_by_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_org_status_idx"
  ON "approval_requests" USING btree ("org_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_meeting_session_idx"
  ON "approval_requests" USING btree ("meeting_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_subject_idx"
  ON "approval_requests" USING btree ("subject_type","subject_id");
