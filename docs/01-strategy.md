# 01 — Strategy

Covers deliverables 1 (vision), 2 (USP), 3 (competitive analysis), 26 (App Store positioning),
27 (naming), 28 (brand), 29 (moat), and the critical question from §39 of the brief.

---

## 1. Product vision

**For parents of babies aged 0–24 months** who are exhausted, one-handed and interrupted,
**[product] is a quiet assistant that turns what you say into an organized record of your baby's day**,
remembers everything, anticipates what's next and reminds you of what matters.
**Unlike baby trackers**, which make you fill in forms, it lets you *say it and move on*.

Vision horizon:

| Horizon | What the product is to the parent |
|---------|--------------------------------------|
| Year 1 | "The easiest way to keep track. I just say it." |
| Year 2 | "It knows my baby. It tells me what's likely next and what changed." |
| Year 3+ | "The family's shared memory of our child's first years, plus trusted answers when I'm worried." |

The 0–24 month window is intentional. Tracking intensity drops sharply after the first year.
The long-term value is the **memory** (milestones, health history, documents, reports), which stays relevant
through kindergarten. That's how we keep users past the tracking phase (docs/06, long-term platform).

## 2. Unique selling proposition

**Primary USP (what we say):** *Just say it. We'll keep track.*

**Three proof points (what we show):**

1. **Say it, done.** One sentence, several events, relative times, corrections. *"Sie ist um 7 aufgewacht, hat um halb 8 180 ml getrunken und danach Vitamin D bekommen"* gives three correct entries.
2. **Ask anything about your baby.** Answers from *your* data, with the numbers, in one sentence.
3. **Knows what's next.** A personal next-sleep window with an honest confidence level and a plain-language reason.

**Trust layer (why we can be trusted with it):** EU-hosted, no ads, no selling of data, AI never
diagnoses or doses, every medical statement has a source.

## 3. Competitive analysis

> Method note: below is a qualitative synthesis of publicly known positioning and recurring themes in
> public app-store reviews. Before fundraising or pricing decisions, validate with a structured review-mining
> exercise (≥2,000 reviews per competitor, DE + EN stores, coded by theme). Competitor features change
> often. Treat specifics as "to verify".

### 3.1 Landscape

| App | Positioning | What they do well | Typical weaknesses / user complaints |
|-----|-------------|-------------------|--------------------------------------|
| **Huckleberry** | Sleep-led tracker with nap prediction ("SweetSpot"), paid sleep plans with human consultants, AI Q&A features added | Strong sleep brand, trusted predictions, good multi-caregiver sync, large US user base | Best value is paywalled; predictions feel generic to some users; logging is still tap-heavy; US-centric content |
| **Napper** | Sleep-focused, beautiful design, nap predictions, sleep sounds, courses | Design quality, emotional tone, clear sleep schedule visualization | Narrow (sleep), subscription-heavy, limited feeding/health depth |
| **Nara Baby** | Free, clean, all-in-one tracker | Free and generous, clean UI, caregiver sync, pumping | No real intelligence or prediction, manual logging |
| **Baby Tracker / Baby Daybook** | Comprehensive classic trackers, widgets | Feature completeness, widgets, export, offline | Dense UI, form-driven, ads in free tiers, "spreadsheet feeling" |
| **Cubtale** | Tracker + physical button device | Physical one-press logging (closest to our "zero friction" insight) | Hardware dependency, limited intelligence |
| **Glow Baby** | Part of a fertility→pregnancy→baby suite | Funnel from pregnancy, community | Ad/upsell density. Glow's fertility app was subject to a 2020 California AG privacy settlement, which shows how sensitive this category is |
| **Baby Connect** | Long-standing, daycare-friendly, web access | Multi-caregiver and daycare reporting, very complete | Dated UX, form-heavy |
| **New AI-first trackers** | Voice/chat logging wrappers, mostly small teams | Prove the demand for voice logging | Often an LLM bolted onto a form app. Weak on correctness, offline, safety, privacy and multi-caregiver. No moat |

### 3.2 What is commoditized (table stakes, no differentiation, must still exist)

Timers, logs, history lists, basic charts, dark mode, CSV export, multi-caregiver sync, widgets, growth charts
with WHO percentiles, reminders, multiple babies, basic sleep prediction from age-based wake windows.

### 3.3 What users complain about, across the category (themes to validate)

1. **Too many taps**, especially at night. Timers left running ("she slept 9 hours?" "no, I forgot to stop it").
2. **Paywall frustration**: the useful thing (prediction) is premium. Aggressive upsells.
3. **Sync failures** between caregivers and duplicate entries.
4. **Generic predictions** that ignore the actual baby.
5. **Data is collected but never used.** Charts nobody reads.
6. **Ads** in a context where parents are anxious and sleep-deprived.
7. **Losing history** when switching apps or phones.

### 3.4 Where we can actually differentiate

| Differentiator | Why competitors can't just copy it quickly |
|----------------|---------------------------------------------|
| Extraction accuracy on messy, multilingual, multi-event, corrected speech | Hard engineering + eval data + domain ontology. Wrappers stop at ~80%. Trust needs ~95%+ |
| Silent zero-friction (predicted one-tap actions) | Needs a good prediction model **and** deep OS integration |
| "Ask my data" with grounded numbers | Needs a clean typed event store + query tools, not just an LLM |
| Cross-domain intelligence (sleep × feeding × health × caregiver) | Needs all domains in one structured model. Sleep-only apps can't |
| Provenance-aware Baby Memory (fact vs. inference vs. medical) | Architecture decision from day one, hard to retrofit |
| Privacy-first EU positioning | Credible only if architected that way. US incumbents carry their history |
| German-language quality (DE/AT/CH first) | Most competitors are English-first. Austrian/Swiss German vocabulary is a real edge in the launch market |

## 4. Critical product question: what would make her switch?

Answered in docs/00. The short version: **speed of logging in real conditions + importing her history +
answers instead of charts + family adoption**. The switching moment is usually a **trigger event**:
partner starts helping, return to work, grandparents take over days, a second child, or a frustrating
week with the old app. Marketing and onboarding should target those moments ("Hand over to grandma
without a briefing call").

## 5. Positioning statement

> For exhausted parents who want to stay on top of their baby's day without becoming data-entry clerks,
> [product] is the baby assistant you just talk to. Unlike trackers, it does the logging, remembering
> and anticipating for you, and it never sells your family's data.

## 6. Brand positioning

| Attribute | Means | Doesn't mean |
|-----------|-------|--------------|
| **Calm** | Low visual noise, soft motion, night-adapted | Sleepy, slow |
| **Competent** | Precise numbers, honest confidence, sources | Clinical, cold |
| **Warm** | Human copy, no guilt, no judgment ("Normal days vary.") | Cute, childish, pastel overload |
| **Discreet** | Few notifications, privacy by default | Hidden or opaque |

**Voice & tone rules:**
- Never judge feeding choices (breast/formula/mixed are all first-class).
- Never say "should" about parenting style. Use "might", "many families", "your pediatrician can help decide".
- Never celebrate tracking streaks. This is not a fitness app and the parent is not failing when she stops logging.
- Address the parent as a capable adult. No "mama" infantilization. Gender-neutral by design: fathers, co-parents, adoptive parents.

> Note: the brief says "mother" throughout. The product should be built for *the primary caregiver* plus
> the household. Excluding fathers and same-sex parents in copy costs market share and partner adoption,
> and partner adoption is one of our retention levers.

## 7. Competitive moat

Not every proposed moat item is real. Ranked by actual defensibility:

| Rank | Moat | Real? | Why |
|------|------|-------|-----|
| 1 | **Longitudinal personal data + Baby Memory Graph** | **Strong** | Switching cost grows every day. The history is what makes predictions and answers good. (We still allow full export. A moat built on lock-in by obstruction is not a moat under GDPR.) |
| 2 | **Household network effect** | **Strong** | Each additional caregiver raises the cost of leaving. Grandma won't learn a second app |
| 3 | **Extraction quality + domain eval corpus** | Medium–strong | Our labeled utterance corpus (consented, de-identified) compounds. Competitors start from zero in German |
| 4 | **Predictive personal routine** | Medium | Algorithms are copyable. Calibrated accuracy on our data isn't |
| 5 | **Trust / privacy brand** | Medium | Slow to build, quick to lose. Real in EU markets |
| 6 | **Cohort intelligence** (anonymized aggregate patterns) | Medium, later | Needs scale. Unique because it comes from structured data, not anecdotes |
| 7 | **Health journal + doctor reports** | Weak alone | Feature, not moat. Strengthens #1 |
| 8 | **Community knowledge graph** | Weak early | Communities are winner-take-most and already exist (forums, Facebook, Reddit, Instagram). Only valuable layered on #1 and #6 |
| 9 | **Expert network** | Weak / expensive | Copyable with money, regulated, operationally heavy |

**Conclusion:** the moat is **the family's accumulated, structured, trusted record + the household
using it together**. Every roadmap decision should increase one of these two.

## 8. App Store positioning

- **Category:** Health & Fitness (primary) or Lifestyle. Avoid "Medical": wrong expectations and stricter review.
- **Age rating:** 4+. The *user* is an adult. Not a "Kids category" app (that category has its own rules and isn't meant for parent tools).
- **Title (30 chars):** "[Name]: Baby Tracker by Voice"
- **Subtitle (30 chars):** DE "Einfach sagen. Alles im Blick." / EN "Just say it. We keep track."
- **Keywords:** baby tracker, stillen, schlaf baby, fläschchen, abpumpen, muttermilch, windeln, baby app, nap, feeding, pumping
- **Screenshot story (6 frames):** 1) Lock screen "Emma schläft" → logged; 2) one sentence → three entries; 3) "Wie viel hat sie gestern getrunken?" → answer; 4) next sleep window with confidence; 5) family sharing ("Oma sieht alles"); 6) privacy ("Keine Werbung. Keine Datenverkäufe. EU-Server.")
- **Privacy nutrition label:** aim for "Data Not Used to Track You", minimal "Linked to You".
- **Launch markets:** AT, DE, CH (German first), then UK/IE/Nordics (English), then US. US last because of competition density and different medical guidance (CDC/AAP vs. national EU sources), which the rules engine supports but which needs separate clinical review.

## 9. Product naming

Criteria: short, works in German and English, no common baby name (speech collision), calm not cute,
trademark/domain/App Store availability **must be checked by counsel**. None of these has been checked.

| Name | Rationale | Risk |
|------|-----------|------|
| **Lull** | To lull a baby. Calm, short, voice-friendly | Generic word, likely crowded trademark space |
| **Murmel** | DE: marble / "murmeln" = to murmur, i.e. speak softly. Fits whispered night logging | English speakers read it oddly |
| **Hush** | Night, calm, discreet | Crowded, slightly "silence your child" connotation |
| **Nestling** | Warm, nest = home, family | Long |
| **Kinra** / **Avi** / **Ollo** | Invented, ownable | Need meaning built by brand. Avi is also a name |
| **Saydays** | "Say" + "days": the core action and the memory | Playful, maybe too clever |
| **Little Log** | Explicit | Says "tracker", which we want to escape |

**Recommendation:** shortlist *Lull*, *Murmel*, *Saydays*. Run a 5-second-test with 50 parents in DE/AT
plus trademark screening (EUIPO, WIPO, USPTO) before choosing. The assistant inside the app should **not
have a human name**. A named persona invites anthropomorphism and over-trust in medical contexts.
"Frag [App]" / "Ask [App]" is enough.
