-- Every store opens with at least ten drinks (D-206): the drink category's expectation follows, so the analysis
-- proposes drinks until the rule is met. A coffee house is mostly drinks. The rule is the platform's, so it reaches
-- hand-edited cuisines too; GREATEST never lowers a number someone set higher.
UPDATE "cuisine_categories" AS cc
SET "min_items" = CASE WHEN c."slug" = 'kafe-icecek' THEN GREATEST(cc."min_items", 25) ELSE GREATEST(cc."min_items", 10) END
FROM "cuisines" AS c
WHERE c."id" = cc."cuisine_id" AND cc."category_key" = 'icecek';
