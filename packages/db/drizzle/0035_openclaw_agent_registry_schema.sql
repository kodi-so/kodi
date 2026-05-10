CREATE TYPE "openclaw_agent_type" AS ENUM ('org', 'member');
--> statement-breakpoint
CREATE TYPE "openclaw_agent_status" AS ENUM ('provisioning', 'active', 'suspended', 'deprovisioned', 'failed');
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ADD COLUMN "org_member_id" text;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ADD COLUMN "agent_type" "openclaw_agent_type";
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ADD COLUMN "openclaw_agent_id" text;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ADD COLUMN "status" "openclaw_agent_status" DEFAULT 'active';
--> statement-breakpoint
UPDATE "openclaw_agents"
SET
  "agent_type" = 'org'::"openclaw_agent_type",
  "openclaw_agent_id" = "id",
  "status" = COALESCE("status", 'active'::"openclaw_agent_status")
WHERE "agent_type" IS NULL OR "openclaw_agent_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ALTER COLUMN "agent_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ALTER COLUMN "openclaw_agent_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ADD CONSTRAINT "openclaw_agents_org_member_id_org_members_id_fk" FOREIGN KEY ("org_member_id") REFERENCES "public"."org_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "openclaw_agents" ADD CONSTRAINT "openclaw_agents_scope_member_check" CHECK ((
  ("openclaw_agents"."agent_type" = 'org' and "openclaw_agents"."org_member_id" is null) or
  ("openclaw_agents"."agent_type" = 'member' and "openclaw_agents"."org_member_id" is not null)
));
--> statement-breakpoint
CREATE UNIQUE INDEX "openclaw_agents_org_openclaw_agent_uidx" ON "openclaw_agents" USING btree ("org_id","openclaw_agent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "openclaw_agents_org_agent_uidx" ON "openclaw_agents" USING btree ("org_id") WHERE ("openclaw_agents"."agent_type" = 'org' and "openclaw_agents"."org_member_id" is null);
--> statement-breakpoint
CREATE UNIQUE INDEX "openclaw_agents_member_agent_uidx" ON "openclaw_agents" USING btree ("org_id","org_member_id") WHERE ("openclaw_agents"."agent_type" = 'member' and "openclaw_agents"."org_member_id" is not null);
--> statement-breakpoint
CREATE INDEX "openclaw_agents_org_member_idx" ON "openclaw_agents" USING btree ("org_id","org_member_id");
