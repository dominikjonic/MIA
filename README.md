# MIA — AI-first parenting companion (working title)

> "The mother should not have to track the baby. She should just talk.
> The AI takes care of the tracking, memory, predictions, reminders and organization."

This repository currently contains the **product and architecture definition** for the app.
No implementation code has been written yet, on purpose: the architecture has to make sense first.

## Read in this order

| # | Document | What it covers |
|---|----------|----------------|
| 0 | [docs/00-executive-summary.md](docs/00-executive-summary.md) | The short version: thesis, critical verdicts on the brief, what the MVP should be |
| 1 | [docs/01-strategy.md](docs/01-strategy.md) | Vision, USP, why a mother would switch, competitive analysis, moat, naming, brand, App Store positioning |
| 2 | [docs/02-product.md](docs/02-product.md) | Feature matrix (with a verdict on each feature), personas, user journeys, information architecture, screen map, UX flows, design system |
| 3 | [docs/03-ai-architecture.md](docs/03-ai-architecture.md) | AI orchestration, event extraction, event schema, Baby Memory, prediction engine, "Ask my baby data", knowledge layer |
| 4 | [docs/04-platform-architecture.md](docs/04-platform-architecture.md) | System architecture, notifications, calendar/timeline, caregivers, community, expert verification, API, technology stack, Apple/Android integration |
| 5 | [docs/05-trust-safety-privacy.md](docs/05-trust-safety-privacy.md) | Privacy/security, medical safety, regulatory position (GDPR, EU MDR, AI Act, DSA) |
| 6 | [docs/06-roadmap-business.md](docs/06-roadmap-business.md) | MVP, V2, V3, long-term platform, monetization, metrics, the exact implementation plan |
| — | [schemas/event-operation.schema.json](schemas/event-operation.schema.json) | JSON Schema the LLM must produce. Nothing else can write data. |
| — | [db/schema.sql](db/schema.sql) | Draft PostgreSQL schema (the core data store, not community) |

## Status

- Product architecture: **v0.1 draft for review**
- Implementation: **not started**. The first engineering work is the extraction eval set (see docs/06, Phase 0), not the app shell.
