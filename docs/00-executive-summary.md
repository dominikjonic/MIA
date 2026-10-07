# 00 — Executive Summary

## The thesis in one paragraph

Every baby tracker on the market is a database with a form in front of it. Parents quit because
logging is work at the moments they have the least capacity: 3 AM, baby in arms, one hand free.
We build the opposite: **the parent states what happened, in any words, by voice, tap or text, and
the system does the logging, maths, remembering, predicting and reminding.** The product is
measured by one number: **how many daily care events get recorded without opening the app.**

## The answer to "why would she delete Huckleberry / Napper / Nara?"

She won't switch for more features. She already has too many. She switches when **all four** are true:

1. **Logging takes under 3 seconds and works from the lock screen, watch, widget or one sentence.**
   That has to hold at 3 AM in the dark and in silence, not only in a demo.
2. **Her history comes with her.** We import her CSV/exports from the big trackers on day one, so
   predictions and the "Ask" feature are useful from the first minute instead of after two weeks.
   Without import, switching costs win. **Import is a strategic feature, not a nice-to-have.**
3. **The app answers questions instead of showing charts.** "How much did she drink yesterday?",
   "When was the last vitamin D?", "Is she sleeping less than last month?" get one answer in one sentence.
4. **Her partner and her mother actually use it**, because they don't have to learn anything either.
   They talk to it too. Shared state ends the "did you feed her?" texts.

Each of these alone is copyable. Together, on a privacy-first base with a growing personal history,
they make the moat (see docs/01, §7).

## Critical verdicts on the brief

The brief is strong on the core idea and too wide everywhere else. Things I would change:

| # | Brief item | Verdict | What to do instead |
|---|-----------|---------|--------------------|
| 1 | **Voice-first everywhere, "no confirmations"** | Partly wrong. Talking at 3 AM wakes the baby and the partner. "No confirmations" without undo leaves silent errors. | **Multimodal zero-friction**: voice when you can talk, *predicted one-tap actions* when you can't (lock screen, watch, widget). Replace confirmations with a **visible receipt + undo + edit-by-voice**. Confirm explicitly only for medication and low confidence. |
| 2 | **Local parent network** (nearby parents, by district, child age) | **Highest-risk feature in the brief.** Location, child age and daily patterns of vulnerable people in one place makes a stalking and child-safety risk. DSA obligations, moderation cost, reputational blast radius. | Remove from MVP and V2. Re-evaluate in V3 only with verified identities, coarse areas, no schedules, opt-in, and moderation partners, or partner with an existing network. |
| 3 | **Community + AI community search in early versions** | Cold-start problem: AI search over an empty forum is useless. Moderation is a company in itself. | V2 at the earliest. Seed with an **expert-curated knowledge base**. The first "community intelligence" should be **opt-in, anonymized cohort insights from our own structured data** ("Among babies 8–10 months in our data, a temporary 3 AM waking lasting 1–3 weeks was common"). Nobody else has that data. |
| 4 | **Photo AI on rashes, stool, navel** | Regulatory trap. Software that interprets medical images to inform care decisions is likely a medical device under **EU MDR Rule 11** (class IIa or higher). "We only describe" is a thin line. | MVP: **photo journal** (timestamped, tagged, comparable side by side, included in the doctor report). **No AI interpretation of medical images** until there's a written regulatory opinion. Text-based red-flag guidance comes from a curated, sourced rule set and never from image analysis. |
| 5 | **Siri free-form ("Hey Siri, Emma schläft")** | Partly unrealistic. App Shortcuts need the app name in the phrase and support only predefined parameters. Free-form dictation means a follow-up prompt. Android assistant integrations are volatile. | Design for what's reliable: **Action Button / Control Center control → instant voice capture**, interactive widgets, Live Activity buttons, App Shortcuts with a *baby entity* parameter ("Start sleep for Emma in [App]"). Treat Siri as a bonus channel. |
| 6 | **Driving use** | Don't. Neither legally nor ethically defensible. Not a CarPlay category. | Driving mode = nothing. At most, a later passenger handles it. |
| 7 | **"Use-by" for breast milk and formula by country** | Correct direction, wrong promise. The app can't know fridge temperature, door placement or handling. | A versioned, sourced rules engine that outputs **"within guidance from [source, version]"**, never "safe". It shows conservative defaults, the source, the assumptions it made, and never auto-discards. |
| 8 | **Medication & doctor-instruction extraction** | Good if strictly scoped. | The AI may **transcribe** a plan. It never computes, changes or suggests a dose. A medication schedule is only active after explicit field-by-field confirmation. No weight-based dose calculators, ever. |
| 9 | **Verified experts in early versions** | Verification, liability, professional-advertising and telemedicine rules (they differ per country) make this expensive. | V3. Before that, a paid **clinical editorial board** writes and reviews the knowledge cards. That gives the authority without the marketplace. |
| 10 | **33 features, "parenting operating system"** | Focus risk. "OS" is investor language, not parent language. | Position on one promise: **"Just say it."** Everything else is a consequence of that. |
| 11 | **The MVP list (16 items incl. widgets, Siri, caregiver sharing, milk inventory, predictions)** | Too big for a first release *and* missing the most important item (data import). | See the MVP cut in docs/06. Watch, community and photo AI move out. Import, night mode and Live Activity move in. |
| 12 | **Daily briefing as a morning notification** | Becomes noise by week two. | The briefing is the **state of the home screen in the morning**. Push is opt-in and only fires when something is non-routine. |
| 13 | **Name "MIA"** | Mia is one of the most common girl names in Austria and Germany. "Mia hat getrunken" is *literally an example in the brief*. A baby called Mia and an assistant called Mia collide in speech recognition, in conversation and in trademark search. | Keep MIA as the codename only. Naming proposals in docs/01 §9. |
| 14 | **Unlimited LLM use in the free tier** | Unit economics. A frontier model on every log can cost several euros per active user per month. | **Hybrid extraction**: a deterministic on-device fast path for common phrases ("Emma schläft", "nasse Windel"), a small model for the rest, a large model only for chat, reports and ambiguity. See docs/03 §3.6. |

## The MVP in one line

**Talk-or-tap logging (DE/EN) → automatic timeline → sleep, feeding (breast, bottle, formula), pumping, diaper, vitamin
→ milk stash → personal next-sleep window → "Ask my data" → lock-screen and widget logging → partner sharing
→ import from existing apps.** Everything with a privacy and medical-safety base that would survive a
regulator reading it.

## What happens first in engineering

Not the app shell. **An evaluation set of ≥1,000 real-sounding German and English utterances** with expected structured
output, covering relative times, multiple events, corrections, negations, uncertainty, dialects
(Austrian German: "Fläschchen", "Gackerl", "vorhin", "Pre-Nahrung"), and multi-baby cases. If extraction
isn't ≥95% event-level accurate on that set, nothing else matters. See docs/06, Phase 0.
