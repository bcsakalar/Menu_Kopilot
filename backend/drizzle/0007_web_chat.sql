-- The product moves from the phone to a website (D-200): one conversation per restaurant call, its messages, and
-- Gemini first on the two recommendation routes (Groq stays as the fallback).
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text DEFAULT 'Yeni görüşme' NOT NULL,
  "last_run_id" uuid REFERENCES "suggestion_runs"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_user_updated_idx" ON "conversations" ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_updated_idx" ON "conversations" ("updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "text" text DEFAULT '' NOT NULL,
  "image_count" integer DEFAULT 0 NOT NULL,
  "run_id" uuid REFERENCES "suggestion_runs"("id") ON DELETE SET NULL,
  "quick_replies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_idx" ON "chat_messages" ("conversation_id", "created_at");
--> statement-breakpoint
UPDATE "provider_configs"
SET "priority" = CASE "model" WHEN 'gemini-3.5-flash-lite' THEN 0 WHEN 'openai/gpt-oss-120b' THEN 1 WHEN 'gemini-3.8-flash' THEN 2 ELSE "priority" END
WHERE "task_key" IN ('agent.recommend', 'agent.options');
