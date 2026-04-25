-- KOD-353: Add kodi-bridge plugin columns to instances table
--
-- Adds the four columns the kodi-bridge OpenClaw plugin needs to track itself
-- against each per-org instance:
--   * plugin_version_installed     — current installed plugin bundle version
--   * plugin_hmac_secret_encrypted — AES-256-GCM encrypted shared HMAC secret
--                                    used to sign Kodi ↔ plugin requests + events
--   * last_plugin_heartbeat_at     — timestamp of the most recent heartbeat event
--   * bundle_version_target        — pinned target version for canary rollouts
--                                    (null = follow `latest` from /api/plugin-bundle)
--
-- All columns nullable; existing rows get NULL with no backfill.

ALTER TABLE "instances" ADD COLUMN "plugin_version_installed" text;
ALTER TABLE "instances" ADD COLUMN "plugin_hmac_secret_encrypted" text;
ALTER TABLE "instances" ADD COLUMN "last_plugin_heartbeat_at" timestamp;
ALTER TABLE "instances" ADD COLUMN "bundle_version_target" text;
