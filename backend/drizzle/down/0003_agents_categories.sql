-- Reverts 0003_agents_categories: drops the agent trace and the category taxonomy, and restores the branch
-- tables as empty structures. Branch ROWS cannot come back — the up migration dropped them — so a rollback
-- returns a working schema, not the old data. Take a dump before rolling back if that data still matters.

DELETE FROM "provider_configs" WHERE "task_key" IN
  ('agent.extract', 'agent.classify', 'agent.recommend', 'agent.options', 'agent.validate');
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "branch_status" AS ENUM ('draft', 'in_progress', 'ready', 'opened');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "snapshot_source" AS ENUM ('screenshot', 'manual', 'import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "branch_item_status" AS ENUM ('ok', 'incomplete', 'missing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "branch_item_source" AS ENUM ('screenshot', 'suggestion', 'recommendation', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "branches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "city" text,
  "cuisine_id" uuid NOT NULL REFERENCES "cuisines"("id") ON DELETE restrict,
  "status" "branch_status" DEFAULT 'in_progress' NOT NULL,
  "notes" text,
  "target_item_count" integer,
  "current_item_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "branches_target_chk" CHECK ("target_item_count" IS NULL OR "target_item_count" >= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_user_idx" ON "branches" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "branch_menu_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
  "run_id" uuid REFERENCES "suggestion_runs"("id") ON DELETE set null,
  "source" "snapshot_source" NOT NULL,
  "image_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_menu_snapshots_branch_idx" ON "branch_menu_snapshots" ("branch_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "branch_menu_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
  "snapshot_id" uuid REFERENCES "branch_menu_snapshots"("id") ON DELETE set null,
  "raw_name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "matched_item_id" uuid REFERENCES "menu_items"("id") ON DELETE set null,
  "has_description" boolean DEFAULT false NOT NULL,
  "has_options" boolean DEFAULT false NOT NULL,
  "has_removables" boolean DEFAULT false NOT NULL,
  "flags" jsonb,
  "completeness_score" real DEFAULT 0 NOT NULL,
  "status" "branch_item_status" NOT NULL,
  "source" "branch_item_source" NOT NULL,
  "reason" text,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "branch_menu_items_branch_name_uq" ON "branch_menu_items" ("branch_id", "normalized_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_menu_items_status_idx" ON "branch_menu_items" ("branch_id", "status");
--> statement-breakpoint

ALTER TABLE "suggestion_runs" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_runs_branch_idx" ON "suggestion_runs" ("branch_id");
--> statement-breakpoint
ALTER TABLE "suggestion_runs" DROP COLUMN IF EXISTS "counts";
--> statement-breakpoint
ALTER TABLE "suggestion_runs" DROP COLUMN IF EXISTS "menu_snapshot";
--> statement-breakpoint

DROP INDEX IF EXISTS "suggestion_items_run_section_idx";
--> statement-breakpoint
ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "fix_kind";
--> statement-breakpoint
ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "target_name";
--> statement-breakpoint
ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "category_key";
--> statement-breakpoint
ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "section";
--> statement-breakpoint
DROP TYPE IF EXISTS "fix_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "suggestion_section";
--> statement-breakpoint

DROP TABLE IF EXISTS "agent_steps";
--> statement-breakpoint
DROP TYPE IF EXISTS "agent_step_status";
--> statement-breakpoint

DROP INDEX IF EXISTS "menu_items_cuisine_category_idx";
--> statement-breakpoint
ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "category_key";
--> statement-breakpoint
DROP TABLE IF EXISTS "cuisine_categories";
--> statement-breakpoint
ALTER TABLE "cuisines" DROP COLUMN IF EXISTS "categories_edited_by_user";
--> statement-breakpoint
DROP TABLE IF EXISTS "menu_categories";
