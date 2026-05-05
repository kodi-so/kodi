CREATE TYPE "task_workflow_state_type" AS ENUM ('backlog', 'started', 'blocked', 'completed', 'canceled');
--> statement-breakpoint
CREATE TYPE "task_review_state" AS ENUM ('not_required', 'needs_review', 'approved', 'rejected');
--> statement-breakpoint
CREATE TYPE "task_execution_state" AS ENUM ('idle', 'queued', 'awaiting_approval', 'running', 'succeeded', 'failed');
--> statement-breakpoint
CREATE TYPE "task_sync_state" AS ENUM ('local', 'queued', 'syncing', 'healthy', 'stale', 'blocked', 'error');
--> statement-breakpoint
CREATE TYPE "task_assignee_type" AS ENUM ('user', 'kodi', 'agent', 'unassigned');
--> statement-breakpoint
CREATE TYPE "task_actor_type" AS ENUM ('user', 'kodi', 'system');
--> statement-breakpoint
CREATE TYPE "task_source_type" AS ENUM ('meeting', 'manual', 'chat', 'import', 'agent');
--> statement-breakpoint
CREATE TYPE "task_activity_type" AS ENUM ('created', 'edited', 'moved', 'assigned', 'approved', 'rejected', 'linked', 'unlinked', 'sync_succeeded', 'sync_failed', 'completed', 'reopened', 'execution_started', 'execution_finished', 'execution_failed');
--> statement-breakpoint

CREATE TABLE "openclaw_agents" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_workflow_states" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "type" "task_workflow_state_type" NOT NULL,
  "sort_order" integer NOT NULL,
  "color" text,
  "is_default" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "work_item_id" text NOT NULL,
  "event_type" "task_activity_type" NOT NULL,
  "actor_type" "task_actor_type" NOT NULL,
  "actor_user_id" text,
  "actor_agent_id" text,
  "summary" text,
  "from_value" jsonb,
  "to_value" jsonb,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "openclaw_agents" ADD CONSTRAINT "openclaw_agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_workflow_states" ADD CONSTRAINT "task_workflow_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_agent_id_openclaw_agents_id_fk" FOREIGN KEY ("actor_agent_id") REFERENCES "public"."openclaw_agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "work_items" ADD COLUMN "workflow_state_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_state" "task_review_state" DEFAULT 'needs_review' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "execution_state" "task_execution_state" DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "sync_state" "task_sync_state" DEFAULT 'local' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "assignee_type" "task_assignee_type" DEFAULT 'kodi' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "assignee_user_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "assignee_agent_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "completed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "completed_by_type" "task_actor_type";
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "completed_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "completed_by_agent_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "source_type" "task_source_type" DEFAULT 'meeting' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "linked_external_system" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "linked_external_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "linked_external_url" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "linked_connected_account_id" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "last_synced_at" timestamp;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "last_sync_error" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "external_snapshot" jsonb;
--> statement-breakpoint

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workflow_state_id_task_workflow_states_id_fk" FOREIGN KEY ("workflow_state_id") REFERENCES "public"."task_workflow_states"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_agent_id_openclaw_agents_id_fk" FOREIGN KEY ("assignee_agent_id") REFERENCES "public"."openclaw_agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_completed_by_agent_id_openclaw_agents_id_fk" FOREIGN KEY ("completed_by_agent_id") REFERENCES "public"."openclaw_agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "openclaw_agents_org_slug_uidx" ON "openclaw_agents" USING btree ("org_id","slug");
--> statement-breakpoint
CREATE INDEX "openclaw_agents_org_default_idx" ON "openclaw_agents" USING btree ("org_id","is_default");
--> statement-breakpoint
CREATE UNIQUE INDEX "task_workflow_states_org_slug_uidx" ON "task_workflow_states" USING btree ("org_id","slug");
--> statement-breakpoint
CREATE INDEX "task_workflow_states_org_order_idx" ON "task_workflow_states" USING btree ("org_id","sort_order");
--> statement-breakpoint
CREATE INDEX "task_workflow_states_org_type_idx" ON "task_workflow_states" USING btree ("org_id","type");
--> statement-breakpoint
CREATE INDEX "work_items_org_workflow_idx" ON "work_items" USING btree ("org_id","workflow_state_id");
--> statement-breakpoint
CREATE INDEX "work_items_org_assignee_idx" ON "work_items" USING btree ("org_id","assignee_type","assignee_user_id","assignee_agent_id");
--> statement-breakpoint
CREATE INDEX "work_items_org_completion_idx" ON "work_items" USING btree ("org_id","completed_at");
--> statement-breakpoint
CREATE INDEX "work_items_org_sync_idx" ON "work_items" USING btree ("org_id","sync_state","last_synced_at");
--> statement-breakpoint
CREATE INDEX "task_activities_task_created_idx" ON "task_activities" USING btree ("work_item_id","created_at");
--> statement-breakpoint
CREATE INDEX "task_activities_org_created_idx" ON "task_activities" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX "task_activities_org_event_idx" ON "task_activities" USING btree ("org_id","event_type");
--> statement-breakpoint

INSERT INTO "openclaw_agents" ("id", "org_id", "slug", "display_name", "description", "is_default", "metadata")
SELECT 'kodi-agent-' || "id", "id", 'kodi', 'Kodi', 'Default Kodi workspace agent for task assignment.', true, '{"source":"task-board-migration"}'::jsonb
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint

INSERT INTO "task_workflow_states" ("id", "org_id", "slug", "name", "type", "sort_order", "color")
SELECT 'task-state-needs-review-' || "id", "id", 'needs-review', 'Needs review', 'backlog', 10, 'amber'
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "task_workflow_states" ("id", "org_id", "slug", "name", "type", "sort_order", "color")
SELECT 'task-state-todo-' || "id", "id", 'todo', 'Todo', 'backlog', 20, 'zinc'
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "task_workflow_states" ("id", "org_id", "slug", "name", "type", "sort_order", "color")
SELECT 'task-state-in-progress-' || "id", "id", 'in-progress', 'In progress', 'started', 30, 'blue'
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "task_workflow_states" ("id", "org_id", "slug", "name", "type", "sort_order", "color")
SELECT 'task-state-blocked-' || "id", "id", 'blocked', 'Blocked', 'blocked', 40, 'red'
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "task_workflow_states" ("id", "org_id", "slug", "name", "type", "sort_order", "color")
SELECT 'task-state-done-' || "id", "id", 'done', 'Done', 'completed', 50, 'green'
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "task_workflow_states" ("id", "org_id", "slug", "name", "type", "sort_order", "color")
SELECT 'task-state-canceled-' || "id", "id", 'canceled', 'Canceled', 'canceled', 60, 'zinc'
FROM "organizations"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint

UPDATE "work_items"
SET
  "workflow_state_id" = (
    SELECT "task_workflow_states"."id"
    FROM "task_workflow_states"
    WHERE "task_workflow_states"."org_id" = "work_items"."org_id"
      AND "task_workflow_states"."slug" = CASE
        WHEN "work_items"."status" = 'draft' THEN 'needs-review'
        WHEN "work_items"."status" = 'approved' THEN 'todo'
        WHEN "work_items"."status" = 'synced' THEN 'todo'
        WHEN "work_items"."status" = 'executing' THEN 'in-progress'
        WHEN "work_items"."status" = 'done' THEN 'done'
        WHEN "work_items"."status" = 'cancelled' THEN 'canceled'
        WHEN "work_items"."status" = 'failed' THEN 'blocked'
        ELSE 'todo'
      END
    LIMIT 1
  ),
  "review_state" = CASE
    WHEN "status" = 'draft' THEN 'needs_review'::"task_review_state"
    WHEN "status" = 'cancelled' THEN 'rejected'::"task_review_state"
    ELSE 'approved'::"task_review_state"
  END,
  "execution_state" = CASE
    WHEN "status" = 'executing' THEN 'running'::"task_execution_state"
    WHEN "status" = 'failed' THEN 'failed'::"task_execution_state"
    WHEN "status" = 'done' THEN 'succeeded'::"task_execution_state"
    ELSE 'idle'::"task_execution_state"
  END,
  "sync_state" = CASE
    WHEN "external_system" IS NOT NULL OR "external_id" IS NOT NULL THEN 'healthy'::"task_sync_state"
    ELSE 'local'::"task_sync_state"
  END,
  "assignee_type" = CASE
    WHEN "owner_user_id" IS NOT NULL THEN 'user'::"task_assignee_type"
    ELSE 'kodi'::"task_assignee_type"
  END,
  "assignee_user_id" = "owner_user_id",
  "assignee_agent_id" = (
    SELECT "openclaw_agents"."id"
    FROM "openclaw_agents"
    WHERE "openclaw_agents"."org_id" = "work_items"."org_id"
      AND "openclaw_agents"."slug" = 'kodi'
    LIMIT 1
  ),
  "completed_at" = CASE WHEN "status" = 'done' THEN "updated_at" ELSE NULL END,
  "completed_by_type" = CASE WHEN "status" = 'done' THEN 'system'::"task_actor_type" ELSE NULL END,
  "source_type" = CASE WHEN "meeting_session_id" IS NOT NULL THEN 'meeting'::"task_source_type" ELSE 'manual'::"task_source_type" END,
  "source_id" = COALESCE("meeting_session_id", "source_artifact_id"),
  "linked_external_system" = "external_system",
  "linked_external_id" = "external_id",
  "linked_external_url" = COALESCE("metadata"->>'externalUrl', "metadata"->>'external_url'),
  "last_synced_at" = CASE WHEN "external_system" IS NOT NULL OR "external_id" IS NOT NULL THEN "updated_at" ELSE NULL END,
  "external_snapshot" = CASE
    WHEN "external_system" IS NOT NULL OR "external_id" IS NOT NULL THEN jsonb_build_object('system', "external_system", 'id', "external_id", 'url', COALESCE("metadata"->>'externalUrl', "metadata"->>'external_url'))
    ELSE NULL
  END;
--> statement-breakpoint

INSERT INTO "task_activities" ("id", "org_id", "work_item_id", "event_type", "actor_type", "summary", "metadata", "created_at")
SELECT 'task-activity-created-' || "id", "org_id", "id", 'created', 'system', 'Task backfilled into the board model.', jsonb_build_object('legacyStatus', "status"), "created_at"
FROM "work_items"
ON CONFLICT ("id") DO NOTHING;
