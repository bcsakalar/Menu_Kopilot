-- Reverts 0005_learning_history: the history filter column and the learning loop's cuisine and "Geri al" columns go.
-- Rows marked "Geri al" count again once this is reverted.

DROP INDEX IF EXISTS "suggestion_runs_user_mode_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "suggestion_feedback_cuisine_idx";
--> statement-breakpoint
ALTER TABLE "suggestion_feedback" DROP COLUMN IF EXISTS "ignored_by";
--> statement-breakpoint
ALTER TABLE "suggestion_feedback" DROP COLUMN IF EXISTS "ignored_at";
--> statement-breakpoint
ALTER TABLE "suggestion_feedback" DROP COLUMN IF EXISTS "cuisine_id";
--> statement-breakpoint
ALTER TABLE "suggestion_runs" DROP COLUMN IF EXISTS "analysis_mode";
