# Recorded LLM fixtures

These JSON files stand in for provider responses so the test suite never needs a key. They mirror what the agent
prompts ask for and deliberately include realistic flaws (a clipped name, overlapping screenshots, packaging glued to
a product name, `+15 TL` in an option name) so the Validator and the dedupe paths are exercised.

- `extract/<image>.json` — the Extractor's answer (`agent.extract`) for `../images/<image>`, keyed by file name (the
  test helper maps the image's sha256 → file). `panel-1` and `panel-2` are two overlapping panel screenshots
  with empty description/option fields; the `menu-*` files are menu photos.
- `recommend-items.json` — the Product Recommender's answer (`agent.recommend`) for the pide menu's category gaps.

The frozen menus used for the before/after quality measurement are in `../menus/` (see its README).

To refresh them from real providers, put keys in the repository's `.env` and run `pnpm fixtures:record`
(`scripts/record-fixtures.ts`: every image through `agent.extract`, the pide gaps through `agent.recommend`); review
the diff before committing — the tests assert on these contents.
