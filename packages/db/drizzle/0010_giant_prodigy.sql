CREATE TABLE "onboarding_selections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"plan" text NOT NULL,
	"module_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_selections" ADD CONSTRAINT "onboarding_selections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_selections" ADD CONSTRAINT "onboarding_selections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_selections_tenant_id_idx" ON "onboarding_selections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_selections_workspace_unique" ON "onboarding_selections" USING btree ("workspace_id");