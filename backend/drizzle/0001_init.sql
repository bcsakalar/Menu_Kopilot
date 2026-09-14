CREATE TYPE "public"."branch_item_source" AS ENUM('screenshot', 'suggestion', 'recommendation', 'manual');--> statement-breakpoint
CREATE TYPE "public"."branch_item_status" AS ENUM('ok', 'incomplete', 'missing');--> statement-breakpoint
CREATE TYPE "public"."branch_status" AS ENUM('draft', 'in_progress', 'ready', 'opened');--> statement-breakpoint
CREATE TYPE "public"."ingredient_kind" AS ENUM('removable', 'extra', 'base');--> statement-breakpoint
CREATE TYPE "public"."menu_item_source" AS ENUM('ai', 'user', 'imported', 'seed');--> statement-breakpoint
CREATE TYPE "public"."price_mode" AS ENUM('free', 'surcharge', 'sets_base');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('suggest', 'gap');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."selection_type" AS ENUM('single', 'multi');--> statement-breakpoint
CREATE TYPE "public"."snapshot_source" AS ENUM('screenshot', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."suggestion_item_source" AS ENUM('seed', 'db', 'ai', 'review');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'uzman');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_name" text NOT NULL,
	"refresh_token_hash" text,
	"refresh_expires_at" timestamp with time zone,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'uzman' NOT NULL,
	"password_hash" text NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cuisines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"min_item_count" integer DEFAULT 10 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuisines_slug_unique" UNIQUE("slug"),
	CONSTRAINT "cuisines_min_item_count_chk" CHECK ("cuisines"."min_item_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "ingredient_kind" NOT NULL,
	"price_delta" numeric(10, 2),
	"price_hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"model" text NOT NULL,
	"dim" integer NOT NULL,
	"embedding" vector(768) NOT NULL,
	"input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"cuisine_id" uuid NOT NULL,
	"description" varchar(160) DEFAULT '' NOT NULL,
	"serving_note" text DEFAULT '' NOT NULL,
	"portion_info" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergen_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"upsell_suggestion" text DEFAULT '' NOT NULL,
	"source" "menu_item_source" NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"importance" smallint DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"quality_score" real,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_description_len_chk" CHECK (char_length("menu_items"."description") <= 160),
	CONSTRAINT "menu_items_importance_chk" CHECK ("menu_items"."importance" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"selection_type" "selection_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_groups_select_chk" CHECK ("option_groups"."min_select" >= 0 and "option_groups"."max_select" >= 1 and "option_groups"."max_select" >= "option_groups"."min_select")
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"price_mode" "price_mode" DEFAULT 'free' NOT NULL,
	"price_hint" text DEFAULT 'ücretsiz' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"matched_item_id" uuid,
	"source" "suggestion_item_source" NOT NULL,
	"payload" jsonb NOT NULL,
	"accepted" boolean,
	"edited_payload" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"branch_id" uuid,
	"cuisine_id" uuid,
	"mode" "run_mode" DEFAULT 'suggest' NOT NULL,
	"prompt_text" text,
	"image_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"model" text,
	"stage" text DEFAULT 'init' NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"deep_mode" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	"cost_estimate" numeric(12, 6),
	"cache_hit" boolean DEFAULT false NOT NULL,
	"pending_work" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "branch_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"matched_item_id" uuid,
	"has_description" boolean DEFAULT false NOT NULL,
	"has_options" boolean DEFAULT false NOT NULL,
	"has_removables" boolean DEFAULT false NOT NULL,
	"flags" jsonb,
	"completeness_score" real DEFAULT 0 NOT NULL,
	"status" "branch_item_status" NOT NULL,
	"source" "branch_item_source" NOT NULL,
	"reason" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_menu_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"run_id" uuid,
	"source" "snapshot_source" NOT NULL,
	"image_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"cuisine_id" uuid NOT NULL,
	"status" "branch_status" DEFAULT 'in_progress' NOT NULL,
	"notes" text,
	"target_item_count" integer,
	"current_item_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_target_chk" CHECK ("branches"."target_item_count" is null or "branches"."target_item_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"task_key" text NOT NULL,
	"model" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"run_id" uuid,
	"task_key" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"success" boolean NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuisines" ADD CONSTRAINT "cuisines_parent_id_cuisines_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cuisines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuisines" ADD CONSTRAINT "cuisines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_aliases" ADD CONSTRAINT "item_aliases_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_embeddings" ADD CONSTRAINT "item_embeddings_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_option_group_id_option_groups_id_fk" FOREIGN KEY ("option_group_id") REFERENCES "public"."option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD CONSTRAINT "suggestion_items_run_id_suggestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."suggestion_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD CONSTRAINT "suggestion_items_matched_item_id_menu_items_id_fk" FOREIGN KEY ("matched_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_menu_items" ADD CONSTRAINT "branch_menu_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_menu_items" ADD CONSTRAINT "branch_menu_items_snapshot_id_branch_menu_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."branch_menu_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_menu_items" ADD CONSTRAINT "branch_menu_items_matched_item_id_menu_items_id_fk" FOREIGN KEY ("matched_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_menu_snapshots" ADD CONSTRAINT "branch_menu_snapshots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_menu_snapshots" ADD CONSTRAINT "branch_menu_snapshots_run_id_suggestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."suggestion_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_run_id_suggestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."suggestion_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "devices_refresh_hash_idx" ON "devices" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "cuisines_parent_idx" ON "cuisines" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "ingredients_item_idx" ON "ingredients" USING btree ("menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_aliases_item_alias_uq" ON "item_aliases" USING btree ("menu_item_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "item_aliases_normalized_idx" ON "item_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "item_aliases_normalized_trgm_idx" ON "item_aliases" USING gin ("normalized_alias" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "item_embeddings_item_model_uq" ON "item_embeddings" USING btree ("menu_item_id","model","dim");--> statement-breakpoint
CREATE INDEX "item_embeddings_hnsw_idx" ON "item_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "menu_items_normalized_name_trgm_idx" ON "menu_items" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_cuisine_name_approved_uq" ON "menu_items" USING btree ("cuisine_id","normalized_name","approved");--> statement-breakpoint
CREATE INDEX "menu_items_cuisine_usage_idx" ON "menu_items" USING btree ("cuisine_id","approved","usage_count");--> statement-breakpoint
CREATE INDEX "option_groups_item_idx" ON "option_groups" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "options_group_idx" ON "options" USING btree ("option_group_id");--> statement-breakpoint
CREATE INDEX "suggestion_items_run_idx" ON "suggestion_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "suggestion_items_matched_idx" ON "suggestion_items" USING btree ("matched_item_id");--> statement-breakpoint
CREATE INDEX "suggestion_runs_created_at_idx" ON "suggestion_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "suggestion_runs_user_created_idx" ON "suggestion_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "suggestion_runs_branch_idx" ON "suggestion_runs" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_menu_items_branch_name_uq" ON "branch_menu_items" USING btree ("branch_id","normalized_name");--> statement-breakpoint
CREATE INDEX "branch_menu_items_status_idx" ON "branch_menu_items" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "branch_menu_snapshots_branch_idx" ON "branch_menu_snapshots" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "branches_user_idx" ON "branches" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_templates_key_version_uq" ON "prompt_templates" USING btree ("key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_templates_active_key_uq" ON "prompt_templates" USING btree ("key") WHERE "prompt_templates"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "provider_configs_task_provider_model_uq" ON "provider_configs" USING btree ("task_key","provider","model");--> statement-breakpoint
CREATE INDEX "provider_configs_task_priority_idx" ON "provider_configs" USING btree ("task_key","priority");--> statement-breakpoint
CREATE INDEX "usage_log_user_created_idx" ON "usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_log_created_idx" ON "usage_log" USING btree ("created_at");