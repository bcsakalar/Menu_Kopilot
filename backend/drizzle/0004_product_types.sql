-- Knowledge base, learning loop, realistic cuisine targets and a clean-up of wrong aliases (D-177, D-179, D-180, D-182).
--
-- product_types: the middle layer between a cuisine and a product — what a "dürüm" or a "şerbetli tatlı" opens
-- with on the panel, what customers take out and add, which option groups can never apply. Seeded, versioned,
-- editable from the app; the seed never overwrites a row the user edited.
--
-- suggestion_feedback: every option group, ingredient and description the user kept or removed when accepting a
-- card. Aggregated per product type, it tells the pipeline which suggestions this team keeps throwing away.
--
-- cuisines: a realistic product count next to the opening target, the reason for the target, and a flag so a
-- target the user set by hand is never replaced by a seed.

CREATE TABLE IF NOT EXISTS "product_types" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "category_key" text REFERENCES "menu_categories"("key") ON DELETE set null,
  "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "plain" boolean DEFAULT false NOT NULL,
  "option_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "removable" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "forbidden_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "forbidden_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "fallback_description" text DEFAULT '' NOT NULL,
  "cuisines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "edited_by_user" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "suggestion_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "run_id" uuid REFERENCES "suggestion_runs"("id") ON DELETE set null,
  "card_id" uuid REFERENCES "suggestion_items"("id") ON DELETE set null,
  "product_type" text,
  "kind" text NOT NULL,
  "value" text NOT NULL,
  "action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "suggestion_feedback_kind_chk" CHECK ("kind" IN ('product', 'option_group', 'removable', 'extra', 'description')),
  CONSTRAINT "suggestion_feedback_action_chk" CHECK ("action" IN ('accepted', 'removed', 'edited'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_feedback_type_idx" ON "suggestion_feedback" ("product_type", "kind", "value");
--> statement-breakpoint

ALTER TABLE "cuisines" ADD COLUMN IF NOT EXISTS "typical_item_count" integer;
--> statement-breakpoint
ALTER TABLE "cuisines" ADD COLUMN IF NOT EXISTS "target_note" text;
--> statement-breakpoint
ALTER TABLE "cuisines" ADD COLUMN IF NOT EXISTS "min_item_count_edited_by_user" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "cuisines" ADD COLUMN IF NOT EXISTS "default_product_type" text;
--> statement-breakpoint
-- Every seeded cuisine started at 10. A value that is not 10 today was typed by someone (the café's 50, for one):
-- it is theirs, and the realistic targets the seed now brings must not replace it.
UPDATE "cuisines" SET "min_item_count_edited_by_user" = true WHERE "min_item_count" <> 10;
--> statement-breakpoint

ALTER TABLE "menu_categories" ADD COLUMN IF NOT EXISTS "default_product_type" text;
--> statement-breakpoint

ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "product_type" text;
--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN IF NOT EXISTS "confidence" smallint;
--> statement-breakpoint
-- Six seeded aliases named a DIFFERENT product than their template ("Levrek Buğulama" pointed at Levrek Izgara, so a
-- steamed sea bass got grill options and a rename card). The seed no longer writes them; this removes the copies
-- earlier seeds left behind. Aliases a user created are never in this list.
DELETE FROM "item_aliases" a
USING "menu_items" m
WHERE a."menu_item_id" = m."id"
  AND (a."normalized_alias", m."normalized_name") IN (
    ('levrek bugulama', 'levrek izgara'),
    ('cipura bugulama', 'cipura izgara'),
    ('firinda somon', 'somon izgara'),
    ('sucuklu kasarli pide', 'sucuklu yumurtali pide'),
    ('ciger durum', 'ciger sis'),
    ('pastirmali yumurtali pide', 'pastirmali kasarli pide')
  );
