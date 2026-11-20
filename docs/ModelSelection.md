# DAU Pulse: Model Selection Notes

> **Status (2026-11-18):** We are using **Gemini Flash** (structured output) for v1. The other options below are deferred until we have an evaluation set and labeled data. This doc records the reasoning so we can revisit it then.

## 1. Generative models vs decision models

| | **Generative model (LLM)**: Gemini, GPT, Claude | **Decision / classification model** |
|---|---|---|
| What it outputs | Free text, one word at a time | One option from a fixed list, with a probability for each |
| Example | "This seems to be a Tech Support issue about Wi-Fi…" | `Tech Support: 0.91, Hostel: 0.06, Other: 0.03` |
| Can it go off-script? | Yes, unless forced into a schema | No. It can only pick from the options given |
| Confidence | Not reliable | Built in, and usually meaningful |
| Can it write summaries or replies? | Yes | No |

Our current code (`src/lib/ai.ts`) already uses Gemini *as if* it were a decision model, by forcing JSON with a fixed list of allowed category values.

"Decision model" isn't a new idea. Spam filters, fraud scoring and email sorting have used classification models for decades. The traditional catch is that they need to be **trained on your own labeled examples first**. Newer models like Jev (below) are large, general-purpose classifiers that work without that training.

## 2. Why Gemini for v1

- **No labeled data yet.** Classic classifiers need training data; an LLM works from day one.
- **Messy input.** Students write Hinglish, use typos and put several issues in one message (e.g. *"bhai hostel B ka wifi phir se gaya, kal se"*). Keyword rules break on this.
- **Tiny volume.** A college sends a few hundred reports a day at most, which costs next to nothing on Gemini Flash. A 1–2 second delay is acceptable.
- **One call, several jobs.** Category, location, sensitivity, a neutral summary, and whether a follow-up question is needed.

### Limits on what the LLM decides
The LLM **extracts information**; **code makes the decisions**.

- **LLM returns:** category/subCategory from fixed lists, location from a canonical campus list (or `null`), and yes/no signals: `safetyRisk`, `affectsMany`, `timeSensitive`, `isSensitive`, `needsLocation`, plus `confidence` and a one-sentence `summary`.
- **Code decides:**
  - Urgency is a formula over those signals plus the number of distinct reporters, so it's consistent and explainable to staff.
  - Department routing comes from a category→department table in the DB.
  - Duplicates are suggested by similarity and confirmed by a person. Never merge silently.
  - Low confidence sends the report to a triage queue.
- **People confirm:** on the web form, the AI's guesses are pre-filled and students can change them with one tap. Staff can reclassify in the dashboard. **Every correction is saved as a labeled example.** That's how we build the dataset for the options in section 3.
- **Sensitive reports need a second check:** flag as sensitive if the LLM says so, OR a keyword check matches, OR the student ticks "confidential". Never rely on the LLM alone; a false alarm is cheap, a missed ragging report is not.
- **Privacy:** use the paid Gemini tier, which doesn't train on our data, strip names and phone numbers before the call, and get sign-off from the anti-ragging committee.

## 3. Options compared

| Option | Labeled data needed | Cost per report | Data stays on campus | Handles Hinglish | Fit |
|---|---|---|---|---|---|
| **Gemini Flash with a fixed schema** (current) | None | Almost nothing | No | Good | **Best now** |
| **Jev** (TypeSafe AI) | None | Unknown | No | Unknown | Worth testing against Gemini |
| **SetFit** (few-shot trained classifier) | ~15–20 per sub-category | Free (runs on a CPU) | **Yes** | Good with a multilingual base model | **Best mid-term choice** |
| **Fine-tuned MuRIL / IndicBERT** (models trained on Indian languages) | ~1,000+ | Free | Yes | Very good | Later, if SetFit isn't enough |
| **Embeddings + logistic regression** | ~1,000+ | Almost free | Optional | Depends on the embedding model | Later |
| **Zero-shot NLI classifier** (e.g. `bart-large-mnli`) | None | Free | Yes | Weak | Not recommended |

**About SetFit:** it takes a small open-source sentence model (e.g. a multilingual sentence-transformer) and trains it on as few as 8–20 examples per category. Training takes minutes on a laptop, and the result runs on an ordinary server with no API bill. Complaints never leave our servers, which matters for ragging reports. It also gives real probabilities for the triage threshold.

## 4. Notes on Jev

- A "System One" decision model from TypeSafe AI, released **September 2026**. It takes input plus typed questions and returns one answer per question with **calibrated per-option probabilities**.
- **Good fit:** most of our core consists of exactly these choices (category, location, yes/no signals), and calibrated confidence is exactly what the triage threshold needs.
- **Caveats:**
  - Very new; the accuracy numbers come from the vendor and haven't been independently verified.
  - Hinglish/Gujarati performance is unknown.
  - It **can't write text**, so we'd still need a small generative call for the summary.
  - TypeSafe's docs say input isn't treated as hostile by default, so text inside a message can sway its answer. This matters for a public complaint box.
  - Pricing and data terms still need checking.
  - Pin a specific version; don't use `jev-latest`.

Sources:
- [TypeSafe AI Launches Jev for Structured Software Decisions](https://letsdatascience.com/news/typesafe-ai-launches-jev-decision-model-889a38c0)
- [TypeSafe's JEV Explained (The Neuron)](https://www.theneuron.ai/explainer-articles/typesafe-jev-system-one-models-explained/)
- [What is Jev and how to use it? (nexos.ai)](https://nexos.ai/blog/what-is-jev/)
- [Jev: a new kind of AI model built for decisions (Eden AI)](https://www.edenai.co/post/jev-a-new-kind-of-ai-model-built-for-decisions-not-conversation)
- [Jev AI decision model review (Wavect)](https://wavect.io/blog/jev-ai-decision-model-review.md)
- [Jev and agents (Beam AI)](https://beam.ai/agentic-insights/jev-typesafe-ai-agents)
- [typesafe-jev on Runware](https://runware.ai/models/typesafe-jev)

## 5. When to revisit, and how

**Revisit when:**
- the evaluation set exists (~100 realistic campus messages with expected category, location and duplicate groups, scored by `npm run eval`), **and**
- we've collected ~15–20 labeled examples per sub-category, from staff/student corrections or written by the team.

**Design so switching is cheap:** classification sits behind a single interface, `classify(text, schema) → { answers, confidence }`. Each model is one implementation, so switching is a one-file change.

**Bake-off criteria:** run every candidate on the same eval set and compare:
1. Accuracy (category, sub-category, location, sensitive-flag recall)
2. Calibration: does high confidence actually mean correct?
3. Cost per report
4. Privacy and data terms
5. Latency

**Likely outcome:** SetFit or Jev for the decisions, with Gemini kept only for writing the one-sentence summary.
