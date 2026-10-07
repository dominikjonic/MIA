# 06 — Roadmap, Business, Metrics, Implementation Plan

Covers deliverables 22 (MVP), 23 (V2), 24 (V3), 25 (monetization), success metrics (§46 of the brief) and 30 (exact implementation plan).

---

## 1. MVP definition

**Goal of the MVP:** prove the core magic. Parents log most care events with one sentence or one tap, often without
opening the app, and trust the result. **Not** a goal: feature parity with Huckleberry.

### 1.1 In scope

| # | Capability | Notes / changes vs. brief's MVP list |
|---|-----------|---------------------------------------|
| 1 | Baby profile via voice onboarding, multi-baby (incl. twins) | Multi-baby from day one: retrofitting it is painful |
| 2 | Voice logging (DE/EN), on-device STT, fast path + LLM extraction, multi-event, corrections, uncertainty | Core |
| 3 | Text logging (same pipeline) | Core |
| 4 | **Night mode + silent predicted actions** | **Added** |
| 5 | Automatic timeline (day view, filters, entry detail with provenance & edit history) | Calendar month view → V2 |
| 6 | Sleep sessions (voice/tap/Live Activity), orphan-session checks | Core |
| 7 | Breastfeeding (sides, switching), bottle (breast milk/formula/mixed), simple formula prep guidance | Core |
| 8 | Diapers | Core |
| 9 | Pumping + milk stash (FIFO, sourced storage-guidance engine, transitions, use-first, expiring) | Core for pumping parents |
| 10 | Vitamins + parent-configured medication plans (strict confirmation, no dosing logic) + actionable reminders | Core |
| 11 | Appointments from natural language | Core |
| 12 | Basic growth + WHO percentiles, basic health journal (temperature, symptoms, notes) | Logging only |
| 13 | **Red-flag engine** (deterministic, on device) | **Added. Non-negotiable once health logging exists** |
| 14 | Personal next-sleep window with confidence + reasons, bedtime estimate, recalculation | Core magic |
| 15 | Today screen with morning briefing state + attention stack | Core |
| 16 | Ask my data (typed tools, grounding check, simple charts) | Core magic |
| 17 | iOS: interactive widgets, lock screen widgets, Live Activity, Control/Action Button capture, App Shortcuts. Android: Glance widgets, QS tile, ongoing timer notification | Core to the north-star metric |
| 18 | Caregiver sharing (owner/co-parent/family caregiver roles), on-duty, handoff summary | Core retention lever |
| 19 | **Import from major trackers** | **Added. Strategic** |
| 20 | Privacy center: consents, export, deletion | Required |
| 21 | Subscription (RevenueCat) | Required for learning about willingness to pay |

### 1.2 Explicitly out of MVP (and why)

| Item | Why not now |
|------|-------------|
| Apple Watch / Wear OS | Separate surface. Lock-screen + widgets cover most of the value first |
| Community, AI community search, experts, local network | Cold start, moderation, regulation (docs/00) |
| Photo journal, document AI | V2. Needs confirmation UX + storage encryption done right |
| Medical photo interpretation | Regulatory (docs/05 §3.3) |
| Doctor report PDF | V2 (stretch for late MVP) |
| Solids, milestones, vaccinations | Early adopters' babies are mostly < 6 months |
| Calendar month view | Timeline covers it |
| Weekly insights / cross-domain intelligence | Need data volume and statistical guardrails |
| Languages beyond DE/EN | Quality over breadth. Extraction eval per language is expensive |

## 2. V2 (≈ months 7–12 after MVP launch)

- Apple Watch + Wear OS (tap-to-log, dictation, timers, complications)
- **Doctor report** (PDF, share, print), questions-for-doctor collection
- Photo journal (no AI interpretation), document AI (medication packages, doctor notes, vaccination card) with confirmation
- Solids & first foods (allergen introduction log), milestones (sourced, range-based), vaccinations (national schedules)
- Weekly "what changed" digest, pre-registered cross-domain insights
- Calendar week/month, ICS export of appointments
- Babysitter mode (time-limited), daycare role
- **Community (moderated)**, seeded with expert-written knowledge cards. AI community search once the corpus is large enough
- More languages (FR/IT/NL or by market data), more jurisdictions in rules engines
- Second-child onboarding ("compare with sibling" is a strong premium hook)

## 3. V3 (year 2)

- Verified experts (answers in community, then paid consultations country by country)
- **Cohort insights** (opt-in, k-anonymous, DP): "Families like yours"
- On-device LLM for private features (health journal summaries, E2EE health vault)
- Toddler mode (12–36 months): routine, kindergarten handoff, development, health record
- Partner integrations under strict rules (e.g. pharmacy/pediatric practice appointment links, insurer-funded premium where legally clean)
- Re-evaluate: local parent network (only if the safety model in docs/00 #2 can be met), medical photo analysis (only via certified path)

## 4. Long-term platform

**"The family's health and memory record for early childhood."** Tracking intensity fades after year one. Memory, documents,
health history, development and the household network don't. The platform outlives the tracker phase:

- Child health record (vaccinations, illnesses, medications, growth, documents) portable to new doctors/countries
- Year-book / memory export (milestones, first foods, photos the parent chose)
- Siblings in one household graph
- Practitioner-facing report viewer (secure links, time-limited) without becoming an EHR

## 5. Monetization

### 5.1 Principles
- Free tier must be **genuinely good daily**: no frustration paywalls on logging, timeline, sharing or safety.
- **Safety features are never paywalled** (red flags, milk expiry warnings, medication reminders).
- **One subscription per household**, all caregivers included. Charging grandma is how you lose grandma.
- No ads. Ever. That *is* part of the product.

### 5.2 Tiers

| | Free | Premium (household) |
|---|------|---------------------|
| Voice/text/tap logging, all MVP domains | ✓ (fair-use cap on LLM-routed logs, generous, e.g. 40/day, fast path unlimited) | ✓ unlimited |
| Timeline, widgets, Live Activity, lock screen | ✓ | ✓ |
| Caregiver sharing | ✓ (up to 4 members) | ✓ unlimited |
| Milk stash + expiry warnings | ✓ | ✓ + projections, history analytics |
| Next sleep window (single) | ✓ | ✓ full-day forecast, bedtime, reasons, recalculation alerts |
| Ask my data | 10 questions / month | unlimited |
| Baby Memory view | ✓ | ✓ |
| Insights / weekly changes | — | ✓ |
| Doctor report (V2) | — | ✓ |
| Photo journal / document AI (V2) | — | ✓ |
| Multi-child intelligence (sibling comparison) (V2) | — | ✓ |
| Community read/post (V2) | ✓ | ✓ + AI community search |
| Import | ✓ | ✓ |
| Export / deletion | ✓ always | ✓ |

### 5.3 Pricing hypothesis (to test)
- **€6.99 / month, €49.99 / year**, 14-day trial of Premium starting after the first 3 days of use (when predictions become personal),
  not at install.
- **"First Year Pass"**: €69 one-time for 12 months, non-renewing. Matches the parent's time horizon, removes subscription anxiety, good gift item
  ("Geschenk zur Geburt"). Gift cards are a real acquisition channel (baby showers, grandparents).
- Test price points by market. Annual plans should dominate.

### 5.4 Unit economics guardrails
- AI cost per free MAU must stay well below the expected value of a free user. Monitor cost per household per route. The fast path share is a key cost KPI.
- Premium gross margin target ≥ 75% after store fees and AI cost.

### 5.5 Future revenue (only if clean)
- Paid expert consultations (take rate), country-by-country.
- B2B2C: insurers / employers offering Premium as a benefit (no data sharing back, contractually).
- Product recommendations: **only** editorial, non-personalized, clearly labeled, never driven by child/health data. Probably not worth the trust cost. Default: don't.

## 6. Success metrics

### 6.1 North star
**Zero-open log share** = care events logged without opening the main app UI (widgets, Live Activity, controls, intents,
notification actions, watch) **or** via a single utterance with no follow-up ÷ all care events.
Plus the brief's absolute version: **zero-open events per active household per day**.

### 6.2 Metric tree

| Area | Metric | Initial target (to calibrate in beta) |
|------|--------|-----------------------------------------|
| Effort | Median seconds per logged event (capture → receipt) | ≤ 4 s |
| Effort | Taps per event (median) | ≤ 1 |
| Effort | Taps avoided vs. reference form flow (benchmark per event type) | report weekly |
| Effort | Estimated time saved / day (events × (benchmark − actual)) | report, use in marketing only if measured |
| Accuracy | Event-level F1 on eval set | ≥ 0.95 at launch |
| Accuracy | Time error ≤ 2 min | ≥ 95% of timed events |
| Accuracy | Production correction rate (edit/undo ≤ 10 min) | < 5% |
| Accuracy | Clarification rate | 5–15% (too low may mean silent errors) |
| Channel | % events via voice / predicted taps / widgets / in-app manual | track. Voice share is *not* a goal in itself |
| Prediction | Sleep window hit-rate vs. nominal coverage, MAE of median | calibrated within ±5 pts |
| Ask | Grounding failure rate | < 1% |
| Retention | D1 / D7 / D30 household retention | D30 ≥ 45% (category benchmark to verify) |
| Engagement | Active logging days / week | ≥ 5 |
| Family | % households with ≥ 2 active caregivers by day 14 | ≥ 40% |
| Notifications | Act-rate per type, disable-rate | act-rate ≥ 30% for HELPFUL. Kill types below 10% |
| Safety | Red-flag test-suite recall | 100%, release-blocking |
| Safety | Safety incidents (severity-weighted) | 0 critical |
| Trust | % users who opened "Woher weißt du das?" / Baby Memory | track. Proxy for trust-seeking |
| Business | Trial→paid, paid retention M3/M12, AI cost per MAU | track |
| Community (V2) | Questions with ≥ 1 helpful answer in 24 h | ≥ 70% |

## 7. Exact implementation plan

Assumed team for MVP: 1 product lead (founder), 1 product designer, 2 mobile engineers (RN + one with Swift/Kotlin depth),
1 backend engineer, 1 AI/ML engineer, part-time: clinical board (3–4), privacy lawyer, regulatory consultant, QA contractor.
**MVP timeline ≈ 7 months** to public launch in AT/DE/CH. Weeks below are cumulative.

### Phase 0: Foundations & risk burn-down (weeks 1–6)

The goal is to retire the three existential risks before building UI: extraction accuracy, prediction usefulness, regulatory position.

| Track | Deliverables |
|-------|-------------|
| AI | Ontology v1 + operation schema v1 (this repo). **Eval set v1: 1,000 utterances DE/EN** (written with 15–20 real parents in interviews/diary studies + synthetic variants, incl. Austrian/Swiss German). Baseline extraction prototype (fast path + LLM) in a CLI. Time resolver + baby resolver with unit tests. Report F1 per case type. Model choice for `extract` route decided by eval |
| Prediction | Collect ≥ 50 consented historical exports (parents' existing app exports). Backtest prior + personalization model. Hit-rate/calibration report |
| Research | 20 parent interviews (incl. partners, grandparents), 3 night-time contextual observations (with consent), review-mining of competitors (DE+EN) |
| Regulatory | Intended-purpose statement, regulatory opinion (MDR), DPIA draft, processor selection + DPAs |
| Clinical | Board contracted. Red-flag rule set v1, storage rule sets (AT/DE/CH + EU default), knowledge cards v1 (top 40 topics) in review |
| Design | Concept + clickable prototype of capture/receipt/clarify/night mode. Test with 8 parents at night-like conditions |
| Brand | Naming shortlist + trademark screening |

**Exit criteria:** extraction F1 ≥ 0.92 on eval v1 with a clear path to 0.95. Prediction beats age-only baseline on backtest.
Regulatory opinion supports the intended purpose. Name chosen.

### Phase 1: Core platform (weeks 7–14)

| Track | Deliverables |
|-------|-------------|
| Backend | Monorepo (TS): `domain` (event types, validators, time resolver, guidance engine, red-flag engine, prediction), `api`, `sync`, `orchestrator`, `notifications`. Postgres schema + RLS + migrations ([db/schema.sql](../db/schema.sql) as starting point). Auth. Household/member/permission model. Audit log. Envelope encryption for C3 |
| Mobile | Expo app shell, local SQLite (SQLCipher) in App Group, PowerSync, design system v1 (dark/light/night), Today/Timeline skeleton, capture sheet with on-device STT |
| AI | Orchestrator v1 (pseudonymization, context builder, routing, validator integration, commit policy, undo). Eval in CI as a required check |
| QA | Test fixtures: synthetic household histories (newborn, 4-month, twins, mixed feeding) |

### Phase 2: Core magic (weeks 15–22)

| Track | Deliverables |
|-------|-------------|
| Mobile | All MVP domains end-to-end via voice/text/tap. Receipts, clarifications, corrections, entry detail with provenance. Night mode + predicted actions. Milk stash UI. Reminders + medication plan confirm flow. Red-flag cards (offline) |
| iOS native | Widgets (interactive + lock screen), Live Activity (sleep/breastfeeding, renewal strategy), Control/Action Button capture, App Shortcuts with Baby entity |
| Android native | Glance widgets, QS tile, ongoing timer notification |
| Engines | Prediction service live (device + server parity tests). Proactive engine + notification policy. Orphan-session checks |
| AI | Ask route with typed tools + grounding verifier + chart specs. Import service (top 3 source formats) |
| Caregivers | Invites, roles, on-duty, handoff summary, duplicate detection across caregivers |

### Phase 3: Closed beta (weeks 23–28)

- 150–300 households in AT/DE (recruited via midwives, parent groups, birth-prep courses), incl. ≥ 20 twin households and ≥ 50 with active partners.
- Weekly releases. In-app "Das war falsch" feedback → eval set growth (consented).
- Instrument the metric tree. Calibrate commit thresholds and prediction confidence labels on real data.
- Pentest, DPIA finalization, store privacy labels, clinical sign-off on all shipped content, safety test suite at 100%.
- Pricing tests (paywall variants), trial timing tests.

**Launch criteria:** F1 ≥ 0.95 on eval v2 (≥ 3,000 utterances incl. beta-derived), production correction rate < 5%, D30 retention in beta ≥ 40%,
zero open critical safety issues, regulatory/legal sign-off.

### Phase 4: Public launch AT/DE/CH (week 29+)

- App Store / Play launch, PR around "Einfach sagen" + privacy stance, midwife/pediatric-practice partnerships for distribution (flyers in practices
  are a proven channel in DACH), gift cards / First Year Pass.
- Post-launch: weekly model/prompt eval runs, monthly clinical board review, quarterly safety report.
- Start V2 track: Watch, doctor report, photo/document journal.

### First 10 engineering tickets (after this document is approved)

1. `packages/domain`: event type definitions + payload Zod schemas generated from/validated against `schemas/event-operation.schema.json`
2. `packages/domain/time`: time-expression resolver with exhaustive tests (relative, clock, anchors, part-of-day, midnight crossing, DST)
3. `packages/domain/babies`: name/alias resolver (fuzzy + phonetic, DE diminutives), ambiguity detection
4. `packages/domain/fastpath`: DE/EN grammar + tests
5. `evals/extraction`: eval runner, scoring (event-level F1, field accuracy, time tolerance), case taxonomy, reporting
6. `packages/orchestrator`: LLM gateway abstraction + extraction route with strict structured output + prompt caching
7. `packages/domain/validate`: validator + commit policy
8. `db`: migrations from `db/schema.sql`, RLS policies, seed fixtures
9. `packages/domain/predict`: sleep window model + backtest harness on imported histories
10. `packages/domain/rules`: guidance rules engine + red-flag engine (YAML rule loader, versioning, test vectors), with placeholder values clearly marked until clinical sign-off
