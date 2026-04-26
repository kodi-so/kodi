CREATE TYPE "public"."plan_id" AS ENUM('pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint

CREATE TABLE "subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "stripe_subscription_id" text,
  "plan_id" "plan_id" DEFAULT 'pro' NOT NULL,
  "status" "subscription_status" DEFAULT 'incomplete' NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscriptions_org_id_unique" UNIQUE("org_id"),
  CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);--> statement-breakpoint

CREATE TABLE "organization_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "spending_cap_cents" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_settings_org_id_unique" UNIQUE("org_id")
);--> statement-breakpoint

CREATE TABLE "usage_sync_log" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "litellm_spend_cents" integer NOT NULL,
  "marked_up_cents" integer NOT NULL,
  "overage_cents" integer NOT NULL,
  "reported_to_stripe" boolean DEFAULT false NOT NULL,
  "carry_over_cents" integer DEFAULT 0 NOT NULL,
  "stripe_meter_event_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_sync_log" ADD CONSTRAINT "usage_sync_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "usage_sync_log_org_period_idx" ON "usage_sync_log" USING btree ("org_id","period_end");
