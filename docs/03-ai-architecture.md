# 03 — AI Architecture

Covers deliverables 10 (AI architecture), 11 (event schema), 12 (Baby Memory), 13 (prediction),
plus "Ask my baby data" (§11 of the brief), event extraction (§41), the personalization engine (§31) and
the source-based knowledge layer (§30).

---

## 1. Principles (non-negotiable)

1. **The LLM proposes, deterministic code disposes.** The model outputs *operations* in a strict schema
   ([schemas/event-operation.schema.json](../schemas/event-operation.schema.json)). A validator decides what gets written.
   The LLM never has database access.
2. **Time is computed by code, not by the model.** The model labels time *expressions* ("vor 20 Minuten",
   "um halb 8", "nach dem Aufwachen"). A resolver turns them into timestamps relative to the **capture time**.
3. **Babies are resolved by code, not by the model.** Names are matched locally against profiles and aliases.
   Ambiguity → ask. Never guess between children.
4. **Uncertainty is data.** "ungefähr 150" is stored as `{value:150, approx:true}`, not 150.
5. **Predictions and insights are statistics, not LLM output.** The LLM may *phrase* a result. It may not *produce* one.
6. **Medical statements come only from curated, versioned, sourced content.** Red flags are deterministic rules.
7. **Every number shown in an AI answer must come from a tool result** (grounding check, §7).
8. **Minimum necessary context to the LLM.** Pseudonymize names, send only the slice of data needed.

## 2. Layered overview

```
 ┌─────────────────────────── DEVICE ───────────────────────────┐
 │ Capture (mic, tap, widget, intent, notification action)       │
 │   └─ capture_ts, channel, device, caregiver                   │
 │ On-device STT (+ contextual vocabulary: baby names, aliases)  │
 │ Fast-path parser (deterministic grammar, DE/EN)  ──┐          │
 │ Local store (SQLite, offline-first) ◀── sync ──┐   │          │
 └────────────────────────────────────────────────┼───┼──────────┘
                                                  │   │ (if not matched)
 ┌──────────────────────── BACKEND (EU) ──────────┼───▼──────────┐
 │ AI Orchestrator                                                │
 │   ├─ Pre-processor: pseudonymize, normalize numbers/units     │
 │   ├─ Context builder: open sessions, last N events, profile   │
 │   ├─ Router: extraction-small │ extraction-large │ chat │ ask  │
 │   ├─ LLM gateway (provider abstraction, caching, logging-lite)│
 │   ├─ Time resolver (deterministic)                            │
 │   ├─ Baby resolver (deterministic)                            │
 │   ├─ Validator (schema, domain rules, plausibility, perms)    │
 │   └─ Commit policy (auto │ unconfirmed │ clarify │ confirm)   │
 │ Domain services: Event store · Milk inventory · Reminders ·   │
 │   Medication plans · Health journal · Baby Memory             │
 │ Engines: Prediction · Insights · Proactive/Notification ·     │
 │   Guidance rules (milk/formula) · Red-flag rules              │
 │ Knowledge: curated guidance cards (sourced, versioned)        │
 └────────────────────────────────────────────────────────────────┘
```

## 3. Event extraction

### 3.1 Capture and time anchoring

- `capture_ts` is taken **on the device at the moment the user starts speaking/tapping**, before network.
  "Emma schläft jetzt" processed 40 seconds later (bad connection) must still say 20:41, not 20:42.
- Every capture stores `channel` (voice_app, text, widget, live_activity, intent, watch, notification_action, import),
  `caregiver_id`, `device_tz`, and the household timezone.
- **Offline:** if extraction can't run, the transcript + capture_ts are queued, the receipt says
  "Notiert. Wird verarbeitet, sobald du online bist." The fast path still works offline.

### 3.2 Speech-to-text

- **On-device first** (iOS Speech framework / SpeechAnalyzer, Android on-device recognizer): privacy, latency, works offline.
- **Contextual vocabulary:** baby names, nicknames, formula brand the family uses, domain words
  (Pre, HA-Nahrung, Fläschchen, Gackerl, Bäuerchen, Abpumpen, Brust links/rechts).
- **Server STT fallback** (EU-hosted, no retention) only if on-device quality is insufficient for a language/device,
  and only with consent. Raw audio is **never stored by default**.
- Keep the STT n-best / confidence if available. Low STT confidence lowers the commit confidence.

### 3.3 Pre-processing

1. **Baby name pseudonymization:** locally match names/aliases (fuzzy, phonetic: "Lea"/"Leah"; diminutives: "Emmi" → Emma)
   and replace with tokens: `"[B1] hat 180 ml getrunken"`. The mapping never leaves the orchestrator.
   Unmatched capitalized names are flagged (could be a new baby, a caregiver or a STT error).
2. **Number normalization:** "hundertachtzig" → 180, "eins zwanzig" (context-dependent: 120 ml vs 1:20), "halb acht" kept as a time expression.
3. **Language detection** per utterance (households mix DE/EN).

### 3.4 Fast path (deterministic, on-device)

A small grammar handles the most frequent, unambiguous phrases with no LLM call:

| Pattern (DE examples) | Operation |
|-----------------------|-----------|
| `[Baby]? (schläft|ist eingeschlafen)( jetzt)?` | start sleep |
| `[Baby]? (ist )?(wach|aufgewacht)` | end open sleep |
| `(nasse|volle|feuchte) Windel` | diaper |
| `Vitamin D( gegeben)?` | supplement (if a plan exists) |
| `[Baby]? (hat )?(\d+) ?(ml|milliliter) (Pre|Muttermilch|Flasche)?( getrunken)?` | bottle |
| `Stillen (links|rechts)` / `Seite wechseln` | breastfeeding start/switch |

The production share handled by the fast path should be **measured, not assumed**. Design target: the majority of
daily utterances. Anything with relative time, multiple events, negation, hedging or correction words
("nein", "doch", "nicht", "ungefähr", "glaube", "vorhin") **skips the fast path** and goes to the LLM.

### 3.5 LLM extraction

**Input** (system prompt cached; volatile part last):
- Stable: the operation schema, ontology, extraction rules, few-shot examples (DE/EN).
- Per household (cached per session): baby tokens with age in weeks and feeding method, configured supplements,
  formula types in use, milk storage locations.
- Volatile: `capture_ts` (local time + weekday), **open sessions** (e.g. `S1: [B1] sleep since 20:41`),
  **last ~8 events with short refs** (`E1..E8`) so corrections can target them, the last 2 conversation turns, the utterance.

**Output:** a list of operations (see schema), each with:
- `op`: `create` | `update` | `close_session` | `delete` | `query` | `reminder` | `plan_draft` | `clarify` | `none`
- `target_ref` for update/delete/close (`E3`, `S1`)
- `baby_ref` (`B1`, `ALL`, or `UNRESOLVED` + surface form)
- `event_type` + typed payload
- `time`: an **expression object**, not a timestamp:
  `{kind:"now"}`, `{kind:"relative", offset_min:-20}`, `{kind:"clock", hh:7, mm:30, day_hint:"today"|"yesterday"|null}`,
  `{kind:"anchor", relation:"before"|"after", ref:"E2"|"S1"|"sleep_end"...}`, `{kind:"part_of_day", value:"this_morning"}`,
  `{kind:"unknown"}`
- `certainty`: per-field hedging flags (`amount_approx`, `time_approx`, `speaker_unsure`)
- `confidence`: model self-estimate (one input of several, never trusted alone)
- `evidence`: the substring that produced this operation (for receipts and audit)

**Worked example:**

Utterance at 08:52: *"Emma ist um 7 aufgewacht, hat um halb 8 180 Milliliter getrunken und ich habe ihr danach Vitamin D gegeben."*
Context: `S1: [B1] sleep since 19:40 yesterday`.

```json
[
  {"op":"close_session","target_ref":"S1","baby_ref":"B1",
   "time":{"kind":"clock","hh":7,"mm":0,"day_hint":"today"},
   "evidence":"ist um 7 aufgewacht","confidence":0.97},
  {"op":"create","event_type":"bottle_feed","baby_ref":"B1",
   "payload":{"amount_ml":{"value":180,"approx":false},"content":"unspecified"},
   "time":{"kind":"clock","hh":7,"mm":30,"day_hint":"today"},
   "evidence":"um halb 8 180 Milliliter getrunken","confidence":0.95},
  {"op":"create","event_type":"supplement","baby_ref":"B1",
   "payload":{"supplement_key":"vitamin_d"},
   "time":{"kind":"anchor","relation":"after","ref":"op:1"},
   "evidence":"danach Vitamin D gegeben","confidence":0.93}
]
```

The **time resolver** turns `07:00` into today 07:00 local (not 19:00, because "aufgewacht" + morning + capture 08:52),
`anchor after op:1` into ~07:30 + typical feed duration with `time_precision:"approx"`. The **content** of the bottle
is `unspecified` → the validator fills it from the household default (formula "Pre" if that's the only formula in use and
the baby isn't exclusively breast-milk-bottle-fed), marked `inferred:true`, visible and editable on the receipt.

Correction at 08:53: *"Nein, sie ist um 6:45 aufgewacht."* →
`{"op":"update","target_ref":"E_last_wake","patch":{"end_time":{"kind":"clock","hh":6,"mm":45}}}` →
the sleep session's end is updated (new revision, old one retained), duration and day totals recompute.

**Hard cases the eval set must cover:**

| Case | Example | Expected |
|------|---------|----------|
| Negation | "Sie hat *nicht* getrunken, nur gespuckt" | no feed. Optionally a spit-up note |
| Future vs past | "Sie *wird* gleich schlafen" | no event (maybe a hint: "Sag Bescheid, wenn sie schläft") |
| Planned vs done | "Ich *muss* noch Vitamin D geben" | reminder offer, not a supplement event |
| Hedging | "ich glaube so 150" | amount approx |
| Ranges | "zwischen 100 und 120" | value 110, min 100, max 120 |
| Partial consumption | "von 150 hat sie 110 getrunken" | prepared 150, consumed 110, leftover 40 (+ milk/formula leftover rules) |
| Retroactive | "Heute Nacht war sie dreimal wach" | 3 night wakings with unknown times (allowed!) or one summary event |
| Other person | "Oma hat ihr um 3 das Fläschchen gegeben" | caregiver attribution = Oma, logged by Lena |
| Ambiguous baby | twins: "sie ist wach" with both asleep | clarify |
| Unknown baby | "Max hat getrunken" (no Max) | clarify: "Max ist nicht angelegt. Meinst du Emma?" |
| Medication | "Ich hab ihr 2,5 ml Fiebersaft gegeben" | medication_given event, dose **as stated**, no plausibility judgement by LLM; flags if no plan exists |
| Joke / venting | "Sie schläft NIE" | none. Maybe chat |
| Question disguised | "Hat sie schon Vitamin D bekommen?" | query, not an event |

### 3.6 Model routing and cost

| Route | Used for | Model class | Notes |
|-------|----------|-------------|-------|
| `fastpath` | common unambiguous phrases | none (on-device grammar) | free, offline |
| `extract` | everything else in logging | small/fast model with strict structured output | low effort, prompt-cached ontology |
| `extract-escalate` | validator rejects / low confidence / long multi-event | large model | rare |
| `ask` | "Ask my data" with tool calls | large model, low–medium effort | tools = typed query API |
| `chat` | open questions, empathy, knowledge-card retrieval | large model | knowledge-grounded only |
| `report` | doctor report narrative | large model | facts from tools only, batch-able |

Provider: Anthropic Claude via a provider-abstracted gateway. Default model is `claude-opus-5-5` for
`ask`/`chat`/`report`/`extract-escalate`. For `extract`, `claude-haiku-5-5` is the candidate small model.
**Whether it is good enough is decided by the eval set, not assumed.** If it doesn't meet the accuracy bar,
extraction runs on the default model at low effort and the cost model below changes.

Rough order-of-magnitude cost (to re-measure with real traffic): an extraction call is ~3–4k input tokens
(mostly cached ontology/examples) plus ~200–400 output tokens. At list prices that's roughly a tenth of a cent on the small
model and about one cent on the large model. At ~30 LLM-routed logs per active family per day, the large model alone
would cost **several euros per family per month**, which is incompatible with free logging. Hence: fast path first,
small model second, large model only where it earns its cost. Prompt caching on the static prefix is mandatory.

### 3.7 Validation (before anything is written)

1. **Schema validation** (strict).
2. **Reference integrity:** `target_ref` exists and belongs to the household. `baby_ref` resolves.
3. **Permission check:** caregiver role allows this event type for this baby (docs/04 §5).
4. **Time sanity:** not in the future (> 5 min). Not before birth. Sleep end > start. Durations within plausible bounds per type
   (a nap of 9 h at 10 weeks during the day → flag, not reject).
5. **Amount sanity:** per-type plausibility ranges (age-aware). Out-of-range → **clarify**, never silently clamp.
   ("1800 ml?" → "Meintest du 180 ml?")
6. **Session logic:** close requires an open session. Starting sleep while asleep → probably a correction or a duplicate.
7. **Duplicate detection:** same baby, type, within a time/amount window, different caregiver or channel → merge prompt
   ("Tobias hat um 03:10 schon 120 ml eingetragen. Ist das dasselbe?").
8. **Medication guard:** any `medication_given` or `plan_draft` → never auto-commits a *plan*. A single `medication_given`
   entry is stored **as reported** and marked `reported`. If it conflicts with a confirmed plan (e.g. a second dose within the plan's
   interval), it shows the **plan the parent confirmed**, not advice ("Laut deinem Plan: 2× täglich. Heute bereits 2× eingetragen.").

### 3.8 Commit policy

`final_confidence = f(model confidence, STT confidence, validator warnings, route, history-consistency)`

| Band | Behavior |
|------|----------|
| ≥ 0.90 and no warnings | commit, receipt with undo |
| 0.70–0.90 or soft warning | commit as `unconfirmed`, receipt highlights the uncertain field |
| < 0.70, hard warning, ambiguity in baby or type | one clarification |
| medication plan / medical document data | explicit confirm sheet, always |

Thresholds are calibrated against the eval set (reliability diagrams), not set by intuition.

### 3.9 Sessions (sleep, breastfeeding, pumping)

Sessions are first-class: `open → (switch side / pause) → closed`. The system watches for **orphan sessions**
(sleep open for 14 h at 10 weeks; breastfeeding open for 90 min) and asks gently once, through the proactive engine:
"Läuft Emmas Schlaf seit 20:41 noch?" This solves the #1 timer complaint in the category.

## 4. Event schema (domain model)

### 4.1 Envelope (every event)

```json
{
  "id": "evt_01J…",               // ULID, generated on device for offline
  "household_id": "hh_…",
  "baby_id": "bb_…",
  "event_type": "bottle_feed",
  "schema_version": 1,
  "occurred_start": "2026-10-07T07:30:00+02:00",
  "occurred_end": null,
  "time_precision": "exact|approx|part_of_day|unknown",
  "payload": { },                   // typed per event_type
  "status": "committed|unconfirmed|deleted",
  "provenance": {
    "source": "voice|text|tap|widget|live_activity|intent|watch|notification_action|import|photo",
    "kind": "user_reported|observation|ai_inferred|imported|device",
    "utterance_id": "utt_…",
    "evidence": "um halb 8 180 Milliliter getrunken",
    "extraction_route": "fastpath|extract|extract-escalate",
    "model_confidence": 0.95,
    "final_confidence": 0.94,
    "inferred_fields": ["payload.content"]
  },
  "recorded_by": "member_…",        // who logged
  "performed_by": "member_…|external:'Oma'", // who did the care
  "revision": 3,
  "supersedes": "evt_rev_…",
  "recorded_at": "2026-10-07T08:52:14+02:00"
}
```

Bitemporal: `occurred_*` = when it happened, `recorded_at` = when we learned it. Every edit is a new revision.
Nothing is overwritten in place. That's needed for audit, undo, sync conflicts and the trust model.

### 4.2 Event types (MVP) and payloads

| event_type | Payload (key fields) |
|------------|----------------------|
| `sleep` (session) | `kind: nap|night|auto`, `location?`, `wakings?` (night sub-events), `fell_asleep_how?` (optional, never required) |
| `night_waking` | `duration_min?`, `resettled_by?` |
| `breastfeed` (session) | `segments:[{side:left|right, start, end}]`, `last_side` |
| `bottle_feed` | `content: breast_milk|formula|mixed|unspecified`, `formula_product_id?`, `prepared_ml?`, `amount_ml:{value,approx,min,max}`, `milk_portion_ids?`, `leftover_ml?` |
| `pumping` (session or point) | `left_ml?`, `right_ml?`, `total_ml`, `destination: fed_now|fridge|freezer|discarded`, `portion_id?` |
| `milk_transition` | `portion_id`, `from`, `to: fridge|freezer|thawing|room|warmed|feeding|discarded|used` |
| `formula_prep` | `product_id?`, `prepared_ml`, `prepared_at`, `feeding_started_at?`, `stored: room|fridge` |
| `diaper` | `wet: bool`, `dirty: bool`, `stool_color?`, `stool_consistency?`, `note?` |
| `supplement` | `supplement_key` (vitamin_d, …), `plan_id?` |
| `medication_given` | `medication_name_text`, `dose_text` (as reported), `plan_id?`, `route_text?` |
| `temperature` | `celsius`, `method?` (rectal/ear/forehead/axillary) |
| `symptom` | `symptom_key` (from controlled vocabulary) + `free_text`, `severity_reported?` |
| `growth` | `weight_g?`, `length_cm?`, `head_cm?`, `measured_by: home|clinic` |
| `appointment` | `kind: pediatrician|vaccination|midwife|other`, `title`, `starts_at`, `location_text?` |
| `note` | free text, tags |
| `milestone` (V2) | `milestone_key`, `first_observed` |
| `solid_food` (V2) | `food_key`, `first_time: bool`, `allergen_flags`, `reaction_note?` |

The controlled vocabularies (symptoms, stool colors, supplements, foods) are versioned and localized.

### 4.3 Operation schema (LLM output)

See [schemas/event-operation.schema.json](../schemas/event-operation.schema.json). The LLM outputs **operations**,
the validator turns them into **events**. Keeping these separate is what lets us change the domain model
without retraining prompts, and audit what the AI *proposed* vs. what was *written*.

## 5. Baby Memory architecture

Three layers. Only the top one is "memory" in the LLM sense.

```
Layer 3  MEMORY FACTS     small, curated, provenance-typed statements   ← used in prompts, shown to parent
Layer 2  DERIVED STATE    aggregates, baselines, patterns, open sessions ← computed, cached, recomputable
Layer 1  EVENT LOG        bitemporal, append-only revisions             ← source of truth
```

### 5.1 Memory facts

```json
{
  "id": "mf_…",
  "baby_id": "bb_…",
  "key": "feeding.formula.product",
  "value": "Aptamil Pre",
  "class": "FACT|OBSERVATION|USER_REPORTED|AI_INFERENCE|MEDICAL",
  "source": {"type":"event|utterance|document|computation|profile", "ref":"…"},
  "valid_from": "2026-09-01", "valid_to": null,
  "confidence": 0.9,
  "visibility": "household|restricted_medical",
  "confirmed_by_parent": true,
  "last_verified_at": "…"
}
```

| Class | Meaning | Example | Can the AI create it? |
|-------|---------|---------|-------------------------|
| `FACT` | Structural truth set by parent | DOB, name, sex | Only from confirmed onboarding/profile |
| `OBSERVATION` | Computed from logged data | "Median morning bottle (06–10h), last 14 days: 180 ml" | Yes, from derived state, with window + n |
| `USER_REPORTED` | Parent said it, not verified | "Mag den kalten Beißring" | Yes, from utterances |
| `AI_INFERENCE` | Pattern hypothesis | "Naps seem longer after outdoor walks (weak evidence, n=9)" | Yes, **always labeled, never phrased as fact** |
| `MEDICAL` | From a clinician or document | "Diagnosed cow's milk protein allergy (per pediatrician, 2026-09-14)" | **Never inferred.** Only from parent statement or confirmed document, labeled with source |

**Rules:**
- A memory fact without a source doesn't exist.
- An `AI_INFERENCE` can never be promoted to `MEDICAL`.
- Allergies, diagnoses and medications are `MEDICAL` or `USER_REPORTED`, never `AI_INFERENCE`.
- Parents can see, edit and delete every memory fact (FAM-2 "Was die App über Emma weiß").
- Facts expire or get re-verified: "Emma bekommt Pre" from 4 months ago is re-checked when feeding data contradicts it.

### 5.2 Derived state

Recomputed incrementally on each committed event, idempotent (a full recompute from the log must give the same result):
- Open sessions, last-of-each-type
- Daily aggregates (sleep total day/night, feeds count/volume, diapers wet/dirty, pumping volume)
- Rolling baselines (7/14/28 days): wake windows by nap index, nap lengths, night sleep, feed intervals, volumes by daypart
- Change detection: z-scores / robust deviations vs. baseline (feeds insights and "what changed this week")
- Inventory state (milk, formula prep)

### 5.3 How memory is used by the LLM

No "dump everything into the prompt". The context builder selects:
1. Profile essentials (age in weeks, feeding method, configured supplements/formula). Always.
2. Facts relevant to the intent (feeding question → feeding facts).
3. For "Ask": nothing pre-loaded. The model calls typed tools (§7).

## 6. Prediction architecture

### 6.1 Sleep: next sleep window

**Model:** hierarchical Bayesian estimate of the next **wake window** (time from wake to next sleep onset).

- **Prior:** age-based wake-window distribution per nap index. Initial values from published pediatric sleep
  literature/guidance, documented with source, **reviewed by the clinical board**, and continually re-estimated from consenting users' aggregate data.
- **Likelihood / personalization:** the baby's recent wake windows for the same nap index (exponentially weighted, half-life ~4–5 days,
  so a developmental shift is picked up within a week).
- **Covariates (adjustments, small and regularized):** preceding nap duration (short nap → shorter next window),
  night sleep quality for the first window, wake-up time deviation, time of day (circadian anchor for bedtime),
  sleep-pressure proxy (total day sleep so far vs. baseline).
- **Output:** predictive distribution → window = central 50% interval (displayed), plus median.
  Confidence label from interval width + amount of recent data + recent prediction hit-rate:
  `hoch` / `mittel` / `niedrig`. If too low (newborn, too little data, chaotic week), **show a range and say why**
  instead of a fake-precise window.
- **Bedtime model:** separate, anchored to clock time + last-nap end + day sleep total.
- **Recalculation:** on every relevant event (wake, sleep, feed), cheap (milliseconds), runs on device *and* server
  (device for offline/widgets, server as reference). Same code (shared TypeScript package, see docs/04).

**Explanation** ("Reasoning in parent-friendly language"): generated from **templates fed by the model's
top contributing factors**, not by free LLM text. Example:
"Etwas früher als sonst, weil der letzte Schlaf mit 35 Minuten kürzer war als üblich (Ø 1h 10m)."

**Newborn rule:** under ~8 weeks, sleep is not well organized yet. Show "Wach seit…" and a broad, age-typical range with
`niedrig`, plus education. No precise windows. Honest beats impressive.

**Evaluation (built before launch, monitored after):**
- Hit-rate: % of actual sleep onsets inside the displayed window (target calibrated ≈ 50% for a 50% interval. Above that, our
  windows are too wide; below, overconfident).
- Mean absolute error of the median.
- Calibration per confidence label (does `hoch` really hit more often?).
- Backtest on imported histories (consented) before showing to users.

**Language rule:** never "optimal", "perfect", "best time". Use "wahrscheinliches Schlaf-Fenster" / "likely sleep window".
The prediction describes the baby. It's not a prescription for the parent.

### 6.2 Feeding

- Next feed estimate (interval model per daypart, similar structure). Shown as "üblicherweise in ~2–3 h", lower prominence than sleep.
- Volume baselines by daypart (powers "Wie viel trinkt Emma morgens?").
- **No intake targets** ("she should drink X ml"). That's clinical territory. Only "her usual" from her data.

### 6.3 Other

- Pumping: typical output per session/time of day, stash projection ("Vorrat reicht bei aktuellem Verbrauch ca. 2 Tage").
- Diapers: baseline counts. Deviation surfaces in the attention stack only when a **sourced rule** covers it
  (e.g. reduced wet diapers in young infants is a recognized dehydration warning sign → red-flag engine, not the predictor).

### 6.4 Insights guardrails

Cross-domain "insights" are where AI products embarrass themselves with spurious correlations. Rules:
- Minimum n, minimum effect size, multiple-comparison correction across tested hypotheses.
- Only pre-registered insight templates (a few dozen meaningful hypotheses), no open-ended correlation mining shown to users.
- Always shown as `AI_INFERENCE` with strength ("schwacher Hinweis", "deutliches Muster") and the data behind it.
- Never insights on health/medication causality ("the medication made her sleep worse"). That's for the doctor.

## 7. "Ask my baby data"

### 7.1 Mechanism

The `ask` route gives the model **typed, read-only tools**. Never raw SQL.

| Tool | Example use |
|------|-------------|
| `get_last(baby, event_type, filters)` | "Wann hat sie zuletzt getrunken?" |
| `aggregate(baby, event_type, metric, range, group_by)` | "Wie viel hat sie gestern getrunken?", "Schlaf letzte 7 Tage" |
| `compare_periods(baby, metric, range_a, range_b)` | "Schläft sie weniger als letzten Monat?" |
| `list_events(baby, types, range, limit)` | "Was war heute Nacht?" |
| `get_inventory(type, location)` | "Wie viel Milch ist im Kühlschrank?" |
| `get_baseline(baby, metric, daypart)` | "Wie viel trinkt sie normalerweise morgens?" |
| `get_changes(baby, range)` | "Was hat sich diese Woche verändert?" (from change detection) |
| `get_plan_adherence(baby, plan)` | "Wann hat sie zuletzt Vitamin D bekommen?" |
| `render_chart(spec)` | Returns a chart spec the client renders natively |

Tools enforce permissions (a babysitter's Ask can't read medical data), time zones and the household scope server-side.

### 7.2 Grounding check

After the model drafts an answer, a verifier extracts every number/time/date from the text and checks it against
the tool results of that turn (with unit/rounding tolerance). Any ungrounded number → regenerate once → if still failing,
return a templated answer from the tool result. **We'd rather be boring than wrong.**

### 7.3 Answer format

- First sentence answers the question with the number.
- Second sentence gives context from her baseline if useful.
- Chart only if the question is about a trend or comparison.
- Data gaps are stated ("Für Dienstag fehlen Einträge zwischen 13 und 18 Uhr.").
- "Normal?" questions are answered with **her baby's** pattern plus, where available, a **curated knowledge card** with source.
  Never a population judgment generated by the LLM.

## 8. Knowledge layer and rules engines

### 8.1 Guidance cards (education)

```yaml
id: kc_fever_under_3_months
version: 3
jurisdictions: [AT, DE, CH, EU-default]
language: de
title: Fieber bei Babys unter 3 Monaten
body_md: …
sources:
  - publisher: <national pediatric society / public health authority>
    title: …
    url: …
    published: 2025-xx
    accessed: 2026-xx
reviewed_by: <clinical board member, qualification>
review_date: 2026-xx
next_review: 2027-xx
risk_level: red_flag
```

- Written/adapted by humans, reviewed by the clinical board, versioned, jurisdiction-tagged.
- The `chat` route retrieves cards (hybrid search) and may **only** paraphrase/quote them, with the citation rendered by the app
  from card metadata, never from LLM-generated references. No card → "Dazu habe ich keine geprüfte Information. Frag am besten…"
- Source hierarchy: national authority of the user's country > national pediatric society > WHO > other authorities (CDC, NHS)
  > peer-reviewed literature (curated by board).

### 8.2 Storage-guidance rules engine (milk and formula)

Declarative, versioned rule sets per jurisdiction. Example structure (**values are placeholders, to be filled from
the cited source and verified by the clinical board. Do not ship these numbers**):

```yaml
ruleset: breastmilk_storage
jurisdiction: AT
version: 2026.1
source: {publisher: "…", url: "…", published: "…"}
rules:
  - state: freshly_expressed
    location: fridge
    max_hours: <from source>
    assumptions: ["Kühlschranktemperatur ≤ 4 °C", "hinten im Kühlschrank, nicht in der Tür"]
  - state: thawed
    location: fridge
    max_hours: <from source>
    refreeze: false
  - state: feeding_started   # baby drank from the bottle
    max_hours: <from source>
  # … previously frozen, warmed, room temp, etc.
fallback: most_conservative_matching_rule
```

- The engine computes `use_by` = earliest deadline over all applicable rules given the portion's **state history**
  (fresh → fridge → freezer → thawed → warmed).
- Unknown state → most conservative rule + "Annahme: …" shown.
- UI says "Laut [Quelle] innerhalb der Empfehlung bis Do 14:30", never "sicher".
- Jurisdiction differences (e.g. fridge storage durations differ between some national authorities) are shown transparently
  if the user asks why.
- Same structure for prepared formula (preparation, room temperature, after feeding started, refrigerated), sourced from
  WHO/national guidance and the product's own instructions where the parent records them.

### 8.3 Red-flag engine

Deterministic rules over structured data + controlled-vocabulary symptoms + keyword triggers on utterances.
Detailed in docs/05 §3. The LLM is never in the decision path.

## 9. Proactive engine (personalization in action)

A rule-and-schedule engine (not an LLM loop) evaluates **triggers** on state changes and on a timer:

| Trigger | Output | Priority |
|---------|--------|----------|
| Next sleep window starts within 15 min (if enabled) | helpful nudge | HELPFUL |
| Session open implausibly long | check question | IMPORTANT |
| Supplement/medication plan due & not logged | reminder with action buttons | IMPORTANT (med) / HELPFUL (vit) |
| Milk portion reaches "use first" / near use-by | stash notice | HELPFUL → IMPORTANT near deadline |
| Red-flag rule match | escalation card + push | URGENT |
| Appointment tomorrow | reminder + "questions to ask?" | HELPFUL |
| Weekly changes detected | insight digest | OPTIONAL |
| Caregiver handoff | summary to new on-duty caregiver | HELPFUL |

The LLM is only used to **phrase** the weekly digest from structured findings. Timing, triggering and priority are code.

## 10. Evaluation & monitoring

- **Eval sets (versioned, in repo, synthetic + consented real):** extraction (≥1,000 → 5,000 utterances), corrections,
  multi-baby, clarification decisions, Ask grounding (question + fixture DB + expected answer), safety (red-flag recall must be 100% on the
  test suite. Any miss blocks a release).
- **Metrics:** event-level precision/recall/F1, field accuracy (type, baby, time ±2 min, amount), clarification rate,
  false-commit rate, correction rate in production (implicit label), grounding failure rate, latency p50/p95 (target receipt < 1.5 s
  for fast path, < 3 s for LLM path).
- **Production feedback loop:** undo/edit within 10 min = probable extraction error → (with consent) de-identified into the review queue → new eval cases.
- **Model/prompt changes** go through the eval gate in CI. No silent model upgrades.
