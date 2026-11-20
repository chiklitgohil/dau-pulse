import { eq } from 'drizzle-orm';
import { createPgliteDb, type Db } from '@/db/client';
import { departments, outbox, users, type Role } from '@/db/schema';
import { seedTaxonomy } from '@/db/seed';
import { defaultCoreConfig, type Actor, type Classification, type Classifier, type Deps, type Embedder } from '@/core/types';
import { toActor } from '@/core/users';

// ─── Fakes ──────────────────────────────────────────────────────────────────

type Rule = { match: RegExp; result: Partial<Classification> };

/** Keyword-rule classifier for tests. Deterministic; can be told to fail. */
export class FakeClassifier implements Classifier {
  failing = false;
  calls: string[] = [];
  constructor(private rules: Rule[] = defaultRules) {}

  async classify(text: string): Promise<Classification> {
    this.calls.push(text);
    if (this.failing) throw new Error('fake classifier down');
    const rule = this.rules.find((r) => r.match.test(text));
    return {
      categorySlug: 'other',
      subcategorySlug: 'general',
      locationSlug: null,
      locationDetail: null,
      title: text.slice(0, 40),
      summary: text,
      severity: 'medium',
      safetyRisk: false,
      affectsMany: false,
      timeSensitive: false,
      isSensitive: false,
      confidence: 0.9,
      model: 'fake',
      ...rule?.result,
    };
  }
}

const defaultRules: Rule[] = [
  {
    match: /wi-?fi|internet/i,
    result: { categorySlug: 'it', subcategorySlug: 'wifi', locationSlug: 'hostel-b', title: 'Wi-Fi down in Hostel B', summary: 'Wi-Fi is not working in Hostel B.', affectsMany: true },
  },
  {
    match: /tap|leak|water/i,
    result: { categorySlug: 'maintenance', subcategorySlug: 'plumbing', locationSlug: null, title: 'Water leak', summary: 'There is a water leak.' },
  },
  {
    match: /food|mess/i,
    result: { categorySlug: 'mess', subcategorySlug: 'food-quality', locationSlug: 'mess', title: 'Bad food at the mess', summary: 'Food quality at the mess is poor.' },
  },
  {
    match: /senior.*(room|made us)/i,
    result: { categorySlug: 'hostel', subcategorySlug: 'warden', locationSlug: 'hostel-a', title: 'Seniors in room', summary: 'Seniors came to the room.', isSensitive: true },
  },
  { match: /asdf|vague/i, result: { categorySlug: 'other', subcategorySlug: 'general', confidence: 0.2 } },
];

/**
 * Topic embedder: each keyword is a dimension, so reports about the same thing are near-identical
 * (cosine ≈ 1) and different things are near-orthogonal. A little hashed noise keeps vectors distinct.
 */
export class FakeEmbedder implements Embedder {
  readonly dimensions = 768;
  failing = false;
  private topics = ['wi-fi', 'wifi', 'internet', 'water', 'leak', 'food', 'mess', 'projector', 'fan'];

  async embed(texts: string[]): Promise<number[][]> {
    if (this.failing) throw new Error('fake embedder down');
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0);
      const lower = t.toLowerCase();
      const topic = this.topics.findIndex((k) => lower.includes(k));
      // wifi / wi-fi / internet share one dimension; water / leak share another, etc.
      const groups = [0, 0, 0, 1, 1, 2, 2, 3, 4];
      v[topic >= 0 ? groups[topic] : 10 + (hash(lower) % 50)] = 1;
      for (let i = 0; i < 8; i++) v[100 + ((hash(lower) + i * 7919) % 600)] += 0.05;
      return v;
    });
  }
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Starts at real time (DB defaults like outbox.next_attempt_at use the DB clock), then moves only when told. */
export class Clock {
  constructor(public t = new Date()) {}
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}

// ─── Test environment ───────────────────────────────────────────────────────

export type TestEnv = {
  db: Db;
  deps: Deps;
  classifier: FakeClassifier;
  embedder: FakeEmbedder;
  clock: Clock;
  close: () => Promise<void>;
  user: (email: string, role?: Role, departmentSlug?: string) => Promise<Actor>;
  dept: (slug: string) => Promise<string>;
  emails: () => Promise<Array<{ to: string; subject: string; body: string }>>;
};

export async function createTestEnv(): Promise<TestEnv> {
  const { db, close } = await createPgliteDb();
  await seedTaxonomy(db);
  await db.update(departments).set({ email: 'it-team@dau.ac.in' }).where(eq(departments.slug, 'it'));
  await db.update(departments).set({ email: 'grievance@dau.ac.in' }).where(eq(departments.slug, 'grievance'));

  const classifier = new FakeClassifier();
  const embedder = new FakeEmbedder();
  const clock = new Clock();
  const deps: Deps = {
    db,
    classifier,
    embedder,
    now: clock.now,
    config: { ...defaultCoreConfig, appUrl: 'https://pulse.test', adminEmails: ['dean@dau.ac.in'] },
  };

  const dept = async (slug: string) => {
    const [d] = await db.select().from(departments).where(eq(departments.slug, slug));
    if (!d) throw new Error(`no dept ${slug}`);
    return d.id;
  };

  return {
    db,
    deps,
    classifier,
    embedder,
    clock,
    close,
    dept,
    user: async (email, role = 'student', departmentSlug) => {
      const [row] = await db
        .insert(users)
        .values({ email, name: email.split('@')[0], role, departmentId: departmentSlug ? await dept(departmentSlug) : null })
        .returning();
      return toActor(row);
    },
    emails: async () =>
      (await db.select().from(outbox)).map((o) => ({ to: o.toEmail, subject: o.subject, body: o.body })),
  };
}
