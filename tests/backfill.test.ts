import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { issues, reports } from '@/db/schema';
import { analyzeReport, submitReport } from '@/core/intake';
import { backfillMissingAi } from '@/core/backfill';
import type { Actor } from '@/core/types';
import { createTestEnv, type TestEnv } from './helpers';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

async function reportWhileAiDown(actor: Actor, text: string, categorySlug: string, locationSlug?: string) {
  env.classifier.failing = true;
  env.embedder.failing = true;
  const a = await analyzeReport(env.deps, actor, { text, channel: 'web' });
  const r = await submitReport(env.deps, actor, { draftId: a.draftId, choice: { kind: 'new' }, categorySlug, locationSlug });
  env.classifier.failing = false;
  env.embedder.failing = false;
  return r;
}

describe('AI backfill', () => {
  it('fills in title, summary and embedding once the AI is back, and flags a duplicate', async () => {
    const s1 = await env.user('s1@dau.ac.in');
    const s2 = await env.user('s2@dau.ac.in');
    // An existing issue created normally.
    const a = await analyzeReport(env.deps, s1, { text: 'wifi not working in hostel B', channel: 'web' });
    const existing = await submitReport(env.deps, s1, { draftId: a.draftId, choice: { kind: 'new' } });

    const r = await reportWhileAiDown(s2, 'internet dead in H-B since morning', 'it', 'hostel-b');
    let [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.embedding).toBeNull();
    expect(issue.title).toBe('internet dead in H-B since morning');

    expect(await backfillMissingAi(env.deps)).toEqual({ enriched: 1, failed: 0 });
    [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.title).toBe('Wi-Fi down in Hostel B');
    expect(issue.embedding).not.toBeNull();
    expect(issue.possibleDuplicateOfId).toBe(existing.issueId);
    const [rep] = await env.db.select().from(reports).where(eq(reports.issueId, r.issueId));
    expect(rep.ai).toMatchObject({ categorySlug: 'it', backfilled: true });
    expect(rep.categoryCorrected).toBe(false);

    // Idempotent.
    expect(await backfillMissingAi(env.deps)).toEqual({ enriched: 0, failed: 0 });
  });

  it('routes to the grievance committee if the AI now says it is sensitive', async () => {
    const s = await env.user('s@dau.ac.in');
    // FakeClassifier flags "senior … room" as sensitive; the keyword tripwire does not.
    const r = await reportWhileAiDown(s, 'a senior keeps walking into my room at night without asking', 'hostel', 'hostel-a');
    let [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.isSensitive).toBe(false);

    await backfillMissingAi(env.deps);
    [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue).toMatchObject({ isSensitive: true, isConfidential: true, urgency: 5, departmentId: await env.dept('grievance') });
    expect(issue.embedding).toBeNull();
    expect((await env.emails()).some((m) => m.to === 'grievance@dau.ac.in')).toBe(true);
  });

  it('backfills when only the classifier was down (the embedding call succeeded)', async () => {
    const s = await env.user('s@dau.ac.in');
    env.classifier.failing = true; // embeddings have their own quota and kept working
    const a = await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    const r = await submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' }, categorySlug: 'mess', locationSlug: 'mess' });
    env.classifier.failing = false;
    let [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.embedding).not.toBeNull();
    expect(issue.title).toBe('mess food is cold every night');

    expect(await backfillMissingAi(env.deps)).toEqual({ enriched: 1, failed: 0 });
    [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.title).toBe('Bad food at the mess');
    expect(await backfillMissingAi(env.deps)).toEqual({ enriched: 0, failed: 0 });
  });

  it('stops quietly if the AI is still down', async () => {
    const s = await env.user('s@dau.ac.in');
    await reportWhileAiDown(s, 'projector in LT 2 is broken', 'maintenance', 'lecture-theatre');
    env.classifier.failing = true;
    expect(await backfillMissingAi(env.deps)).toEqual({ enriched: 0, failed: 1 });
  });
});
