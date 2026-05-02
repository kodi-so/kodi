-- KOD-354: extend the existing `openclaw_agents` table (created in
-- 0031_task_board_foundation, evolved in 0035_openclaw_agent_registry_schema)
-- with the Composio runtime fields the kodi-bridge plugin needs to track each
-- agent's persistent Composio session.
--
-- These columns were originally proposed as a separate `openclaw_agents` table
-- on the openclaw-bridge feature branch. After dev shipped its own
-- `openclaw_agents` table for the task board, we unified the two: dev's table
-- is the canonical agent identity (org/member, slug, status), this migration
-- adds the per-agent Composio runtime state on top.

ALTER TABLE "openclaw_agents"
  ADD COLUMN "composio_user_id" text;

ALTER TABLE "openclaw_agents"
  ADD COLUMN "composio_session_enc" jsonb;

ALTER TABLE "openclaw_agents"
  ADD COLUMN "composio_status" text NOT NULL DEFAULT 'pending';
