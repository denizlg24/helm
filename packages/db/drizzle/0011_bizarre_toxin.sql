ALTER TABLE "llm_usage" ADD COLUMN "feature" text;--> statement-breakpoint
CREATE INDEX "llm_usage_workspace_feature_idx" ON "llm_usage" USING btree ("workspace_id","feature");