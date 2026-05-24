DROP INDEX "subscriptions_workspace_unique";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "product_kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "module_id" text;