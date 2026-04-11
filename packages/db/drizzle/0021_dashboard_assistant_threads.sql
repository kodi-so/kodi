CREATE TABLE IF NOT EXISTS "dashboard_assistant_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_assistant_threads" ADD CONSTRAINT "dashboard_assistant_threads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_assistant_threads" ADD CONSTRAINT "dashboard_assistant_threads_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_assistant_threads_org_updated_idx" ON "dashboard_assistant_threads" ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_assistant_threads_created_by_updated_idx" ON "dashboard_assistant_threads" ("created_by","updated_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_assistant_messages" ADD CONSTRAINT "dashboard_assistant_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_assistant_messages" ADD CONSTRAINT "dashboard_assistant_messages_thread_id_dashboard_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."dashboard_assistant_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_assistant_messages" ADD CONSTRAINT "dashboard_assistant_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_assistant_messages_org_created_idx" ON "dashboard_assistant_messages" ("org_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_assistant_messages_thread_created_idx" ON "dashboard_assistant_messages" ("thread_id","created_at");
