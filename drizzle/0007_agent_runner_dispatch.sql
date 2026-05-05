CREATE TABLE IF NOT EXISTS "agent_runners" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "token_prefix" text NOT NULL,
  "token_hash" text NOT NULL,
  "platform" text NOT NULL,
  "app_version" text DEFAULT '0.1.0' NOT NULL,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_agent_links" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "repo_url" text DEFAULT '' NOT NULL,
  "default_branch" text DEFAULT 'main' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "task_id" text REFERENCES "tasks"("id") ON DELETE set null,
  "milestone_id" text REFERENCES "milestones"("id") ON DELETE set null,
  "project_id" text REFERENCES "projects"("id") ON DELETE set null,
  "runner_id" text REFERENCES "agent_runners"("id") ON DELETE set null,
  "agent_type" text NOT NULL,
  "model_name" text,
  "status" text NOT NULL,
  "extra_prompt" text DEFAULT '' NOT NULL,
  "branch_name" text,
  "summary" text,
  "changed_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confidence" integer,
  "risky_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_message" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "run_id" text NOT NULL REFERENCES "agent_runs"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runners_token_hash_idx" ON "agent_runners" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runners_user_id_idx" ON "agent_runners" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_agent_links_project_id_idx" ON "project_agent_links" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_agent_links_user_id_idx" ON "project_agent_links" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_user_id_idx" ON "agent_runs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_task_id_idx" ON "agent_runs" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_runner_id_idx" ON "agent_runs" ("runner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_run_events_run_id_idx" ON "agent_run_events" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_run_events_user_id_idx" ON "agent_run_events" ("user_id");
