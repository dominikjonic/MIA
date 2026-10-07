# 04 — Platform Architecture

Covers deliverables 14 (notifications), 15 (community), 16 (expert verification), 19 (database, with
[db/schema.sql](../db/schema.sql)), 20 (API), 21 (technology stack), plus calendar/timeline (§18–19),
caregivers (§20), widgets/lock screen/watch (§22–24) and multiple babies (§25).

---

## 1. System overview

```
                         ┌────────────────────────────────────────────┐
  iOS app (RN + Swift    │                 EU REGION                   │
  extensions: WidgetKit, │                                             │
  ActivityKit, AppIntents│  API Gateway / Edge (auth, rate limit, WAF) │
  watchOS V2)            │     │                                       │
        │  ▲             │     ├── Core API (TypeScript)               │
        │  │ sync        │     │     households, babies, members,      │
  Android app (RN +      │     │     events, inventory, reminders,     │
  Kotlin: Glance widgets,│     │     plans, reports, consents          │
  QS tile, Wear V2)      │     │                                       │
        │  │             │     ├── Sync service (offline-first replication,
        ▼  │             │     │     upload → validation → Postgres)   │
   Local SQLite          │     ├── AI Orchestrator ──▶ LLM gateway ──▶ LLM provider (DPA, no training,
   (App Group shared     │     │     extraction, ask, chat, reports    │                  minimal retention)
    with extensions)     │     ├── Engines: prediction, insights,      │
                         │     │     guidance rules, red flags         │
                         │     ├── Scheduler + Notification service ──▶ APNs / FCM
                         │     ├── Report service (PDF render)         │
                         │     ├── Import service (CSV parsers)        │
                         │     │                                       │
                         │  Postgres (core, RLS)  Object storage (encrypted media)
                         │  Queue (pg-boss)       KMS (per-household keys)
                         │  Search (pgvector/FTS for knowledge cards)  │
                         │                                             │
                         │  ── separate trust zone (V2) ──             │
                         │  Community service + its own DB             │
                         │  Moderation pipeline, Expert verification   │
                         └────────────────────────────────────────────┘
```

**Hard boundaries:**
- The **community zone never reads the core health DB.** Community identity is a separate pseudonymous profile.
  Linking is one-way and only via an opaque ID held by the auth service.
- **Analytics** receives no event payloads, no free text, no names. Only product telemetry with coarse properties (docs/05 §1.6).
- **LLM provider** receives pseudonymized, minimal context under a DPA, with zero/minimal retention where available.

## 2. Technology stack (recommendation)

| Layer | Choice | Why | Alternative |
|-------|--------|-----|-------------|
| Mobile app | **React Native (Expo, New Architecture) + TypeScript** | Two platforms with a small team. Shared domain code with backend (prediction engine, time resolver, fast-path parser, validators run identically on device and server) | Native SwiftUI + Kotlin/Compose if the team is native-heavy. Better polish, ~1.7× cost |
| iOS system surfaces | **Native Swift targets**: WidgetKit, ActivityKit (Live Activities), App Intents/App Shortcuts, Controls, watchOS (V2) | These are Swift-only regardless of app framework | — |
| Android system surfaces | **Kotlin**: Glance app widgets, Quick Settings tile, ongoing notification for timers, Wear OS (V2) | Same | — |
| Local DB | **SQLite** in a shared App Group container (iOS) so widgets/intents read and write directly | Widgets and intents work without launching the RN runtime | — |
| Sync | **PowerSync** (Postgres ↔ SQLite, uploads go through our API for validation) | Offline-first with server-side validation of every write, which we need anyway | ElectricSQL, custom CRDT-free sync on the event log (feasible since events are append-only revisions) |
| On-device STT | Apple Speech / SpeechAnalyzer, Android on-device SpeechRecognizer | Privacy, latency, offline | Server STT (EU), consent-gated fallback |
| Backend | **TypeScript (Node, Fastify)**, modular monolith | One language end-to-end, shared packages. Monolith first, split along the trust boundaries later | Kotlin/Go |
| Database | **PostgreSQL 16+** (managed, EU region) with Row-Level Security, pgvector, pg_partman for events | Relational + JSONB payloads + RLS per household | — |
| Hosting | **Supabase (EU region)** for MVP speed: Postgres, Auth, Storage, RLS. Or AWS eu-central-1 (Frankfurt) with RDS | Both have DPAs. Supabase accelerates MVP. Migrate to self-managed AWS if needed (plain Postgres keeps us portable) | Hetzner/OVH for EU-sovereign positioning |
| Queue / jobs | pg-boss (Postgres-backed) | Fewer moving parts | SQS, BullMQ |
| LLM | Anthropic Claude via our **LLM gateway** (provider abstraction, prompt caching, eval-gated routing) | Strong structured output and multilingual quality. Gateway keeps us switchable | — |
| Auth | Supabase Auth / Cognito: Sign in with Apple, Google, email magic link, passkeys | No passwords to leak | — |
| Payments | **RevenueCat** over StoreKit 2 / Play Billing | Entitlements across platforms, family sharing | — |
| Push | APNs (incl. Live Activity push tokens), FCM | — | — |
| PDF reports | Server-side HTML → PDF (headless Chromium) from a fixed template | Consistent, printable | On-device PDFKit |
| Product analytics | **PostHog EU** (or self-hosted) with an allowlist schema | Privacy control | — |
| Crash/errors | Sentry with aggressive PII scrubbing, no breadcrumbs with text | — | — |
| Feature flags / remote config | PostHog flags or ConfigCat | Kill switches for AI routes | — |
| CI/CD | GitHub Actions, EAS Build/Submit, eval gate as a required check | — | — |

## 3. Sync, offline and conflicts

- **IDs generated on device** (ULID), so events exist before the server knows them.
- **Events are append-only revisions** → conflicts reduce to "two revisions of the same event" (rare, resolved last-writer-wins *per field*
  with a visible history) or "two different events describing the same thing" (duplicate detection, docs/03 §3.7).
- **Sessions** (open sleep) are the conflict hotspot: Lena closes sleep at 06:45 on her phone, Tobias closes at 06:50 on his.
  Resolution: first close wins, second becomes an `update` proposal shown to the second caregiver ("Lena hat den Schlaf schon um 06:45 beendet.").
- **Uploads are validated server-side** exactly like AI operations (same validator package). A malicious or buggy client can't write
  invalid or out-of-scope data.

## 4. Calendar & timeline

- **Timeline** is a *view over the event log* + appointments + reminders + predictions (rendered as ghost blocks). Nothing is entered "into" it.
- **Calendar (V2):** week/month built on the same query. Filters by domain and caregiver.
- **Appointments** come from natural language ("morgen 14:30 Kinderarzt") → `appointment` event + reminder.
- **Export, not import:** an optional read-only ICS feed / EventKit write of *appointments only* to the parent's calendar.
  Baby care events don't belong in the family calendar (noise, privacy on shared work calendars).

## 5. Multi-caregiver system

### 5.1 Model

- **Household** owns babies and data. **Members** have roles. A member can belong to several households (grandma with two grandchildren).
- **Owners** (parents with parental responsibility, max 2–3) control consents, deletion, invitations.

### 5.2 Roles and permission scopes

| Scope | Owner | Co-parent | Family caregiver | Babysitter | Daycare |
|-------|:-----:|:---------:|:----------------:|:----------:|:-------:|
| Log care events (sleep, feed, diaper, pump) | ✓ | ✓ | ✓ | ✓ | ✓ |
| See care history | ✓ | ✓ | ✓ (configurable range) | today only | own entries + today |
| Log supplements / give planned medication | ✓ | ✓ | ✓ if granted | ✓ if granted | ✓ if granted |
| Create/change medication plans | ✓ | ✓ | ✗ | ✗ | ✗ |
| Health journal, documents, photos | ✓ | ✓ | ✗ (default) | ✗ | ✗ |
| Ask my data | ✓ | ✓ | care scope only | ✗ | ✗ |
| Reports & export | ✓ | ✓ | ✗ | ✗ | ✗ |
| Invite / remove members, consents, delete | ✓ | ✓ (configurable) | ✗ | ✗ | ✗ |

- Permissions are enforced **server-side (RLS + API)** and mirrored client-side for UI only.
- **Time-limited access** for babysitters (expires automatically), revocable instantly.
- **"On duty"** status: who currently has the baby. Notifications route to the on-duty caregiver first (fixes double notifications).
- Every write shows *who* logged it. The audit log shows who viewed medical data.

## 6. Notification architecture

### 6.1 Priority model

| Priority | Examples | Delivery | Quiet hours |
|----------|----------|----------|-------------|
| **URGENT** | Red-flag escalation (only in response to data the parent just entered) | Immediate, time-sensitive interruption level, full-screen in app | Bypasses quiet hours |
| **IMPORTANT** | Planned medication due, milk past use-by guidance, orphan session check | Time-sensitive | Respects quiet hours unless the parent opts medication in |
| **HELPFUL** | Next sleep window soon, vitamin D, appointment tomorrow, handoff | Normal, grouped | Suppressed |
| **OPTIONAL** | Weekly digest, insights, product news (off by default) | Summary / in-app only | Suppressed |

### 6.2 Rules

- **Daily budget:** ≤ 3 HELPFUL + OPTIONAL per caregiver per day by default. Over budget → in-app attention stack only.
- **Dedup across caregivers:** reminders route to the on-duty caregiver. If someone logs the action, pending notifications on all devices are withdrawn.
- **Usefulness feedback:** each non-urgent notification type tracks act/dismiss/ignore rates. Types with low act-rates are automatically demoted for that user.
- **Local-first scheduling** for time-critical reminders (vitamin, medication): scheduled as local notifications on each relevant device so they fire offline.
  The server reconciles. Push is used for cross-device updates (caregiver logged something, plan changed).
- **Honesty about reliability:** OS-level notification delivery is never guaranteed (focus modes, battery optimizers on Android).
  The medication plan screen states that reminders are an aid, not a guarantee. Critical-alert entitlements are unlikely to be granted for this use and must not be relied on.
- **Actionable notifications:** "Vitamin D gegeben ✓" / "Später (30 min)" directly from the notification (counts as zero-open logging).

### 6.3 Pipeline

`trigger (state change | schedule) → candidate notification → policy (priority, quiet hours, budget, on-duty, dedup) → channel (local | push | in-app) → delivery log → feedback`

## 7. Community architecture (V2)

### 7.1 Scope and identity

- Separate service, separate database, separate pseudonymous **community profile** (display name, optional avatar, child age range
  *rounded* (e.g. "Baby 6–9 Monate"), country/region at state level, languages).
- **Never** auto-share anything from the tracking data. Any "my data" snippet in a post (e.g. a sleep chart) is an explicit, previewed,
  de-identified export the user attaches. Times are relative, no names.
- **No children's photos in the community** (policy + automated detection). This removes a whole class of abuse.

### 7.2 Features

Posts, replies, upvotes, saves, topics (Schlaf, Stillen, Fläschchen/Pre, Beikost, Entwicklung, Zahnen, Krankheit, Wochenbett & Postpartum,
Ausstattung, Reisen, Kita/Krippe, …), groups (opt-in, moderated), reporting, blocking, muting.

### 7.3 Moderation (prerequisite, not afterthought)

- Pre-publication automated classification (harassment, medical misinformation patterns, self-harm/postpartum crisis signals → **crisis resources**,
  spam, commercial promotion, child sexual abuse material detection via hash-matching services).
- Human moderation team (or vendor) with SLAs. Escalation path for crisis content (postpartum depression is common and serious).
- DSA compliance: notice-and-action, statement of reasons, appeals, transparency reporting, trusted flaggers.
- **Medical misinformation policy** with clinical board input: posts can be labeled ("Diese Aussage widerspricht [Quelle]"), not silently removed unless harmful.

### 7.4 AI community search

```
query ─▶ intent + slot extraction (age band, symptom/topic, duration, time of night)
      ─▶ hybrid retrieval: BM25 + embeddings over posts/replies, filtered by age band & topic
      ─▶ cluster similar threads ─▶ summarize per cluster (LLM, with citations to post IDs)
      ─▶ attach expert answers (V3) and knowledge cards (curated)
      ─▶ render in three visually distinct sections:
           1. "Geprüfte Information" (knowledge cards / verified experts)  ← blue, source shown
           2. "Erfahrungen anderer Eltern" (N Diskussionen, Zusammenfassung, Top-Antworten) ← neutral
           3. "KI-Zusammenfassung" label on any generated text
```

- Never "X% of parents say…" from forum counts. Counts are of *discussions*, not people, and are labeled as such.
- If the query contains red-flag content, the red-flag engine response comes **first**, before any community content.

## 8. Expert verification system (V3)

| Step | What | Notes |
|------|------|-------|
| 1. Application | Name, profession, country, registration number, employer/practice, specialties, languages | — |
| 2. Identity | Government ID + liveness via a KYC vendor | — |
| 3. Credential check | Lookup in the **official public registers** per country/profession (e.g. physician registers held by medical chambers, midwife registers, IBCLC public registry for lactation consultants) | Manual review where no API exists |
| 4. Scope mapping | Map the credential to what they may be labeled as and answer about ("Hebamme" ≠ "Ärztin") | Exact protected titles per country |
| 5. Agreement | Expert terms: no individual diagnosis/treatment in public answers, disclosure of conflicts of interest, professional-advertising rules | Legal review per country |
| 6. Badge | "Verifiziert: Hebamme · Österreich · seit 2027-03" | Badge shows *what* was verified and *when* |
| 7. Re-verification | Annual + register monitoring. Immediate suspension on complaints | — |

- Self-described titles without verification are **not displayable** in profile name or badge.
- "Sleep consultant" is not a protected profession. Label it as such, separate from licensed health professionals.
- Expert answers carry a standard footer: general information, not individual medical advice.

## 9. Apple / Android integration

| Surface | Implementation | Zero-open capability | Constraints |
|---------|----------------|---------------------|-------------|
| iOS interactive widgets | WidgetKit + App Intents buttons | Predicted actions, start/stop sleep, last feed, next window | Refresh budget. Use timeline entries + app-triggered reloads |
| Lock screen widgets | Accessory widgets | Next window, last feed, timer state | Small, glanceable |
| Live Activities | ActivityKit + push tokens for remote updates | Live sleep/feeding timer, "Aufgewacht"/"Seite wechseln" buttons | Active up to ~8 h, so night sleep needs renewal (end + restart via push/app wake) or a lock-screen widget fallback. Validate behavior on current iOS |
| Controls (Control Center / Lock Screen / Action Button) | ControlWidget → opens instant capture | One press to talk | Opens app UI (capture sheet) |
| App Shortcuts / Siri | App Intents with `Baby` AppEntity, phrases incl. app name | "Starte Schlaf für Emma in [App]" | No free-form text in the phrase. Free-form needs a follow-up dictation prompt |
| Apple Watch (V2) | watchOS app + complications + Smart Stack | Tap-to-log, dictation, timers | Separate UI. Sync via phone/app group + direct network |
| Android widgets | Glance | Same as iOS | OEM battery optimizers |
| Quick Settings tile | TileService → capture | One swipe + tap | — |
| Ongoing notification | Foreground timer notification with actions | Timer + stop | Android 14+ foreground service rules: use notifications without FGS where possible |
| Wear OS (V2) | Tile + app | Tap-to-log | — |
| Apple Health / Health Connect | **Parent's own data only** (e.g. postpartum), optional. Baby data is not written to the parent's health store | — | Avoids mixing data subjects |

**Architecture note:** extensions read/write the shared SQLite directly and enqueue a "dirty" marker. The main app or a background
task syncs. Business rules for intent-triggered writes (start/stop sleep) use a small shared Swift/Kotlin module mirroring the TS
validator for these few operations, and the server re-validates on sync.

## 10. API architecture

Two styles, deliberately:
1. **Sync protocol** for the core data (events, inventory, reminders, members). The client mostly reads/writes its local DB.
2. **RPC/REST endpoints** for things that need the server's brain or authority.

```
POST   /v1/utterances                 {capture_ts, channel, baby_hint?, text, locale, stt_confidence?}
                                      → {operations_applied[], receipts[], clarification?}   (streaming optional)
POST   /v1/utterances/{id}/clarify    {answer}
POST   /v1/operations/{id}/undo
POST   /v1/ask                        {question, baby_id?, conversation_id?} → SSE stream {text, charts[], citations[]}
GET    /v1/babies/{id}/today          → briefing/home state (also computed locally. Server = reference)
GET    /v1/babies/{id}/predictions    → {next_sleep:{start,end,median,confidence,reasons[]}, bedtime, next_feed}
GET    /v1/babies/{id}/insights?range=
POST   /v1/reports                    {baby_id, range, sections[], photo_ids[]} → {report_id} (async)
GET    /v1/reports/{id}               → status + signed PDF URL (short TTL)
POST   /v1/imports                    {source_app, file} → job. GET /v1/imports/{id} → preview + mapping → POST confirm
POST   /v1/medication-plans/drafts    (from utterance or document) → draft
POST   /v1/medication-plans/{id}/confirm   {fields confirmed explicitly}
GET    /v1/milk/inventory             → portions with guidance {use_by, rule_source, assumptions}
POST   /v1/households/{id}/invites    {role, scopes, expires_at?}
POST   /v1/handoffs                   {to_member_id?} → summary
GET    /v1/privacy/export             → async full export (JSON + CSV + media)
DELETE /v1/households/{id}            → deletion workflow (grace period, then hard delete + key destruction)
GET    /v1/knowledge/cards?query=&jurisdiction=
```

- Auth: short-lived JWT + refresh. Household scope claims are checked again in RLS.
- Idempotency keys on every POST (offline retries).
- Rate limits per member and per household on AI endpoints (cost and abuse control).
- Versioned (`/v1`), additive changes only. Clients send `schema_version`.

## 11. Data import (strategic, MVP)

- Parsers for exports of the major trackers (CSV formats vary, so maintain per-source mapping + an LLM-assisted mapper for unknown CSVs,
  with **preview and confirmation** before writing).
- Imported events: `provenance.kind = imported`, original row kept for audit. Dedup against existing data.
- Immediately backfills baselines → predictions are personal on day one.
- Formats change without notice. Build a fixture library and alerting on parse failures.
