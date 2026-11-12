UPDATE "cuisines"
SET "parent_id" = NULL, "updated_at" = now()
WHERE "slug" = 'makarna' AND "parent_id" = (SELECT "id" FROM "cuisines" WHERE "slug" = 'manti-hamur-isleri');
--> statement-breakpoint
UPDATE "cuisines" AS c
SET "name" = v.old_name, "updated_at" = now()
FROM (VALUES
  ('kebap-izgara', 'Kebap & Izgara', 'Kebap'),
  ('manti-hamur-isleri', 'Mantı & Hamur İşleri', 'Mantı & Makarna'),
  ('tatli', 'Tatlı & Künefe', 'Tatlı'),
  ('steak', 'Steak & Et', 'Steak'),
  ('kafe-icecek', 'Kafe & İçecek', 'Kahve & İçecek'),
  ('salata-saglikli', 'Salata & Sağlıklı', 'Salata & Sağlık'),
  ('uzak-dogu', 'Uzak Doğu & Sushi', 'Uzak Doğu'),
  ('dunya-mutfagi', 'Dünya Mutfağı', 'Dünya Mutfağı & Cafe')
) AS v(slug, old_name, new_name)
WHERE c."slug" = v.slug AND c."name" = v.new_name;
--> statement-breakpoint
DROP TABLE IF EXISTS "feedback";
