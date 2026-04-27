-- Phase 1: add completed_onboarding_at to track wizard completion
ALTER TABLE "organizations" ADD COLUMN "completed_onboarding_at" timestamp;--> statement-breakpoint

-- Phase 3: capture requests for integrations not yet in the Composio catalog
CREATE TABLE "missing_integration_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missing_integration_requests" ADD CONSTRAINT "missing_integration_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
