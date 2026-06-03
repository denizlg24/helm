ALTER TABLE "workspaces" ALTER COLUMN "theme" SET DEFAULT 'default';--> statement-breakpoint
ALTER TABLE "desktop_builds" ADD COLUMN "app_version" text;