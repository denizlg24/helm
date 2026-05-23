ALTER TABLE "device_code" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "device_code" ALTER COLUMN "updated_at" SET DEFAULT now();