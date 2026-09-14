-- Reverts 0001_init: drops every table and enum created by the initial schema migration.
DROP TABLE IF EXISTS "usage_log" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "provider_configs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "prompt_templates" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "branch_menu_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "branch_menu_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "suggestion_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "suggestion_runs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "branches" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "item_embeddings" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "item_aliases" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ingredients" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "options" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "option_groups" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "menu_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "cuisines" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "devices" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."user_role";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."suggestion_item_source";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."snapshot_source";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."selection_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."run_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."run_mode";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."price_mode";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."menu_item_source";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ingredient_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."branch_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."branch_item_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."branch_item_source";
