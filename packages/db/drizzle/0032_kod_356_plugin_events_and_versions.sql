-- KOD-356: Three tables backing the dual-communication protocol and the
-- plugin self-update system. Independent structures, landed together.

-- 1. plugin_event_subscriptions — per-instance subscription config
--    (which event kinds, what verbosity). Single jsonb blob so adding new
--    kinds doesn't require a migration.
CREATE TABLE IF NOT EXISTS "plugin_event_subscriptions" (
  "instance_id" text PRIMARY KEY NOT NULL REFERENCES "instances"("id") ON DELETE cascade,
  "protocol_version" text NOT NULL,
  "subscriptions" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 2. plugin_event_log — append-only log of every inbound event from any
--    instance. payload_json carries the envelope payload only (not the whole
--    envelope — envelope metadata is normalized into columns for indexability).
--    Dedupe via (instance_id, idempotency_key). Retention is M8.
CREATE TABLE IF NOT EXISTS "plugin_event_log" (
  "id" text PRIMARY KEY NOT NULL,
  "instance_id" text NOT NULL REFERENCES "instances"("id") ON DELETE cascade,
  "agent_id" text REFERENCES "openclaw_agents"("id") ON DELETE set null,
  "event_kind" text NOT NULL,
  "protocol_version" text,
  "payload_json" jsonb,
  "idempotency_key" text NOT NULL,
  "received_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "plugin_event_log_instance_idempotency_uidx"
  ON "plugin_event_log" ("instance_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "plugin_event_log_instance_idx"
  ON "plugin_event_log" ("instance_id");

CREATE INDEX IF NOT EXISTS "plugin_event_log_agent_idx"
  ON "plugin_event_log" ("agent_id");

CREATE INDEX IF NOT EXISTS "plugin_event_log_event_kind_idx"
  ON "plugin_event_log" ("event_kind");

CREATE INDEX IF NOT EXISTS "plugin_event_log_received_at_idx"
  ON "plugin_event_log" ("received_at");

-- 3. plugin_versions — bundle version registry. Each `kodi-bridge` release
--    lands here with its S3 object key + sha256 for integrity verification
--    by the self-update module (M6). Version scheme: YYYY-MM-DD-<sha>.
CREATE TABLE IF NOT EXISTS "plugin_versions" (
  "version" text PRIMARY KEY NOT NULL,
  "bundle_s3_key" text NOT NULL,
  "sha256" text NOT NULL,
  "released_at" timestamp DEFAULT now() NOT NULL,
  "notes" text
);
