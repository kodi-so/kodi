-- KOD-354: openclaw_agents table — per-(instance, user) agent registry
--
-- Source of truth for reconciliation between Kodi and each instance's
-- kodi-bridge plugin. Each row represents one OpenClaw agent created inside
-- one org's instance. Rows with user_id = NULL are org-level agents.

CREATE TABLE IF NOT EXISTS "openclaw_agents" (
  "id" text PRIMARY KEY NOT NULL,
  "instance_id" text NOT NULL REFERENCES "instances"("id") ON DELETE cascade,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "user_id" text REFERENCES "user"("id") ON DELETE cascade,
  "openclaw_agent_id" text NOT NULL,
  "composio_user_id" text,
  "composio_session_enc" jsonb,
  "composio_status" text NOT NULL DEFAULT 'pending',
  "status" text NOT NULL DEFAULT 'provisioning',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Partial unique index: at most one agent row per (instance, user) when
-- user_id is non-null. Allows multiple NULL user_id rows (e.g., org agents)
-- without collision.
CREATE UNIQUE INDEX IF NOT EXISTS "openclaw_agents_instance_user_uidx"
  ON "openclaw_agents" ("instance_id", "user_id")
  WHERE "user_id" IS NOT NULL;

-- Unique within an instance: each openclaw_agent_id appears once per instance.
CREATE UNIQUE INDEX IF NOT EXISTS "openclaw_agents_instance_agentid_uidx"
  ON "openclaw_agents" ("instance_id", "openclaw_agent_id");

-- Per-org status scans (e.g. listing active agents in an org).
CREATE INDEX IF NOT EXISTS "openclaw_agents_org_status_idx"
  ON "openclaw_agents" ("org_id", "status");

-- Per-instance scans for plugin reconciliation.
CREATE INDEX IF NOT EXISTS "openclaw_agents_instance_idx"
  ON "openclaw_agents" ("instance_id");
