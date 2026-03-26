ALTER TYPE "instance_status" ADD VALUE 'deleting';--> statement-breakpoint
ALTER TYPE "instance_status" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "instances" DROP COLUMN "litellm_key";--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "gateway_token" text;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "dns_record_id" text;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "litellm_customer_id" text;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "litellm_virtual_key" text;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "ssh_user" text DEFAULT 'ubuntu';--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "last_health_check" timestamp;