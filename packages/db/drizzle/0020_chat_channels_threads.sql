CREATE TABLE IF NOT EXISTS "chat_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_org_created_idx" ON "chat_channels" ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_org_slug_uidx" ON "chat_channels" ("org_id","slug");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "channel_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "thread_root_message_id" text;--> statement-breakpoint
INSERT INTO "chat_channels" ("id", "org_id", "name", "slug")
SELECT 'general_' || "id", "id", 'general', 'general'
FROM "organizations"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "chat_messages"
SET "channel_id" = 'general_' || "org_id"
WHERE "channel_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "channel_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_root_message_id_chat_messages_id_fk" FOREIGN KEY ("thread_root_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_channel_created_idx" ON "chat_messages" ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_thread_created_idx" ON "chat_messages" ("thread_root_message_id","created_at");--> statement-breakpoint
