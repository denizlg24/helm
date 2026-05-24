CREATE TABLE "polar_checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"polar_checkout_id" text NOT NULL,
	"polar_product_id" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polar_checkout_sessions" ADD CONSTRAINT "polar_checkout_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polar_checkout_sessions" ADD CONSTRAINT "polar_checkout_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "polar_checkout_sessions_tenant_id_idx" ON "polar_checkout_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "polar_checkout_sessions_workspace_id_idx" ON "polar_checkout_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "polar_checkout_sessions_polar_checkout_unique" ON "polar_checkout_sessions" USING btree ("polar_checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "polar_checkout_sessions_workspace_product_unique" ON "polar_checkout_sessions" USING btree ("workspace_id","polar_product_id");