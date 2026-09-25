-- The analysis history and the second pass of the learning loop (D-193, D-194).
--
-- suggestion_runs.analysis_mode: "quick" or "full", so the history can be filtered by it. Runs made before this
-- migration stay null (the mode was not stored).
--
-- suggestion_feedback.cuisine_id: the cuisine the card was suggested for. A product the team keeps turning down is a
-- verdict about that kitchen ("no künefe for this pizzeria"), not about the product everywhere. Backfilled from the
-- run, whose cuisine is the one the analysis settled on.
--
-- suggestion_feedback.ignored_at / ignored_by: "Geri al" in the app. The rows stay — who taught what, and when — the
-- learning loop simply stops counting them.

ALTER TABLE "suggestion_runs" ADD COLUMN IF NOT EXISTS "analysis_mode" text;
--> statement-breakpoint
ALTER TABLE "suggestion_feedback" ADD COLUMN IF NOT EXISTS "cuisine_id" uuid REFERENCES "cuisines"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "suggestion_feedback" ADD COLUMN IF NOT EXISTS "ignored_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "suggestion_feedback" ADD COLUMN IF NOT EXISTS "ignored_by" uuid REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
UPDATE "suggestion_feedback" AS f
SET "cuisine_id" = r."cuisine_id"
FROM "suggestion_runs" AS r
WHERE f."run_id" = r."id" AND f."cuisine_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_feedback_cuisine_idx" ON "suggestion_feedback" ("cuisine_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_runs_user_mode_idx" ON "suggestion_runs" ("user_id", "analysis_mode", "created_at");
