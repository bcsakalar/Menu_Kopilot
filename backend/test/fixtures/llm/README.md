# Recorded LLM fixtures

These JSON files are **hand-authored stand-ins** for provider responses (no API keys were available while
building the project). They mirror what the prompts ask for and deliberately include realistic flaws
(over-long descriptions, `+15 TL` in option names, a size group marked `surcharge`) so the sanitizer and
validation paths are exercised.

- `extract/<image>.json` — Stage A output for `../images/<image>` (keyed by file name; the test helper maps
  image sha256 → file).
- `enrich-items.json` — Stage C items keyed by `normalizeTr(name)`; names not listed get a low-confidence
  "unknown" item (→ `needs_review`).
- `panel/<image>.json` — Mod 2 panel extraction output.

To replace them with real recordings, put keys in `../.env` and run the live smoke tests (`pnpm test:smoke`);
compare their output with these files and update as needed.
