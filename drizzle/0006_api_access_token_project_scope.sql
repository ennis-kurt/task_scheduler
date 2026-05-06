ALTER TABLE "api_access_tokens" ADD COLUMN IF NOT EXISTS "scope_type" text DEFAULT 'all_projects' NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_access_tokens" ADD COLUMN IF NOT EXISTS "project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
