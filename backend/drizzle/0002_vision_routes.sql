-- Vision routing after the first runs with real keys (D-141):
--  * Gemini 3.5 Flash-Lite reads a 15-item menu photo in ~3 s; 3.8 Flash took 13-20 s or answered 503/429 on the
--    free tier. Flash-Lite becomes the primary vision model, 3.8 Flash moves to the end of the chain.
--  * Groq's free tier caps qwen3.8 at 1000 output tokens per minute and rejects larger requests outright.
--  * qwen/qwen3.6-27b no longer exists on Groq.
-- Only touches databases that were already seeded; a fresh database gets the same order from DEFAULT_ROUTES.
INSERT INTO "provider_configs" ("task_key", "provider", "model", "params", "priority", "enabled")
SELECT "task_key", 'gemini', 'gemini-3.5-flash-lite', '{"thinkingLevel":"low","maxOutputTokens":4096}'::jsonb, -1, true
FROM (SELECT DISTINCT "task_key" FROM "provider_configs" WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract')) AS "seeded"
ON CONFLICT ("task_key", "provider", "model") DO UPDATE SET "priority" = -1, "enabled" = true;
--> statement-breakpoint
UPDATE "provider_configs" SET "priority" = 5
WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract') AND "model" = 'gemini-3.8-flash';
--> statement-breakpoint
UPDATE "provider_configs" SET "params" = jsonb_set("params", '{maxOutputTokens}', '1000'::jsonb)
WHERE "task_key" IN ('vision.menu_extract', 'vision.panel_extract') AND "model" = 'qwen/qwen3.8-27b';
--> statement-breakpoint
DELETE FROM "provider_configs" WHERE "model" = 'qwen/qwen3.6-27b';
