-- Reverts 0004_product_types: the knowledge base, the feedback log and the new cuisine/card columns go. The
-- cuisine opening targets stay at whatever value they hold; only the columns that described them are dropped. The
-- six wrong aliases 0004 deleted are not put back: they matched the wrong product.

ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "confidence";
--> statement-breakpoint
ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "product_type";
--> statement-breakpoint
ALTER TABLE "menu_categories" DROP COLUMN IF EXISTS "default_product_type";
--> statement-breakpoint
ALTER TABLE "cuisines" DROP COLUMN IF EXISTS "default_product_type";
--> statement-breakpoint
ALTER TABLE "cuisines" DROP COLUMN IF EXISTS "min_item_count_edited_by_user";
--> statement-breakpoint
ALTER TABLE "cuisines" DROP COLUMN IF EXISTS "target_note";
--> statement-breakpoint
ALTER TABLE "cuisines" DROP COLUMN IF EXISTS "typical_item_count";
--> statement-breakpoint
DROP TABLE IF EXISTS "suggestion_feedback";
--> statement-breakpoint
DROP TABLE IF EXISTS "product_types";
