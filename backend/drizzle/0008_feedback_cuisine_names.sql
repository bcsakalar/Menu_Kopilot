-- Reps send feedback from the site and the panel reads and closes it (D-206). Cuisine names follow the delivery
-- platform's own kitchen categories so the screen speaks the reps' language; a name already changed by hand stays.
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "message" text NOT NULL,
  "author_name" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "admin_note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feedback_kind_chk" CHECK ("kind" IN ('oneri', 'hata', 'diger')),
  CONSTRAINT "feedback_status_chk" CHECK ("status" IN ('new', 'seen', 'done'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_status_created_idx" ON "feedback" ("status", "created_at");
--> statement-breakpoint
UPDATE "cuisines" AS c
SET "name" = v.new_name, "updated_at" = now()
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
WHERE c."slug" = v.slug AND c."name" = v.old_name;
--> statement-breakpoint
-- Italian pasta sits under "Mantı & Makarna" now, so each sees the other's templates first.
UPDATE "cuisines"
SET "parent_id" = (SELECT "id" FROM "cuisines" WHERE "slug" = 'manti-hamur-isleri'), "updated_at" = now()
WHERE "slug" = 'makarna' AND "parent_id" IS NULL;
