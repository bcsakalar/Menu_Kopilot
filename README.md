# Menü Kopilot

Personal field assistant for a delivery platform branch-opening specialist: it turns a cuisine type, a free-text
prompt and/or menu photos into ready-to-paste product cards (description, option groups, removable / extra
ingredients, portion, serving note, tags, upsell) and — its main job — completes an incomplete branch menu
from screenshots of the existing panel menu during a live phone call.

> **Decision-support tool, not an authority.** Suggestions are AI-generated and must be confirmed with the
> restaurant. The tool never talks to any delivery platform system; all input is manual and all output is copy/paste.

- Spec: [`claude-code-prompt-menu-asistani.md`](claude-code-prompt-menu-asistani.md)
- Provider research: [`docs/PROVIDER_NOTES.md`](docs/PROVIDER_NOTES.md)
- Decisions log: [`DECISIONS.md`](DECISIONS.md) · Progress: [`PROGRESS.md`](PROGRESS.md)

## Repository layout
| Path | What |
|---|---|
| `backend/` | Node.js 22 + TypeScript + Fastify API (Drizzle, PostgreSQL + pgvector, Redis, BullMQ) |
| `mobile/` | Flutter app (Android first, iOS kept buildable) |
| `deploy/` | Caddy config for the VPS |
| `docs/` | Provider notes and API/event docs |

Full setup, deployment, API key and APK build instructions are added as the phases land (see PROGRESS.md).
