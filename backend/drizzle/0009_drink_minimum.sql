-- Every store opens with at least ten drinks (D-206): the drink category's expectation follows, so the analysis
-- proposes drinks until the rule is met. A coffee house is mostly drinks. Cuisines whose categories the team edited
-- by hand keep their own numbers.
UPDATE "cuisine_categories" AS cc
SET "min_items" = CASE WHEN c."slug" = 'kafe-icecek' THEN GREATEST(cc."min_items", 25) ELSE GREATEST(cc."min_items", 10) END
FROM "cuisines" AS c
WHERE c."id" = cc."cuisine_id" AND cc."category_key" = 'icecek' AND NOT c."categories_edited_by_user";
