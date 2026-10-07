# 02 — Product

Covers deliverables 4 (feature matrix), 5 (personas), 6 (user journeys), 7 (information architecture),
8 (screen map), 9 (UX flows), plus the home, AI and UI design direction (brief §21–24, §32–36).

> The brief mentions reference screenshots of the parent's current tracker. **None were attached to this
> task.** The design direction below uses what the brief says about them (dark mode, large targets, profile,
> cards, timeline, quick actions). Please add the screenshots to `docs/reference/` for the visual design pass.

---

## 1. Feature matrix

Legend: **Tier** F = free, P = premium. **Release** MVP / V2 / V3 / LT (long-term) / ✗ (cut or redesigned).
**Verdict** is my honest assessment of the brief's feature.

### 1.1 Capture

| Feature | Release | Tier | Verdict |
|---------|---------|------|---------|
| In-app voice logging (DE/EN) | MVP | F | Core. Hold-to-talk *and* tap-to-talk |
| Text logging (chat) | MVP | F | Core |
| Multi-event sentences | MVP | F | Core differentiator |
| Corrections by voice ("nein, 6:45") | MVP | F | Core. Without it, voice logging isn't trustworthy |
| Uncertainty preservation ("ungefähr 150") | MVP | F | Core, cheap to do right |
| **Predicted one-tap actions** (silent mode) | MVP | F | **Added.** Fixes the "talking wakes the baby" problem |
| **Night / whisper mode** | MVP | F | **Added.** Red-shifted dim UI, haptic receipts, whisper-tuned STT |
| Interactive widgets (iOS/Android) | MVP | F | Core to "without opening the app" |
| Live Activity: active sleep / feeding timer | MVP | F | Core. Note iOS caps a Live Activity at ~8 h active, so night sleep needs a renewal strategy (docs/04 §8) |
| Control Center / Action Button control → voice capture | MVP | F | Most reliable iOS "instant voice" path |
| Siri App Shortcuts (entity-based) | MVP (basic) | F | Bonus channel. Not free-form (see docs/00 #5) |
| Apple Watch app | V2 | F | High value for night, but a separate product surface. Ship after the core is stable |
| Wear OS tile | V2 | F | Same |
| Android assistant integration | ✗ / opportunistic | — | Platform APIs too volatile to plan around. Quick Settings tile + widgets instead |
| Push-notification actions ("Gegeben ✓") | MVP | F | Core for vitamin/medication |
| Voice notes (stored audio) | ✗ → transcript only | — | Storing raw audio of a household is a privacy liability. Keep transcripts (with retention limits), discard audio by default |
| **Import from other apps** (CSV/exports) | MVP | F | **Added. Strategic.** Kills switching cost |
| Photo input: documents (doctor note, med package, vaccination card) | V2 | P | Useful. Medication extraction → confirmation gate |
| Photo input: milk-bag label OCR | ✗ | — | Low value. The app *is* the label: it tells you which portion to use |
| Photo input: food (first foods) | V2 | F | Fine. Photo attached to a "first food" event |

### 1.2 Domains

| Feature | Release | Tier | Verdict |
|---------|---------|------|---------|
| Sleep (naps, night, wakings) | MVP | F | Core |
| Breastfeeding (side, duration, switching) | MVP | F | Core |
| Bottle: breast milk / formula | MVP | F | Core |
| Pumping | MVP | F | Core |
| Breast milk inventory (FIFO, rules engine) | MVP | P* | Core for pumping mothers. *Basic list free, rules/expiry warnings premium? See monetization. I recommend **expiry warnings free** because safety features shouldn't be paywalled |
| Formula preparation tracking & discard guidance | MVP (simple) | F | Keep simple: "prepared at", "started at", guidance from rules engine. No brand database in MVP |
| Diapers (wet/dirty, optional color/consistency) | MVP | F | Core |
| Vitamins (e.g. Vitamin D) | MVP | F | Core. Most common daily reminder |
| Medication (parent-configured plans) | MVP (strict) | F | Safety-critical. Confirmation gate, no dose computation |
| Solids / first foods / allergen introductions | V2 | F | Valuable from ~4–6 months. Not needed at launch since most early users are younger |
| Growth (weight, length, head) + WHO percentiles | MVP (basic) | F | Table stakes |
| Milestones | V2 | F | Use sourced milestone frameworks. Avoid "your baby is behind" language. Display ranges, not deadlines |
| Health journal (temperature, symptoms, notes) | MVP (basic) | F | Logging only + deterministic red-flag escalation |
| Photo journal (skin, navel, rash) | V2 | P | **Journaling, not interpretation** (docs/05) |
| AI interpretation of medical photos | ✗ | — | Regulatory trap. Revisit only with a regulatory strategy |
| Vaccinations | V2 | F | Record + national schedule reminders (sourced, per country) |
| Doctor appointments | MVP | F | From natural language ("morgen 14:30 Kinderarzt") |

### 1.3 Intelligence

| Feature | Release | Tier | Verdict |
|---------|---------|------|---------|
| Automatic timeline | MVP | F | Core |
| Calendar (day/week/month) | V2 | F | The **timeline day view covers the MVP need**. A month calendar of baby events is rarely used. Appointments are visible in the timeline + "Upcoming" |
| Next-sleep window (one, with confidence) | MVP | F | Free, so the magic is visible |
| Full-day forecast, explanations, adaptive recalculation | MVP | P | Premium driver |
| Daily briefing | MVP | F (basic) / P (insights) | As home-screen state, not as a push |
| Ask my data | MVP | F (limited/month) / P | Core magic |
| Weekly "what changed" summary | V2 | P | Good. Must answer "what does this mean for me" |
| Smart reminders (contextual) | MVP | F | Core |
| Doctor report (PDF) | V2 | P | High value. Not needed in week one, but strong premium driver. Could move to late MVP if time allows |
| Cross-domain insights ("shorter naps on days with late first feed") | V2 | P | Only with statistical guardrails (docs/03 §6) |
| Cohort insights (anonymized aggregates) | V3 | P | Unique data asset. Strong privacy engineering required |

### 1.4 Social & ecosystem

| Feature | Release | Tier | Verdict |
|---------|---------|------|---------|
| Caregiver sharing (roles, permissions) | MVP | F | Core retention lever. **Never charge per caregiver** |
| Babysitter mode (time-limited invite) | V2 | F | Good |
| Handoff summary ("what grandma needs to know") | MVP | F | **Added.** Cheap, uses existing data, high delight |
| Community (posts, topics, groups) | V2 | F | Only with moderation in place |
| AI community search | V2 | P | Needs corpus first |
| Verified experts | V3 | F to read / P or paid to ask | Expensive and regulated |
| Local parent network | ✗ (re-evaluate V3+) | — | See docs/00 #2 |
| Expert consultations (paid) | LT | Paid | Marketplace. Regulated by country |
| Product partnerships | LT | — | Only with strict separation from health data. **Never** targeted by health/child data |

---

## 2. Personas

### P1 — Lena, 31, first-time mother (primary)
- Linz, on parental leave (Karenz), planning to return to work part-time at 12 months.
- Breastfeeds, pumps once a day so her partner can do a night bottle. Some formula in the evening.
- Phone always in reach, one hand often busy. Uses voice messages a lot. Tired, mildly anxious, googles at night.
- **Job to be done:** "Help me not forget anything and know what's normal for *my* baby, without another chore."
- **Switch trigger:** partner keeps asking when the last feed was. Old app needs 5 taps in the dark.
- **Fear:** that she's doing something wrong. That data about her child ends up somewhere.

### P2 — Tobias, 33, partner (secondary, retention-critical)
- Works full-time. Does the late bottle and weekend mornings.
- Won't learn a complicated app. Will use a widget and say one sentence.
- **Job:** "Tell me what's going on right now so I can take over without asking."

### P3 — Ingrid, 64, grandmother (caregiver, two days a week)
- Android, large font, not comfortable with apps. Comfortable talking.
- **Job:** "Tell me what Emma needs today. Let Lena see what I did."
- Needs: handoff summary, three big buttons, voice, no settings.

### P4 — Sarah & Mehmet, twin parents
- Multi-baby is the whole problem. "Both drank 120" must give two entries.
- **Job:** "Never mix them up. Show both side by side."

### P5 — Dr. Huber, pediatrician (indirect user)
- Sees the doctor report for 10 minutes in a consultation.
- **Job:** "One page, facts, trends, the parent's questions. No AI speculation."

### P6 — Babysitter / daycare (later)
- Temporary, limited permissions, no health history access.

---

## 3. User journeys

### J1 — Onboarding (target: < 90 seconds to first logged event)
1. Open → value screen ("Einfach sagen. Wir behalten den Überblick.") → Sign in with Apple/Google/email.
2. "Erzähl mir von deinem Baby." Mic is open. *"Emma, geboren am 12. Dezember, wird gestillt und bekommt abends manchmal Pre."*
3. AI shows an **editable profile card** (name, DOB, feeding: breast + formula evening). Tap to fix. Confirm.
4. Country/timezone are taken from the device. One sentence explains the region drives health guidance. Editable.
5. "Hast du schon eine andere App benutzt?" → Import (optional, can be done later).
6. Consent screen, layered: required processing / health data (explicit) / optional improvement program (off by default).
7. "Was ist gerade los?" → first log. Show the receipt. Done. Invite partner later (prompted after first day).

### J2 — 03:12, night feed, baby in arms, partner asleep
1. Phone on nightstand, lock screen shows the predicted action button "Stillen starten · rechts" (predicted side = opposite of last).
2. One tap → Live Activity timer runs, red-dim. Haptic receipt. No sound.
3. Switch side: tap "Seite wechseln" on the Live Activity.
4. Done: tap "Beenden". Or, later in the morning, she says *"Heute Nacht hab ich sie um drei gestillt, so 20 Minuten"* and it's logged retroactively. If the timer already captured it, dedupe asks "Meinst du das Stillen um 03:12? Schon gespeichert."

### J3 — Daytime nap cycle
1. 09:00 home screen: "Emma ist seit 2h 10m wach. Nächstes Schlaf-Fenster ca. 09:15–09:40 (hohe Sicherheit)."
2. Optional helpful notification at 09:10 (only if enabled).
3. *"Emma schläft"* → sleep started 09:22, Live Activity starts.
4. *"Sie ist aufgewacht"* → 09:22–10:05, 43 min. Forecast for the rest of the day recalculates: "Kürzerer Schlaf als üblich. Nächstes Fenster früher: 11:50–12:20."

### J4 — Pump and stash
1. *"Hab gerade 120 abgepumpt, kommt in den Kühlschrank."* → Pumping event + milk portion #14, 120 ml, fridge, guidance-based use-by shown with source.
2. Two days later: *"Ich hab die Milch vom Dienstag eingefroren."* → transitions portion #14 fridge→freezer. The rules engine recalculates and notes "previously refrigerated for 2 days" which affects some guidance.
3. Partner: *"Hab ihr 90 von der Kühlschrankmilch gegeben."* → bottle event linked to portion (FIFO suggests oldest). Remaining 30 ml → "Rest aus angefangener Flasche" with the shorter guidance window.

### J5 — Sick day with fever (safety-critical)
1. *"Emma hat 38,4 Fieber."* → temperature entry.
2. **Deterministic red-flag engine** checks age + value. Emma is 10 weeks old, so this matches a sourced urgent rule for infants under 3 months → a full-screen, non-dismissable-by-swipe card: "Bei Babys unter 3 Monaten mit Fieber ab 38 °C empfehlen [Quelle] eine sofortige ärztliche Abklärung." Buttons: call pediatrician (if stored), call emergency number (country-specific: 144 in AT / 112 EU), "Ich habe bereits Kontakt". Shows source and version.
3. No LLM in this path. The LLM can only add the empathetic sentence *around* it, and only after the card renders.
4. Health journal starts an "episode" grouping temperature, medication given (parent-entered), notes.

### J6 — Pediatrician visit
1. Before: notification the day before (appointment from voice). "Fragen für den Termin?" → she dictates questions over the week; they collect on the appointment.
2. *"Bericht für den Kinderarzt erstellen"* → PDF: profile, growth with percentiles, 14-day sleep/feeding/diaper summaries, health episodes, medications/vitamins with adherence, her questions. She picks photos manually. The AI suggests none.
3. After: *"Der Arzt meint, wir sollen das Medikament drei Tage zweimal täglich geben."* → **Medication plan draft** with blank fields she must fill/confirm: name, dose (as written on prescription/package, free text, never computed), times, start, end. Nothing is scheduled until she confirms.

### J7 — Grandma handoff
1. Lena taps "Übergabe an Ingrid" or says *"Oma übernimmt."*
2. Handoff card: last feed (time, amount), last sleep, next likely sleep window, diaper, vitamins done/pending, notes ("Zahnt, mag den kalten Beißring"). Sent as an in-app view (and shareable text if Ingrid doesn't use the app yet. Contains no health history).
3. Ingrid's app: three big buttons (Schlaf / Essen / Windel) + mic. Her logs appear for Lena in real time.

### J8 — Twins
1. *"Beide haben 120 getrunken."* → two bottle entries, one per baby. Receipt shows both names.
2. *"Leo schläft"* while Mia is already sleeping → only Leo's sleep. Home shows two status columns.
3. *"Sie ist aufgewacht"* with both asleep → **must ask**: "Leo oder Mia?" (one tap). We never guess between babies.

---

## 4. Information architecture

```
App
├── Today (Home)
│   ├── Baby switcher (multi-baby: side-by-side status)
│   ├── Now card (current state + timers)
│   ├── Next card (predictions)
│   ├── Attention stack (reminders, expiring milk, red flags, pending confirmations)
│   ├── Today so far (compact summary)
│   └── Recent entries (last 3, tap → timeline)
├── Timeline
│   ├── Day view (default, vertical, swipe between days)
│   ├── Week view (sleep/feeding bands)
│   ├── Filters (sleep, feeding, pumping, diaper, health, meds, appointments, caregiver)
│   └── Entry detail (edit, delete, history of changes, source utterance)
├── [Mic] (global, center. Hold to talk, tap to toggle, long-press = text)
├── Ask
│   ├── Conversation (voice/text/photo)
│   ├── Suggested questions (contextual)
│   ├── Insights (weekly, what changed)
│   └── Reports (doctor report, exports)
└── Family (profile area)
    ├── Babies (profile, Baby Memory view, growth, milestones, health journal, documents)
    ├── Milk & supplies (inventory, formula)
    ├── Reminders & medication plans
    ├── Caregivers & permissions
    ├── Notifications & quiet hours
    ├── Privacy & data (export, delete, consents, AI data use)
    ├── Integrations (import, Apple Health/Health Connect for parent data only, calendar export)
    └── Subscription, Help, Legal

V2 adds a "Community" tab. Family moves to the avatar in the top-left.
```

**Navigation critique:** the brief proposes HOME / TIMELINE / AI / COMMUNITY / PROFILE. Two problems:
(1) AI as a *tab* hides the core interaction behind navigation. Voice must be reachable from everywhere,
so the **mic is the center button**, not a destination. (2) Community in the MVP nav is an empty room.

**MVP nav:** `Today · Timeline · ◉ Mic · Ask · Family`
**V2 nav:** `Today · Timeline · ◉ Mic · Ask · Community` (Family via avatar)

---

## 5. Screen map

| ID | Screen | Notes |
|----|--------|-------|
| ON-1..6 | Welcome, Sign-in, "Tell me about your baby", Profile confirm, Import, Consent | ≤ 6 screens, all skippable except consent and baby name/DOB |
| HO-1 | Today | See §7 |
| HO-2 | Multi-baby Today | Split columns, each baby a color |
| CAP-1 | Voice capture sheet | Live transcript, waveform, release-to-send. Auto-closes on receipt |
| CAP-2 | Receipt toast | "✓ Schlaf gestartet · 20:41 · Emma" + Undo + Edit. 6 s |
| CAP-3 | Clarification chip | One question, 2–4 tap answers + voice |
| CAP-4 | Night mode capture | Red-dim, haptic, no sounds, whisper STT |
| TL-1 | Timeline day | Vertical, time-anchored, sleep as blocks, events as rows |
| TL-2 | Timeline week | Bands for sleep, dots for feeds |
| TL-3 | Entry detail | Fields, provenance, "Gesagt: '…'", edit history, delete |
| ASK-1 | Ask conversation | Voice/text/photo. Answers with inline charts |
| ASK-2 | Insights | Weekly digest cards |
| ASK-3 | Report builder | Range, sections, photos picker, preview, export |
| FAM-1 | Baby profile | Header, key facts, Baby Memory |
| FAM-2 | Baby Memory | Facts grouped by provenance (fact/observation/reported/inferred/medical), editable, deletable |
| FAM-3 | Growth | Chart with WHO percentiles, entries |
| FAM-4 | Health journal | Episodes, temperature chart, photo journal (V2), documents |
| FAM-5 | Milk stash | FIFO list, location tabs, "use first", expiring, history |
| FAM-6 | Reminders | List, recurring, medication plans (separate, with lock icon) |
| FAM-7 | Medication plan confirm | Field-by-field confirmation |
| FAM-8 | Caregivers | Members, roles, invite, handoff |
| FAM-9 | Notifications | Priority levels, quiet hours, per-caregiver "on duty" |
| FAM-10 | Privacy center | Consents, export, delete, AI processing info, retention |
| SAFE-1 | Red-flag escalation card | Full screen, sourced, call buttons |
| SYS-* | Widgets, Live Activities, Controls, Shortcuts, Watch (V2) | docs/04 §8 |

---

## 6. Core UX flows & rules

### 6.1 The logging contract (applies to every channel)

```
utterance/tap ─▶ capture timestamp NOW (on-device, before any network)
             ─▶ extract ─▶ validate ─▶ policy
                                         ├─ high confidence  → commit → receipt (+Undo, +Edit)
                                         ├─ medium           → commit as "unconfirmed" → receipt with subtle "prüfen?"
                                         ├─ low / ambiguous  → ONE clarification (chips + voice)
                                         └─ medication/medical plan → never auto-commit → confirm sheet
```

Rules:
1. **One question max.** If two things are unclear, ask the more important one. Store the other as unknown.
2. **Unknown is allowed.** "Wie viel ungefähr?" can be answered "weiß nicht" and the entry stays valid without an amount.
3. **Never block the parent.** A clarification can be ignored. The event is stored with the gap flagged in the timeline.
4. **Undo is always 1 tap**, and "Rückgängig" / "Nein, das war falsch" by voice works for ~2 minutes in the conversation context.
5. **Corrections edit, never duplicate** (docs/03 §3.5).
6. **Receipts read back the interpretation**, especially times: "Schlaf 20:02–20:32 (30 min)". That's the implicit confirmation.

### 6.2 Silent mode (predicted actions)

Instead of asking the parent to talk, the system offers the **two most likely next actions** based on state and time:

| State | Predicted actions |
|-------|-------------------|
| Baby asleep (timer running) | "Aufgewacht" · "Schläft noch" (no-op) |
| Awake, last breastfeed left, > 2 h ago | "Stillen rechts" · "Fläschchen" |
| Night, after feed | "Windel nass" · "Schläft wieder" |
| Morning, Vitamin D due | "Vitamin D gegeben" |

Shown on lock screen widget, Live Activity, home widget, watch (V2), and as quick chips above the mic.

### 6.3 Night mode

- Auto-activates from quiet hours or ambient light + time. Manual toggle.
- Pure black + dim warm-red/amber accents, minimum brightness, no white flashes (including sheets and keyboards).
- Haptics instead of sounds. Whisper-friendly STT settings (lower VAD threshold, noise suppression).
- Targets ≥ 64 pt. No horizontal swipes required.

### 6.4 Clarification design

Bad: "Bitte gib die Menge in ml an, die Art der Nahrung und die Uhrzeit."
Good: "Wie viel ungefähr?" `[60] [90] [120] [150] [weiß nicht]`, where the chips are *personalized* from her history.

---

## 7. Home screen ("What does my baby need right now?")

Layout, top to bottom (portrait, single column):

```
┌──────────────────────────────────────────┐
│ (avatar) Emma · 10 Wochen        ⚙︎       │  ← baby switcher (tap) / multi-baby
│                                           │
│  ● WACH seit 1h 12m                       │  ← NOW: one state, big
│    zuletzt: 150 ml Pre um 07:30 (1h 05m)  │
│                                           │
│  ┌ ALS NÄCHSTES ───────────────────────┐  │  ← NEXT: prediction + confidence + why
│  │ Schlaf-Fenster  09:15 – 09:40       │  │
│  │ ▮▮▮▯ hohe Sicherheit                 │  │
│  │ "Ähnlich wie an den letzten 5 Tagen" │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ⚑ Vitamin D heute noch nicht       [✓]   │  ← ATTENTION stack, max 3, dismissable
│  ⚑ Milch #12 (Kühlschrank) zuerst nutzen  │
│                                           │
│  HEUTE  😴 2h 10m · 🍼 3× 410 ml · 💧 4    │  ← compact summary, tap → timeline
│                                           │
│  [ Stillen re. ]  [ Fläschchen ]          │  ← predicted actions
│                                           │
│  Today   Timeline    ( ◉ )    Ask  Family │  ← nav, mic center
└──────────────────────────────────────────┘
```

Morning variant (until ~10:00 or first open): the NOW card becomes the **briefing**:
"Guten Morgen, Lena. Emma hat heute Nacht 9h 40m geschlafen, 2× aufgewacht. Letzte Mahlzeit vor 1h 20m."
Then NEXT, then the attention stack (reminders, appointments, milk). No separate briefing screen.

## 8. Design system direction

- **Platform-native first:** SF Pro / Roboto, native sheets and haptics. Apple-quality means respecting the platform, not inventing a new one.
- **Color:** neutral graphite/ivory base. One accent per domain, desaturated: sleep = indigo, feeding = warm amber, pumping/milk = soft rose, diaper = teal, health = coral (**reserved for attention/red flags only**, never decorative).
- **Dark mode default** (the brief's reference app), light mode supported, night mode separate (red-shifted).
- **Type:** large state numerals (tabular figures), Dynamic Type to XXL, everything readable at arm's length.
- **Motion:** slow, calm. Timers breathe rather than tick.
- **Iconography:** simple line icons, no cartoon babies, no pastel clouds.
- **Accessibility:** WCAG 2.2 AA, VoiceOver/TalkBack labels on every chip, one-handed reach (primary actions in bottom 40%).
- **Copy:** short, warm, no exclamation marks, no guilt, no streaks.
