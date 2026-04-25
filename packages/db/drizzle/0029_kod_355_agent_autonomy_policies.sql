-- KOD-355: agent_autonomy_policies — per-agent autonomy customization
--
-- Missing rows mean "use defaults" (`{ autonomy_level: 'normal', overrides: null }`).
-- Default lives in application code (see apps/api/src/lib/autonomy.ts), not
-- in a DB trigger, so absent rows are an explicit "untouched" signal.
--
-- Levels (validated app-side via zod):
--   strict  — every tool call requires approval
--   normal  — reads auto, writes/admin require approval (default)
--   lenient — most things auto, only admin requires approval
--   yolo    — everything auto-allowed, still audited
--
-- overrides is jsonb: { "<glob-or-tool-name>": "allow" | "ask" | "deny", ... }

CREATE TABLE IF NOT EXISTS "agent_autonomy_policies" (
  "agent_id" text PRIMARY KEY NOT NULL REFERENCES "openclaw_agents"("id") ON DELETE cascade,
  "autonomy_level" text NOT NULL DEFAULT 'normal',
  "overrides" jsonb,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE set null,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
