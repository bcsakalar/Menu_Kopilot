-- The seller's answer on the call (D-196): "Evet", "Hayır" or "Düşünecek" per card, and when it was given.
--
-- `accepted` stays as it was (true = Evet, false = Hayır, null = open or Düşünecek) for everything that reads it;
-- `answer` adds the third state and lets an answer be changed during the call. Existing decisions are carried over.

ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "answer" text;
--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "answered_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "suggestion_items" SET "answer" = CASE WHEN "accepted" THEN 'yes' ELSE 'no' END WHERE "accepted" IS NOT NULL AND "answer" IS NULL;
