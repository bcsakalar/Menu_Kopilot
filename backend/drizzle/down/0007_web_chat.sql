DROP TABLE IF EXISTS "chat_messages";
--> statement-breakpoint
DROP TABLE IF EXISTS "conversations";
--> statement-breakpoint
UPDATE "provider_configs"
SET "priority" = CASE "model" WHEN 'openai/gpt-oss-120b' THEN 0 WHEN 'gemini-3.5-flash-lite' THEN 1 WHEN 'gemini-3.8-flash' THEN 2 ELSE "priority" END
WHERE "task_key" = 'agent.recommend';
--> statement-breakpoint
UPDATE "provider_configs"
SET "priority" = CASE "model" WHEN 'openai/gpt-oss-120b' THEN 0 WHEN 'gemini-3.8-flash' THEN 1 WHEN 'gemini-3.5-flash-lite' THEN 2 ELSE "priority" END
WHERE "task_key" = 'agent.options';
