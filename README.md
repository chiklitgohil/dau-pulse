# DAU Pulse

Campus issue reporting for Dhirubhai Ambani University. Students describe a problem in their own words. DAU Pulse sends it to the team that fixes it, groups it with reports from other students, gives it an owner and a deadline, and emails everyone who reported it when it's done.

> v2 is a rebuild of the buildathon prototype (`main`, live at dau-pulse.vercel.app). The prototype stored everything in one Redis key, had no login, and merged duplicates silently with keyword rules. See [docs/ProjectDocumentation.md](docs/ProjectDocumentation.md) for what changed and why.

## What it does

**Students** (Google sign-in, college accounts only)
- Write the problem in any language (English, Hinglish, Gujarati). The AI fills in the category and place, and the student confirms or changes them.
- See similar open issues and tap **"Yes, same problem"** instead of filing a duplicate. More reporters means higher priority.
- Ragging, harassment and other sensitive reports go **only** to the Grievance & Anti-Ragging Committee. These are never on the public board and admins can't see them. A keyword check runs alongside the AI, and crisis language shows the Tele-MANAS helpline straight away.
- Can hide their name from staff, or keep a report off the public board.
- Track everything under **My reports**, and get emailed on every status change.

**Staff** (one team each)
- A queue for their team, sorted by urgency and deadline, with views for "assigned to me", overdue, and search.
- On each issue they can change status (a note is required to resolve or close, and every reporter is emailed), assign it, add internal notes, reclassify or mark it sensitive, and merge duplicates.
- A daily email digest per team. Overdue issues are escalated to admins automatically.

**Admins**: a triage queue for low-confidence AI guesses, people and roles, team email addresses, and an email delivery log.

## Quick start (local)

Requires Node 22+. No Docker or database setup: locally the app runs an embedded Postgres (PGlite) in `./.data/`.

```bash
npm install
cp .env.example .env.local     # set GEMINI_API_KEY; keep AUTH_DEV_LOGIN=true
npm run demo:load              # optional: demo staff/students + a dozen real-pipeline reports
npm run dev
```

Open http://localhost:3000 and use the **Developer login** (local only) with any `@dau.ac.in` email. Emails in `ADMIN_EMAILS` become admins. After `demo:load` you can sign in as `admin@`, `it.staff@`, `grievance@`, `student1@` … `student5@dau.ac.in`. In dev, emails are printed to the server console; the admin "Email log" page shows them too.

## Commands

| | |
|---|---|
| `npm run dev` | App on :3000 (auto-migrates and seeds the local DB) |
| `npm test` | Integration tests on an in-memory Postgres: intake, duplicates, permissions, sensitive routing, merges, outbox, escalation |
| `npm run check` | Typecheck + lint + tests |
| `npm run eval` | Measure the AI on `fixtures/eval/reports.jsonl`: accuracy, sensitive-report recall, calibration, duplicate thresholds. Needs `GEMINI_API_KEY` |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:setup` | Migrate + seed the database in `DATABASE_URL` (or the local one) |
| `npm run db:seed` | Re-apply `src/config/taxonomy.ts` (categories, teams, places) |
| `npm run export:labels` | Export real reports with their final, human-confirmed labels (training/eval data) |

## How it's built

```
src/core/        the product logic, independent of the UI and of any channel
  intake.ts        analyze → (AI + keyword check + similar issues) → submit / join / "me too"
  staff.ts         status, assignment, reclassify, merge (all audited, permission-checked)
  queries.ts       queues and views, with access rules applied in SQL
  permissions.ts   who can see what, in one place
  urgency.ts       urgency is a formula over AI-extracted signals, not an AI guess
  sla.ts           deadlines by urgency
  notify.ts        transactional outbox: emails are queued with the change and retried
  jobs.ts          daily escalation + digests
  ai/              Gemini classifier (model fallbacks, retries) + embeddings; prompt + strict output validation
src/db/          Drizzle schema, migrations in ./drizzle, taxonomy seeding
src/config/      taxonomy.ts: teams, categories, campus places  ← finalise with the administration
src/app/         Next.js pages and server actions (thin: auth check → core → revalidate)
scripts/         migrate, seed, eval, export-labels, load-demo
tests/           vitest integration tests (real Postgres via PGlite, fake AI)
```

Key decisions (details in [docs/ProjectDocumentation.md](docs/ProjectDocumentation.md)):
- **The AI extracts, code decides.** Gemini only picks from fixed lists and reports yes/no signals. Routing, urgency and deadlines are deterministic. Duplicates are suggested and a person confirms them; nothing is merged silently.
- **It works without the AI.** If Gemini is down, the student picks the category, the report is saved, and staff double-check it.
- **Real Postgres with pgvector.** Rows are written in transactions and row locks keep counts exact under concurrency.
- **Channel-agnostic core.** A WhatsApp adapter only needs to call `analyzeReport` / `submitReport`.
- Model choice and when to revisit it: [docs/ModelSelection.md](docs/ModelSelection.md).

## Deploying

See [docs/Deployment.md](docs/Deployment.md). Short version: Vercel (or any Node host) + Postgres with pgvector (Neon or Supabase) + a Google OAuth client restricted to the college Workspace + a **paid** Gemini key + SMTP for email.

## Repository

- **`docs/HANDOFF.md`: start here** if you're picking the project up. It covers status, the decision log, next steps and gotchas.
- `Blog.md`: the buildathon story.
- `assets/`: screenshots of the buildathon prototype.
