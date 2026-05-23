CREATE UNIQUE INDEX "devices_workspace_client_unique" ON "devices" USING btree ("workspace_id","client_id");--> statement-breakpoint
COMMENT ON COLUMN "api_key"."key" IS 'Non-recoverable API key hash; Better Auth API key hashing is explicitly enabled in packages/auth/src/server.ts.';--> statement-breakpoint
COMMENT ON COLUMN "jwks"."private_key" IS 'Encrypted private key material; Better Auth JWT private key encryption remains enabled by default.';--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON "tenants" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER workspaces_set_updated_at BEFORE UPDATE ON "workspaces" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER module_configs_set_updated_at BEFORE UPDATE ON "module_configs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER devices_set_updated_at BEFORE UPDATE ON "devices" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
