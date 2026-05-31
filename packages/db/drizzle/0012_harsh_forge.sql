CREATE TABLE "desktop_builds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"app_name" text NOT NULL,
	"identifier" text,
	"theme" text NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifacts_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"callback_token" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desktop_builds" ADD CONSTRAINT "desktop_builds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_builds" ADD CONSTRAINT "desktop_builds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_builds" ADD CONSTRAINT "desktop_builds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desktop_builds_tenant_id_idx" ON "desktop_builds" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "desktop_builds_workspace_id_idx" ON "desktop_builds" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "desktop_builds_workspace_created_idx" ON "desktop_builds" USING btree ("workspace_id","created_at");