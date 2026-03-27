ALTER TABLE "instances" ADD COLUMN "instance_url" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "status" text DEFAULT 'sent' NOT NULL;