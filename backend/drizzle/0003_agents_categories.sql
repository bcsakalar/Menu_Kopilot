-- Agent pipeline + menu category taxonomy, and the removal of the branch entity.
--
-- Why branches go: the app serves one specialist on a live phone call. Requiring a branch record before an
-- analysis was pure bureaucracy, and it forced the same menu to be entered twice (Öneri and Tamamla). The
-- analysis now hangs off `suggestion_runs` alone: the menu it read lives in `suggestion_runs.menu_snapshot`
-- and the counters in `suggestion_runs.counts`.
--
-- Why the category tables: the Gap Analyst must know which categories a cuisine is expected to cover and how
-- many products each needs. Those numbers are the user's to tune, so they live in Postgres, never in code.

CREATE TABLE IF NOT EXISTS "menu_categories" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "edited_by_user" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_categories_sort_idx" ON "menu_categories" ("sort_order");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cuisine_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cuisine_id" uuid NOT NULL REFERENCES "cuisines"("id") ON DELETE cascade,
  "category_key" text NOT NULL REFERENCES "menu_categories"("key") ON DELETE cascade,
  "min_items" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "cuisine_categories_min_chk" CHECK ("min_items" >= 0 AND "min_items" <= 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cuisine_categories_cuisine_key_uq" ON "cuisine_categories" ("cuisine_id", "category_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cuisine_categories_cuisine_idx" ON "cuisine_categories" ("cuisine_id", "sort_order");
--> statement-breakpoint
-- Set when the user edits a cuisine's category set, so the seed (which runs on every start) leaves it alone.
ALTER TABLE "cuisines" ADD COLUMN IF NOT EXISTS "categories_edited_by_user" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "category_key" text REFERENCES "menu_categories"("key") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_cuisine_category_idx" ON "menu_items" ("cuisine_id", "approved", "category_key");
--> statement-breakpoint

-- Agent trace ---------------------------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "agent_step_status" AS ENUM ('ok', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "suggestion_runs"("id") ON DELETE cascade,
  "seq" integer NOT NULL,
  "agent" text NOT NULL,
  "status" "agent_step_status" NOT NULL,
  "provider" text,
  "model" text,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "tokens_in" integer DEFAULT 0 NOT NULL,
  "tokens_out" integer DEFAULT 0 NOT NULL,
  "llm_calls" integer DEFAULT 0 NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_steps_run_seq_idx" ON "agent_steps" ("run_id", "seq");
--> statement-breakpoint

-- Sectioned suggestion cards ------------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "suggestion_section" AS ENUM ('new_product', 'option', 'fix');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "fix_kind" AS ENUM ('empty_description', 'bad_name', 'wrong_category');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "section" "suggestion_section" DEFAULT 'new_product' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "category_key" text;
--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "target_name" text;
--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "fix_kind" "fix_kind";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_items_run_section_idx" ON "suggestion_items" ("run_id", "section", "sort_order");
--> statement-breakpoint

ALTER TABLE "suggestion_runs" ADD COLUMN IF NOT EXISTS "menu_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD COLUMN IF NOT EXISTS "counts" jsonb;
--> statement-breakpoint

-- Remove the branch entity --------------------------------------------------------------------------------------
-- The last gap analysis of every branch is copied into its run first, so nothing already on screen is lost.
UPDATE "suggestion_runs" r
SET "menu_snapshot" = s."parsed"
FROM "branch_menu_snapshots" s
WHERE s."run_id" = r."id" AND r."menu_snapshot" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "suggestion_runs_branch_idx";
--> statement-breakpoint
ALTER TABLE "suggestion_runs" DROP COLUMN IF EXISTS "branch_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "branch_menu_items";
--> statement-breakpoint
DROP TABLE IF EXISTS "branch_menu_snapshots";
--> statement-breakpoint
DROP TABLE IF EXISTS "branches";
--> statement-breakpoint
DROP TYPE IF EXISTS "branch_item_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "branch_item_source";
--> statement-breakpoint
DROP TYPE IF EXISTS "branch_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "snapshot_source";
--> statement-breakpoint

-- Routes for the new agent tasks. Only for databases that were ALREADY seeded — a fresh install gets the same
-- rows from DEFAULT_ROUTES at seed time, so this block stays out of its way. Priorities mirror src/config/models.ts.
INSERT INTO "provider_configs" ("task_key", "provider", "model", "params", "priority", "enabled")
SELECT v.task_key, v.provider, v.model, v.params::jsonb, v.priority, true
FROM (VALUES
  ('agent.extract',   'gemini', 'gemini-3.5-flash-lite', '{"thinkingLevel":"low","maxOutputTokens":4096}',     0),
  ('agent.extract',   'groq',   'qwen/qwen3.8-27b',      '{"reasoningEffort":"none","maxOutputTokens":1000}',   1),
  ('agent.extract',   'gemini', 'gemini-3.8-flash',      '{"thinkingLevel":"low","maxOutputTokens":4096}',      2),
  ('agent.classify',  'gemini', 'gemini-3.5-flash-lite', '{"thinkingLevel":"minimal","maxOutputTokens":1024}',  0),
  ('agent.classify',  'groq',   'openai/gpt-oss-20b',    '{"reasoningEffort":"low","maxOutputTokens":1024}',    1),
  ('agent.recommend', 'groq',   'openai/gpt-oss-120b',   '{"reasoningEffort":"medium","maxOutputTokens":8000}', 0),
  ('agent.recommend', 'gemini', 'gemini-3.8-flash',      '{"thinkingLevel":"medium","maxOutputTokens":8000}',   1),
  ('agent.recommend', 'gemini', 'gemini-3.5-flash-lite', '{"thinkingLevel":"low","maxOutputTokens":8000}',      2),
  ('agent.options',   'groq',   'openai/gpt-oss-120b',   '{"reasoningEffort":"low","maxOutputTokens":12000}',   0),
  ('agent.options',   'gemini', 'gemini-3.8-flash',      '{"thinkingLevel":"low","maxOutputTokens":12000}',     1),
  ('agent.options',   'gemini', 'gemini-3.5-flash-lite', '{"thinkingLevel":"low","maxOutputTokens":12000}',     2),
  ('agent.validate',  'gemini', 'gemini-3.5-flash-lite', '{"thinkingLevel":"low","maxOutputTokens":2048}',      0),
  ('agent.validate',  'groq',   'openai/gpt-oss-20b',    '{"reasoningEffort":"low","maxOutputTokens":2048}',    1)
) AS v(task_key, provider, model, params, priority)
WHERE EXISTS (SELECT 1 FROM "provider_configs")
ON CONFLICT ("task_key", "provider", "model") DO NOTHING;
