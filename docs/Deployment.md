# Deploying DAU Pulse

Production needs five things: a Node host, Postgres with pgvector, a Google OAuth client, a Gemini key, and SMTP. The college should own every one of these accounts (not a student's personal account) so the service survives graduations.

## 1. Database: Postgres with pgvector

Any of these work, because the app uses plain Postgres:
- **Neon** or **Supabase** (managed; both have pgvector). Use the **pooled** connection string. Prepared statements are disabled, so transaction-mode poolers are fine.
- The college's own Postgres 15+ server with the `vector` extension installed.

```bash
DATABASE_URL=postgres://… npm run db:setup     # applies ./drizzle migrations + seeds the taxonomy
```

Run `npm run db:migrate` again after every deploy that adds a migration. It's idempotent, so it can run as a build or release step.

**Backups:** turn on point-in-time recovery (Neon/Supabase do this by default on paid plans). The database is the system of record for complaints, including grievance cases.

## 2. Google sign-in (Workspace only)

1. In Google Cloud Console (a project owned by the college IT account), go to **APIs & Services → OAuth consent screen**. Choose **Internal** if the project is inside the college Workspace; that alone blocks outside accounts.
2. Go to **Credentials → Create OAuth client ID → Web application**, and add the redirect URI `https://<your-domain>/api/auth/callback/google`.
3. Set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN=dau.ac.in`, and `AUTH_SECRET` (generate it with `npx auth secret`).
4. Set `ADMIN_EMAILS` to the first admin(s). They can make other people staff from **People** in the app.

Sign-in is checked server-side as well: the Google account must have a verified email and the Workspace `hd` claim must match `ALLOWED_EMAIL_DOMAIN`. Accounts outside the domain need to be listed in `EXTRA_ALLOWED_EMAILS` (e.g. a mess contractor). `AUTH_DEV_LOGIN` is ignored in production.

## 3. Gemini

- Use a **paid** (billing-enabled) API key from a college-owned Google Cloud project. Free-tier keys hit 429 rate limits almost straight away, and Google may use free-tier prompts to improve its products. Prompts here contain student complaints, so a paid key matters for privacy too.
- `GEMINI_MODELS` is an ordered fallback list. If the first model is overloaded or rate-limited, the next one is tried. If all fail, the report is still saved, the student picks the category, and staff confirm it.
- Personal data (phone numbers, emails, long ID numbers, the reporter's name) is stripped before text is sent to the model.
- Cost at campus scale is small: each report is one short classification call plus one embedding call.

## 4. Email

Set `EMAIL_TRANSPORT=smtp`, plus `SMTP_URL` and `EMAIL_FROM`. With Google Workspace, use a dedicated mailbox (e.g. `pulse@dau.ac.in`) and an app password:

```
SMTP_URL=smtps://pulse%40dau.ac.in:APP_PASSWORD@smtp.gmail.com:465
```

Emails are written to an `outbox` table in the same transaction as the change that caused them, then delivered right after the response. Failures are retried with exponential backoff, and the admin **Email log** page shows delivery status.

Set each team's address under **People → Team email addresses**. That's where digests and urgent alerts go.

## 5. Host

**Vercel** (simplest): import the repo, set the env vars above plus `APP_URL=https://<your-domain>` and `CRON_SECRET`, and deploy. `vercel.json` schedules:
- `/api/cron/daily` at 08:00 IST: escalations, team digests, admin overview.
- `/api/cron/outbox` once a day as a catch-up job: it retries undelivered email and fills in AI details for reports filed while Gemini was down. On a paid plan, run it every 10 minutes instead.

**Any other Node host** (college server, Railway, Render): `npm ci && npm run build && npm start`. Trigger the crons with any scheduler:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
```

Point an uptime monitor at `/api/health`. It returns 200 when the app can reach the database.

## Go-live checklist

- [ ] Taxonomy in `src/config/taxonomy.ts` agreed with the administration (teams, what each one owns, real building names), then `npm run db:seed`
- [ ] Team email addresses set; at least one staff member per team
- [ ] Grievance committee members added to the Grievance team, and policy for anonymous reports agreed with them
- [ ] Paid Gemini key; `npm run eval -- --strict --rpm 0` passes against it
- [ ] SMTP sending verified (Email log shows "sent")
- [ ] Backups / PITR enabled on the database
- [ ] `/api/health` monitored
