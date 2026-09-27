-- Reverts 0006_seller_answers: "Düşünecek" answers become open cards again; "Evet" and "Hayır" live on in `accepted`.

ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "answered_at";
--> statement-breakpoint
ALTER TABLE "suggestion_items" DROP COLUMN IF EXISTS "answer";
