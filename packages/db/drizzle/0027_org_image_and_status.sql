-- Add image column to organizations for workspace photo
ALTER TABLE "organizations" ADD COLUMN "image" text;

-- Add status column to organizations for tracking billing state
-- 'active' = fully provisioned, 'pending_billing' = created but not yet subscribed
ALTER TABLE "organizations" ADD COLUMN "status" text NOT NULL DEFAULT 'active';
