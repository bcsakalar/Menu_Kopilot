-- Back to the seed's earlier drink expectations (2, 3 for the sweet and breakfast kitchens, 8 for a coffee house).
-- A hand-edited cuisine keeps what the forward step left: its earlier number is not recorded anywhere.
UPDATE "cuisine_categories" AS cc
SET "min_items" = CASE
  WHEN c."slug" = 'kafe-icecek' THEN 8
  WHEN c."slug" IN ('tatli', 'dondurma', 'kahvalti', 'tost-sandvic', 'borek') THEN 3
  ELSE 2
END
FROM "cuisines" AS c
WHERE c."id" = cc."cuisine_id" AND cc."category_key" = 'icecek' AND NOT c."categories_edited_by_user";
