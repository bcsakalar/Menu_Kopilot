-- "Makarna & İtalyan" folds into "Mantı & Makarna" (D-212): the team's kitchen list has no separate Italian kitchen.
-- Its templates, runs and learning move across. A template whose name "Mantı & Makarna" already has in the same
-- state (the packaged drinks both carried) is dropped and the other's copy stays. Nothing happens on a database that
-- lacks either cuisine (a fresh install: the seed no longer creates "makarna").
DELETE FROM "menu_items" AS m
USING "cuisines" AS src, "cuisines" AS dst, "menu_items" AS keep
WHERE src."slug" = 'makarna' AND dst."slug" = 'manti-hamur-isleri'
  AND m."cuisine_id" = src."id" AND keep."cuisine_id" = dst."id"
  AND keep."normalized_name" = m."normalized_name" AND keep."approved" = m."approved";
--> statement-breakpoint
UPDATE "menu_items" AS m
SET "cuisine_id" = dst."id", "updated_at" = now()
FROM "cuisines" AS src, "cuisines" AS dst
WHERE src."slug" = 'makarna' AND dst."slug" = 'manti-hamur-isleri' AND m."cuisine_id" = src."id";
--> statement-breakpoint
-- A conversation carries on from its last run's counts, so the cuisine inside them moves too.
UPDATE "suggestion_runs" AS r
SET "cuisine_id" = CASE WHEN r."cuisine_id" = src."id" THEN dst."id" ELSE r."cuisine_id" END,
    "counts" = CASE WHEN r."counts" ->> 'cuisineId' = src."id"::text
      THEN r."counts" || jsonb_build_object('cuisineId', dst."id"::text, 'cuisineName', dst."name")
      ELSE r."counts" END
FROM "cuisines" AS src, "cuisines" AS dst
WHERE src."slug" = 'makarna' AND dst."slug" = 'manti-hamur-isleri'
  AND (r."cuisine_id" = src."id" OR r."counts" ->> 'cuisineId' = src."id"::text);
--> statement-breakpoint
UPDATE "suggestion_feedback" AS f
SET "cuisine_id" = dst."id"
FROM "cuisines" AS src, "cuisines" AS dst
WHERE src."slug" = 'makarna' AND dst."slug" = 'manti-hamur-isleri' AND f."cuisine_id" = src."id";
--> statement-breakpoint
UPDATE "product_types"
SET "cuisines" = (
  SELECT coalesce(jsonb_agg(DISTINCT CASE WHEN c = 'makarna' THEN 'manti-hamur-isleri' ELSE c END), '[]'::jsonb)
  FROM jsonb_array_elements_text("cuisines") AS c
)
WHERE "cuisines" ? 'makarna' AND EXISTS (SELECT 1 FROM "cuisines" WHERE "slug" = 'manti-hamur-isleri');
--> statement-breakpoint
-- Its category expectations go with it (cascade).
DELETE FROM "cuisines"
WHERE "slug" = 'makarna' AND EXISTS (SELECT 1 FROM "cuisines" WHERE "slug" = 'manti-hamur-isleri');
