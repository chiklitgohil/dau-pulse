import { eq } from 'drizzle-orm';
import { EMBEDDING_DIMENSIONS, departments, users, type Role } from '@/db/schema';
import { seedTaxonomy } from '@/db/seed';
import { GeminiClassifier, GeminiEmbedder } from '@/core/ai/gemini';
import { UnavailableClassifier, UnavailableEmbedder } from '@/core/ai/unavailable';
import { analyzeReport, submitReport } from '@/core/intake';
import { changeStatus } from '@/core/staff';
import { defaultCoreConfig, type Deps } from '@/core/types';
import { listStaffQueue } from '@/core/queries';
import { toActor } from '@/core/users';
import { openDb } from './_shared';

/**
 * Local demo data: staff accounts for a few teams, some students, and a dozen realistic reports
 * pushed through the REAL pipeline (Gemini classification + duplicate matching).
 *
 *   npm run demo:load        (stop `npm run dev` first; PGlite allows one process at a time)
 *
 * Then sign in with the developer login as any of the printed emails.
 */

const domain = process.env.ALLOWED_EMAIL_DOMAIN ?? 'dau.ac.in';
const people: Array<{ email: string; name: string; role: Role; dept?: string }> = [
  { email: `admin@${domain}`, name: 'Dean of Students (demo)', role: 'admin' },
  { email: `it.staff@${domain}`, name: 'Ravi (IT)', role: 'staff', dept: 'it' },
  { email: `estate.staff@${domain}`, name: 'Meena (Estate)', role: 'staff', dept: 'estate' },
  { email: `mess.staff@${domain}`, name: 'Kiran (Mess)', role: 'staff', dept: 'mess' },
  { email: `grievance@${domain}`, name: 'Prof. Shah (Grievance Committee)', role: 'staff', dept: 'grievance' },
  ...[1, 2, 3, 4, 5].map((i) => ({ email: `student${i}@${domain}`, name: `Student ${i}`, role: 'student' as Role })),
];

// [student number, text, location to pick if the AI asks]
const reports: Array<[number, string, string?]> = [
  [1, 'Wi-Fi in Hostel B has been down since last night, can\'t submit my assignment'],
  [2, 'bhai H-B ka wifi phir se gaya, kal raat se internet nahi chal raha'],
  [3, 'hostel b wifi not working again!!! third time this week'],
  [1, 'Mess food was cold and stale at dinner again today'],
  [4, 'aaj raat mess ka khana bilkul thanda tha aur roti kachi thi'],
  [2, 'Projector in LT-2 isn\'t working, the professor couldn\'t show slides'],
  [5, 'No water in Hostel C since morning, can\'t even use the washrooms'],
  [3, 'Hostel C ma savar thi pani nathi aavtu'],
  [4, 'Exposed electric wires hanging near the switchboard in Hostel B corridor, someone could get a shock'],
  [5, 'The path from the library to the girls\' hostel is completely dark at night, street lights are off'],
  [1, 'Can\'t log in to the student portal, it says invalid credentials but my password is right'],
  [2, 'Seniors called us first years to their room at 2am and made us do push-ups, said we\'d be in trouble if we told anyone'],
  [3, 'My room door lock is broken, I can\'t lock it when I go to class', 'hostel-a'],
];

async function main() {
  const { db, close } = await openDb();
  try {
    await seedTaxonomy(db);
    const deptId = async (slug: string) => (await db.select().from(departments).where(eq(departments.slug, slug)))[0].id;
    for (const slug of ['it', 'estate', 'mess', 'grievance']) {
      await db.update(departments).set({ email: `${slug}-team@${domain}` }).where(eq(departments.slug, slug));
    }

    const actors = new Map<string, ReturnType<typeof toActor>>();
    for (const p of people) {
      const [row] = await db
        .insert(users)
        .values({ email: p.email, name: p.name, role: p.role, departmentId: p.dept ? await deptId(p.dept) : null })
        .onConflictDoUpdate({ target: users.email, set: { name: p.name, role: p.role, departmentId: p.dept ? await deptId(p.dept) : null } })
        .returning();
      actors.set(p.email, toActor(row));
    }

    const key = process.env.GEMINI_API_KEY;
    const models = (process.env.GEMINI_MODELS ?? 'gemini-2.5-flash,gemini-3.5-flash,gemini-3.1-flash-lite').split(',');
    const deps: Deps = {
      db,
      classifier: key ? new GeminiClassifier(key, models) : new UnavailableClassifier(),
      embedder: key ? new GeminiEmbedder(key, process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001', EMBEDDING_DIMENSIONS) : new UnavailableEmbedder(EMBEDDING_DIMENSIONS),
      now: () => new Date(),
      config: { ...defaultCoreConfig, maxAnalysesPerHour: 1000, maxReportsPerHour: 1000, appUrl: process.env.APP_URL ?? 'http://localhost:3000' },
    };
    if (!key) console.warn('GEMINI_API_KEY not set: demo reports will go to triage without AI.');

    for (const [n, text, fallbackLocation] of reports) {
      const student = actors.get(`student${n}@${domain}`)!;
      const a = await analyzeReport(deps, student, { text, channel: 'web' });
      const match = a.candidates.find((c) => !c.alreadyReported);
      const result = await submitReport(deps, student, {
        draftId: a.draftId,
        choice: match ? { kind: 'join', issueId: match.issueId } : { kind: 'new' },
        categorySlug: a.categorySlug ?? 'other',
        locationSlug: a.locationSlug ?? (a.needsLocation ? (fallbackLocation ?? 'elsewhere') : null),
        locationDetail: a.needsLocation && !a.locationSlug && !fallbackLocation ? 'demo' : null,
      });
      console.log(`${result.joined ? '  + joined' : '  ✓ new   '} DP-${result.issueNumber}  ${a.isSensitive ? '[sensitive] ' : ''}${a.title}`);
      await new Promise((r) => setTimeout(r, 6500)); // stay under free-tier rate limits
    }

    // One issue already in progress so the board shows some movement.
    const it = actors.get(`it.staff@${domain}`)!;
    const [first] = await listStaffQueue(db, it, { view: 'department' }, new Date());
    if (first) await changeStatus(deps, it, { issueId: first.id, status: 'in_progress', note: 'Technician is checking the access points on each floor.' });

    console.log('\nSign in (developer login) as:');
    for (const p of people) console.log(`  ${p.email.padEnd(28)} ${p.role}${p.dept ? ` · ${p.dept}` : ''}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
