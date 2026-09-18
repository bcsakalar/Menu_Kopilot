-- Reverts 0002_vision_routes: Gemini 3.8 Flash first again, qwen3.8 back to 4096 output tokens, qwen3.6 restored
-- (only where vision routes exist, like the up migration).
DELETE FROM "provider_configs"
WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract') AND "model" = 'gemini-3.5-flash-lite';
--> statement-breakpoint
UPDATE "provider_configs" SET "priority" = 0
WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract') AND "model" = 'gemini-3.8-flash';
--> statement-breakpoint
UPDATE "provider_configs" SET "params" = jsonb_set("params", '{maxOutputTokens}', '4096'::jsonb)
WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract') AND "model" = 'qwen/qwen3.8-27b';
--> statement-breakpoint
INSERT INTO "provider_configs" ("task_key", "provider", "model", "params", "priority", "enabled")
SELECT "task_key", 'groq', 'qwen/qwen3.6-27b', '{"reasoningEffort":"none","maxOutputTokens":4096}'::jsonb, 2, true
FROM (SELECT DISTINCT "task_key" FROM "provider_configs" WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract')) AS "seeded"
ON CONFLICT ("task_key", "provider", "model") DO NOTHING;
