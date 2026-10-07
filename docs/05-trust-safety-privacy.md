# 05 — Trust: Privacy, Security, Medical Safety, Regulation

Covers deliverables 17 (privacy/security) and 18 (medical safety), plus AI safety (§29 of the brief).

> This document is an engineering and product design, **not legal advice**. Before launch: a DPIA with a privacy
> lawyer, a regulatory opinion on medical-device qualification, and clinical review of all health content.

---

## 1. Privacy architecture

### 1.1 Data classification

| Class | Examples | Handling |
|-------|----------|----------|
| **C3: Special category / health** | temperature, symptoms, medications, diagnoses, health photos, doctor documents, growth, stool details | Explicit consent (GDPR Art. 9(2)(a)), application-layer encryption, restricted roles, access audit, excluded from analytics, excluded from model improvement unless separately opted in |
| **C2: Child personal data** | name, DOB, sleep/feeding/diaper events, milestones, routine | Treated as sensitive by default. Daily routines reveal when a household is home/asleep |
| **C1: Account / parent** | email, auth identifiers, subscription status, device tokens | Standard protection |
| **C0: Telemetry** | screen views, feature usage counts, latencies | No content, no free text, no names, allowlisted properties only |

**Default posture:** treat C2 like C3. Feeding/sleep patterns plus diaper data are health-adjacent, and regulators and parents won't make fine distinctions.

### 1.2 GDPR implementation

| Principle / right | Implementation |
|-------------------|----------------|
| Lawful basis | Contract (Art. 6(1)(b)) for core service. **Explicit consent** (Art. 9(2)(a)) for health data processing, recorded per category with version and timestamp |
| Who consents | The parent(s) with parental responsibility, for themselves and on behalf of the child. Caregivers consent for their own account data only |
| Data minimization | Optional fields stay optional. No required sex/birth weight. No location collection (country from settings/store locale, never GPS) |
| Purpose limitation | Product improvement (e.g. using corrections to improve extraction) is **separate opt-in**, off by default, revocable |
| Storage limitation | Utterance transcripts: retained 30 days by default for undo/audit, then reduced to the evidence snippet on the event. Configurable shorter. Raw audio: not stored. Deleted households: hard delete after 30-day grace, backups expire within 35 days, keys destroyed (crypto-shredding) |
| Access & portability | Self-service export: JSON (complete, schema-documented) + CSV + media + PDF summary |
| Erasure | Per event, per baby, per household, per account. Erasure propagates to processors |
| Rectification | Every field editable. Baby Memory facts editable/deletable |
| DPIA | Required (large-scale special-category data, children). Done before beta |
| Processors | DPAs with hosting, LLM provider (no training on our data, minimal/zero retention, EU processing where offered), push, crash reporting, payments. Sub-processor list public |
| International transfers | EU hosting. Where a processor is outside the EU: adequacy decision / EU-US DPF certification / SCCs + transfer impact assessment |
| Children's rights | We never profile the child for marketing. No automated decisions with legal or similarly significant effect |
| Transparency | Privacy center in-app: what we store, why, who sees it, what the AI receives, plain language first, legal text second |

### 1.3 What the LLM receives

| Sent | Not sent |
|------|----------|
| Pseudonymized utterance (`[B1]` instead of names) | Real names of babies or caregivers |
| Age in weeks, feeding method, configured supplements/formula names | DOB, exact address, contact data |
| Minimal recent-event context (last ~8, short refs) | Full history |
| For Ask: tool results the question needs | Unrelated data domains |
| For health questions: relevant entries the parent asked about | Health data in non-health requests |

Gateway logs store **metadata** (route, latency, token counts, eval tags), not content. Content logging for debugging
requires the opt-in improvement program, and samples are de-identified before review.

### 1.4 Security architecture

- **Encryption in transit:** TLS 1.3, certificate pinning in mobile clients for our API.
- **Encryption at rest:** managed DB/storage encryption + **application-layer envelope encryption** for C3 fields and all media:
  per-household data key (DEK), wrapped by a KMS key-encryption key. Deleting a household destroys its DEK (crypto-shredding covers backups).
- **Device:** SQLite encrypted (SQLCipher) with key in Keychain/Keystore. App lock (Face ID / biometrics) optional. Widgets show no health data on the lock screen by default.
- **Access control:** Postgres RLS by `household_id` on every table + API-level checks. Service roles least-privilege. No human production access without break-glass + audit.
- **Audit log:** append-only, records every read of C3 data by any member, every permission change, every export, every admin access.
- **Media:** EXIF/GPS stripped on device before upload. Signed URLs with short TTL. No public buckets.
- **AppSec:** threat model per release, SAST/dependency scanning, secrets scanning, annual pentest, bug bounty after launch.
- **Abuse cases explicitly modeled:** ex-partner retains access after separation (owner can remove; access-change notifications to all owners),
  coercive control (one parent monitoring the other's caregiving: transparency of who sees what), stolen phone (remote sign-out, app lock).
- **End-to-end encryption?** Not in V1. Server-side AI, predictions, sync validation and reports need plaintext server-side.
  **We must never claim E2EE in marketing.** The honest claim: "Encrypted, EU-hosted, never sold, never used for ads, deletable at any time."
  Revisit E2EE for the *health journal and documents* in V3 (on-device AI only for those).

### 1.5 Commercial privacy commitments (put in the terms, not just marketing)

- No advertising in the app. No ad SDKs.
- No sale or sharing of personal data. No data brokers.
- No targeting based on child or health data, including for our own partner offers.
- Aggregate cohort insights (V3) only with opt-in, k-anonymity thresholds and differential privacy on published statistics.
- Any future research partnership: separate, explicit, per-study consent.

### 1.6 Analytics allowlist (examples)

Allowed: `log_created {channel, route, event_type_category, latency_ms, had_clarification}`, `undo {seconds_since_commit}`,
`screen_view {screen_id}`, `notification_action {type, priority, action}`.
Forbidden: any payload values, amounts, times of care events, free text, names, health categories tied to user IDs.

## 2. AI safety rules (system-level, enforced by architecture)

| Rule | Enforcement |
|------|-------------|
| Never diagnose | System prompt **and** output classifier on chat/ask routes. Diagnostic phrasing ("Das ist wahrscheinlich Neurodermitis") → blocked + regenerate with refusal template. No image interpretation route exists in MVP |
| Never prescribe or invent dosage | No tool or route can create a dose value. `dose_text` only comes from user statement or confirmed document transcription. Output classifier blocks dose recommendations. Dose questions → fixed template: "Zur Dosierung kann ich nichts sagen. Bitte halte dich an die Packungsbeilage/Verordnung oder frag in der Apotheke / beim Kinderarzt." |
| Never override a doctor | Prompt rule + classifier. Parent-entered doctor instructions are shown as stored, never contradicted by the AI |
| Never discourage seeking care | Red-flag engine runs **before** the LLM on every utterance and every chat message. The LLM can't suppress the card |
| No false certainty | Answer templates include uncertainty markers. Predictions always carry confidence. Inferences carry class labels |
| No fabricated sources | Citations are rendered **by the app from knowledge-card metadata**. The LLM can reference card IDs only. Unknown IDs are stripped |
| Community ≠ medical truth | Visual separation + labels (docs/04 §7.4). Community summaries never phrased as recommendations |
| Transparency (EU AI Act Art. 50) | Users are informed they interact with an AI. AI-generated text is labeled where it could be mistaken for human/expert content |
| Crisis content | Postpartum depression / self-harm signals in chat → supportive message + crisis resources for the user's country, no "therapy" by the AI |

## 3. Medical safety architecture

### 3.1 Red-flag engine

Deterministic, versioned, sourced, clinically reviewed rules. Inputs: structured events (temperature, diapers, feeds, symptoms)
+ baby age + keyword/phrase triggers in utterances and chat (DE/EN, including colloquial and Austrian/Swiss variants).

Example rule shape (**thresholds come from the cited guideline and clinical board review. The example only shows structure**):

```yaml
id: rf_fever_young_infant
version: 4
jurisdictions: [AT, DE, CH, EU-default]
condition:
  all:
    - baby.age_days: {lt: 90}
    - event.temperature.celsius: {gte: <threshold from source>}
action:
  level: URGENT
  card: kc_fever_under_3_months
  actions: [call_pediatrician, call_emergency, mark_contacted]
sources: [<national pediatric guideline>, <NICE/AAP equivalent>]
reviewed_by: <clinician>
```

Categories to cover (each needs sourced rules): fever by age band, breathing difficulty keywords, blue/grey color, unresponsiveness/
floppiness, seizure keywords, dehydration signs (reduced wet diapers by age, no tears, sunken fontanelle mentioned), persistent vomiting
(incl. green/bilious keyword), blood in stool/vomit, non-blanching rash keyword, fall from height/head injury, ingestion/poisoning
(→ poison control number for the country), severe jaundice keywords in newborns, pale/white stool in newborns (keyword → "mit Kinderarzt besprechen" level),
inconsolable crying with other signs, suspected allergic reaction after a new food (swelling of face/lips, breathing).

**Behavior:**
- Fires on input, not on inference. Shows in under 1 s, even offline (rules shipped on device).
- Wording: "Ich kann keine Diagnose stellen. Bei [Situation] empfiehlt [Quelle], [Handlung]." + call buttons + country emergency number (144/112/etc.).
- **Recall over precision.** False alarms are acceptable for the URGENT set. Misses aren't. Test suite recall must be 100%. Precision is
  monitored so the card doesn't become wallpaper (tiered: URGENT vs. "Mit Kinderarzt besprechen").
- Logged (C3) for the parent's journal and the doctor report.

### 3.2 Medication safety

- **Plans are only created from explicit parent input, field by field**: name, dose as written, frequency, times, start, end. Each field
  shows its source ("aus Foto der Verordnung", "von dir gesagt") and must be confirmed. Nothing defaults.
- The AI never fills a missing dose. Missing → stays blank → plan can't activate until the parent enters it.
- **No calculators** (weight-based dosing, unit conversions between concentrations). Ever.
- Document extraction from a medication package or prescription: OCR → structured draft → side-by-side with the photo → confirm.
- Adherence view shows what was logged vs. what the *confirmed plan* says. No recommendations about missed doses beyond
  "Bei Fragen zu einer vergessenen Dosis: Packungsbeilage oder Apotheke."
- Medication reminders are clearly marked as aids. The app is not a medication management medical device.

### 3.3 Photo journal policy

- MVP/V2: photos are attached to journal entries, timestamped, viewable side by side over time, includable in reports.
- The AI does **not** analyze medical photos. The UI says so ("Fotos werden nicht von der KI ausgewertet").
- Non-medical photo extraction (documents, food labels, vaccination card OCR) is allowed with confirmation.
- Re-evaluation path for image analysis: regulatory opinion → if pursued, as a separate, certified module (MDR) with clinical evaluation.
  This is a company-level decision, not a feature toggle.

### 3.4 Clinical governance

- **Clinical advisory board** (paid): pediatrician(s), midwife, IBCLC lactation consultant, pediatric nurse. Reviews: knowledge cards,
  red-flag rules, storage rules, prediction priors and wording, safety test suite, incident reports.
- **Content lifecycle:** draft → clinical review → legal/regulatory review → publish with version → scheduled re-review (≤ 12 months) → retire.
- **Incident process:** any reported safety issue (wrong red-flag behavior, harmful AI answer) → triage within 24 h, kill switch per route,
  root cause, test case added, board review.
- **Safety telemetry:** red-flag trigger counts, "Ich habe bereits Kontakt" rates, refusal rates, classifier blocks (counts only, no content).

## 4. Regulatory position

| Regime | Position | Actions |
|--------|----------|---------|
| **EU MDR (2017/745)** | Intended purpose: *documentation, organization and general education for parents. Not intended for diagnosis, prevention, monitoring, prediction, prognosis, treatment or alleviation of disease.* Wellness/lifestyle positioning for sleep/feeding predictions. Red-flag guidance as static, sourced public-health information pointing to professional care | Written regulatory opinion before launch. Intended-purpose statement in the terms, App Store text and UI consistent with it. **Feature changes that touch interpretation (image analysis, symptom triage, intake targets) require a regulatory review gate** |
| **GDPR / national law (DSG in AT, BDSG in DE, revFADP in CH)** | Controller for all user data | DPIA, records of processing, DPO appointment, DPAs |
| **EU AI Act** | Not a high-risk system under the intended purpose above (would change if the product became a medical device). Transparency obligations for AI interaction apply | AI disclosure UX, documentation of models used, human oversight design |
| **DSA** (with community) | Online platform obligations | Notice-and-action, appeals, transparency reports, terms in clear language, measures for minors' protection |
| **Consumer law / subscriptions** | EU consumer rights, auto-renewal transparency, easy cancellation | Clear pricing, cancellation via store, no dark patterns |
| **Apple/Google health policies** | Health data not used for advertising, privacy labels accurate, medical disclaimers | Store review prep |
| **Professional law** (experts, V3) | Telemedicine, professional advertising and title protection rules per country | Country-by-country legal review before enabling experts there |

## 5. Trust UX (how this shows up for the parent)

- **"Was die App über Emma weiß"** (Baby Memory view): every fact, its class and source, editable.
- **"Woher weißt du das?"** on every AI answer → the data points / card + source behind it.
- **Receipts** show interpretation, so errors surface immediately.
- **Privacy center** in plain German: "Was die KI bekommt", "Wer sieht was", "Daten exportieren", "Alles löschen".
- **No dark patterns** in consent: equal-weight buttons, granular, revocable.
