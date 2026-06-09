INSERT INTO "module_configs" (
	"id",
	"tenant_id",
	"workspace_id",
	"module_id",
	"enabled",
	"settings_json",
	"created_at",
	"updated_at"
)
SELECT
	gen_random_uuid()::text,
	"workspaces"."tenant_id",
	"workspaces"."id",
	"default_modules"."module_id",
	true,
	'{}'::jsonb,
	now(),
	now()
FROM "workspaces"
CROSS JOIN (
	VALUES
		('home'),
		('settings'),
		('assistant'),
		('llm-usage'),
		('api-tokens'),
		('data-export'),
		('kanban'),
		('calendar'),
		('pomodoro')
) AS "default_modules" ("module_id")
ON CONFLICT ("workspace_id", "module_id")
DO UPDATE SET
	"enabled" = true,
	"updated_at" = now();
