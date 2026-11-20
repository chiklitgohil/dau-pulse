# DAU Pulse: Handoff & Status

_Last updated: 2026-11-20. Branch: `rebuild/v1`._

This file is for whoever picks the project up next: you later, a teammate, or an AI assistant. Read it first. It says why things are the way they are, what state they're in, and what to do next.

Related docs:
- [ProjectDocumentation.md](ProjectDocumentation.md): architecture, data model and rules in detail.
- [Deployment.md](Deployment.md): how to put it in production, and the go-live checklist.
- [ModelSelection.md](ModelSelection.md): why Gemini, the alternatives (Jev, SetFit, MuRIL…), and when to revisit.
- [../README.md](../README.md): quick start and commands.

---

## 1. What we're building and why

**Problem:** campus complaints are scattered across class reps, emails and WhatsApp groups. Nobody owns them, duplicates pile up, and students never hear back.

**Goal:** a service the college can actually run. Students report in their own words, each report reaches the team that fixes it, duplicates are grouped, every issue has an owner and a deadline, and students are told what was done.

**Key insight behind the redesign:** the hard part is accountability and closing the loop, not the AI. So the AI only extracts information and code makes the decisions. Students confirm duplicates themselves ("Yes, same problem"), and nothing is merged silently.

## 2. How we got here (decision log)

| Date | Decision | Reason |
|---|---|---|
| 2026-11-18 | Rebuild instead of patching the buildathon prototype (`main`) | The prototype kept the whole DB in one Redis key (lost writes under load), had no auth (ragging reports were public), and an unauthenticated webhook |
| 2026-11-18 | **Processing core first, channel later**; web first, WhatsApp later as a thin adapter | User's call: "the underlying processing … is the real deal". WhatsApp also needs Meta business verification and paid templates |
| 2026-11-18 | **Google Workspace SSO** | The college already uses Google Workspace; this gives verified students, abuse control and anonymous-but-accountable reports |
| 2026-11-18 | **Gemini for v1** classification; decision models (Jev) and small trained models (SetFit/MuRIL) deferred | No labelled data yet; Hinglish input; tiny volume. Revisit with the eval harness once there is real data. See ModelSelection.md |
| 2026-11-20 | Postgres + pgvector via Drizzle; **PGlite** (embedded Postgres) for local dev and tests | No Docker needed; tests run real SQL. Production uses any Postgres with pgvector (Neon, Supabase, college server) |
| 2026-11-20 | Auth.js (`next-auth@5.0.0-beta.32`) with JWT sessions, plus a dev-only email login | No auth tables needed; the user is reloaded from the DB on every request so role changes apply instantly |
| 2026-11-20 | Taxonomy organised by **who fixes it** (Estate, IT, Hostel Office, Mess…), not by committee names | Routing has to reach the people who act. Still a placeholder, see §6 |
| 2026-11-20 | Sensitive = AI flag **OR** keyword tripwire **OR** student picks Grievance; visible only to the Grievance committee (not admins) | A missed ragging report costs far more than a false alarm |

## 3. Current state

**Built and working** (all on `rebuild/v1`):
- Student flow: write the problem → AI suggests category and place → similar open issues shown → "same problem" or new → tracking page. Also the campus board with "Me too", and My reports.
- Staff: team queue (views, filters, search, deadlines, urgency), issue page (status with a note to students, assign, internal notes, reclassify / mark sensitive, merge duplicates).
- Admin: triage view, people & roles, team email addresses, email log.
- Email outbox with retries; daily digest + escalation of overdue issues; `/api/health`.
- **AI backfill:** reports filed while Gemini was down get their title, summary and embedding filled in later (runs after submits and from the cron routes).
- Graceful degradation: if every model fails, the student picks the category and nothing is lost.
- Scripts: `eval`, `export:labels`, `demo:load`, `db:*`.

**Verified:**
- 63 tests pass (`npm test`), plus typecheck, lint and `next build`.
- In a browser (2026-11-20): dev sign-in, a report submitted while the AI was down, a staff status change, emails reaching the outbox, and backfill turning Hinglish into "Wi-Fi down in Hostel B" with an English summary.

**Not yet verified:**
- **AI accuracy at scale.** The full eval (96 messages) was blocked by free-tier quota: 83 calls got 429. The 13 that ran were 100% correct on category, subcategory and place, with p50 latency around 1 s. That isn't enough data to trust.
- **The "same problem?" suggestion in the browser,** with two students reporting the same thing. It is covered by integration tests with a fake AI, but hasn't been tried with real Gemini in the UI.
- **Duplicate thresholds** (`strongMatch 0.90`, `possibleMatch 0.84` in `src/core/types.ts`) are provisional, based on about 16 pairs. Same-issue pairs scored 0.83–0.95; unrelated ones about 0.77.
- **The keyword tripwire** now catches 10/10 sensitive eval examples with 0 false alarms, but it was tuned on those same examples. It needs **new, held-out** sensitive phrasings to measure real recall.

## 4. Do this next (in order)

1. **When the Gemini quota resets** (daily on the free tier), or with a paid key:
   ```bash
   npm run eval                       # free tier: paced at 9 requests/min by default
   npm run eval -- --rpm 0 --strict   # paid key: full speed, fails if below the bar
   ```
   Check: routed-category accuracy ≥ 85%, sensitive recall 100%, and the suggested duplicate thresholds. If they differ, update `strongMatch` / `possibleMatch` in `src/core/types.ts`.
2. **Browser-check duplicate suggestions:** `npm run demo:load` (with the dev server stopped), then `npm run dev`, sign in as `student4@dau.ac.in`, and report "wifi not working in hostel B". You should see "Already reported?" with DP-100x.
3. **Write 20–30 new sensitive and borderline examples** (don't reuse the eval set) and check the tripwire and the AI on them. Add them to `fixtures/eval/reports.jsonl`.
4. **Get a paid Gemini key** from a college-owned Google Cloud project. Free tier: tiny quota, and prompts may be used by Google.
5. Work through the **go-live checklist** in [Deployment.md](Deployment.md) with the administration (see §6).

Later, roughly by value:
- Let staff edit an issue's title and summary.
- Analytics page (by team and month, time to resolve).
- Photo attachments.
- WhatsApp adapter (plan in ProjectDocumentation.md §4).
- Model bake-off once about 15–20 real labelled reports per subcategory exist (`npm run export:labels`).

## 5. Gotchas (things that cost time)

- **Two env files:** `.env` has an **invalid** Gemini key; the valid one is in `.env.local`. Next.js and the scripts give `.env.local` priority. Don't commit either; both are gitignored.
- **Gemini free tier:** about 10 requests/min per model and a small daily cap. `gemini-3.x` models often return 503 "high demand". The classifier falls back through `GEMINI_MODELS` in order.
- `gemini-2.5-flash-lite` is **retired for new users** (404). The defaults use `gemini-3.1-flash-lite` instead.
- The `@google/genai` v3 SDK defaults to API v1, where JSON mode fails. We pass `apiVersion: 'v1beta'`.
- `gemini-embedding-2` returns **one** embedding for several inputs; we use `gemini-embedding-001`, which batches. Embeddings have a **separate quota** from classification, so one can fail while the other works.
- **PGlite allows one process at a time.** Stop `npm run dev` before `npm run demo:load`, `db:seed` or `export:labels` against the local DB (`./.data/pglite`).
- PGlite's pgvector lives in the separate package `@electric-sql/pglite-pgvector`, and PGlite takes `new PGlite({ dataDir, extensions })` (an options object).
- Next 16 removed `next lint`; we run `eslint .` directly. Turbopack is the default.
- `next-auth` v5 is still a beta (pinned to `5.0.0-beta.32`). JWT type augmentation goes in `@auth/core/jwt`.
- Vercel Hobby only allows daily crons. On a paid plan, run `/api/cron/outbox` every 10 minutes (email retries + AI backfill).
- Tests freeze the clock at real "now"; DB defaults use the DB clock (see the comment in the outbox test).

## 6. Open questions for the college (they block launch, not code)

1. **Taxonomy:** which teams exist, what each one owns, and the real building names students use. Edit `src/config/taxonomy.ts`, then run `npm run db:seed`.
2. **Grievance committee:** who's on it, how anonymous reports are handled, and whether admins should ever see sensitive issues (currently: no).
3. **Accounts the college must own:** Google Cloud project (OAuth client + paid Gemini key), Postgres host, app host and domain, an SMTP mailbox like `pulse@dau.ac.in`.
4. **Sponsor:** someone in administration (Dean of Students / Registrar) who requires teams to use the queue.

## 7. Running it locally (short)

```bash
npm install
cp .env.example .env.local      # put GEMINI_API_KEY in; AUTH_DEV_LOGIN=true; ADMIN_EMAILS=admin@dau.ac.in
npm run demo:load               # optional demo users + reports (uses Gemini, slow on free tier)
npm run dev                     # http://localhost:3000 → "Developer login"
npm run check                   # typecheck + lint + tests
```

## 8. Resuming with an AI assistant

Paste something like:

> Read docs/HANDOFF.md, docs/ProjectDocumentation.md and docs/ModelSelection.md in this repo. We're on branch `rebuild/v1`. Continue from "Do this next" in HANDOFF.md. Run `npm run check` first to confirm everything is green.

Keep this file updated whenever something important changes (decisions, status, gotchas).
