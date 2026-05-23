CREATE TABLE "usage_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"amount_usd_cents" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_credits_workspace_id_idx" ON "usage_credits" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "usage_credits_tenant_id_idx" ON "usage_credits" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_credits_source_ref_unique" ON "usage_credits" USING btree ("source","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_workspace_client_unique" ON "devices" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "llm_usage_workspace_created_idx" ON "llm_usage" USING btree ("workspace_id","created_at");