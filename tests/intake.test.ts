import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { issueEvents, issues, reports } from '@/db/schema';
import { analyzeReport, reportSameIssue, submitReport } from '@/core/intake';
import { listPublicBoard } from '@/core/queries';
import { createTestEnv, type TestEnv } from './helpers';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

describe('analyze → submit', () => {
  it('creates a new issue routed to the right department, with an audit event and a confirmation email', async () => {
    const asha = await env.user('asha@dau.ac.in');
    const a = await analyzeReport(env.deps, asha, { text: 'Wi-Fi in hostel B is down since morning', channel: 'web' });

    expect(a.categorySlug).toBe('it');
    expect(a.locationSlug).toBe('hostel-b');
    expect(a.candidates).toEqual([]);
    expect(a.needsLocation).toBe(false);

    const r = await submitReport(env.deps, asha, { draftId: a.draftId, choice: { kind: 'new' } });
    expect(r.joined).toBe(false);
    expect(r.issueNumber).toBeGreaterThanOrEqual(1001);

    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.departmentId).toBe(await env.dept('it'));
    expect(issue.reporterCount).toBe(1);
    expect(issue.urgency).toBe(3); // medium(2) + affectsMany(1)
    expect(issue.dueAt).not.toBeNull();
    expect(issue.needsTriage).toBe(false);

    const events = await env.db.select().from(issueEvents).where(eq(issueEvents.issueId, issue.id));
    expect(events.map((e) => e.type)).toEqual(['created']);
    expect((await env.emails()).map((e) => e.to)).toEqual(['asha@dau.ac.in']);
  });

  it('suggests the existing issue to the next student, who joins it ("me too") and raises its priority', async () => {
    const s1 = await env.user('s1@dau.ac.in');
    const s2 = await env.user('s2@dau.ac.in');
    const s3 = await env.user('s3@dau.ac.in');

    const a1 = await analyzeReport(env.deps, s1, { text: 'wifi not working in hostel B', channel: 'web' });
    const first = await submitReport(env.deps, s1, { draftId: a1.draftId, choice: { kind: 'new' } });

    const a2 = await analyzeReport(env.deps, s2, { text: 'Internet is dead in H-B again', channel: 'web' });
    expect(a2.candidates).toHaveLength(1);
    expect(a2.candidates[0]).toMatchObject({ issueId: first.issueId, strength: 'strong', alreadyReported: false });

    const joined = await submitReport(env.deps, s2, { draftId: a2.draftId, choice: { kind: 'join', issueId: first.issueId } });
    expect(joined).toMatchObject({ issueId: first.issueId, joined: true });

    await reportSameIssue(env.deps, s3, first.issueId);
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, first.issueId));
    expect(issue.reporterCount).toBe(3);
    expect(issue.urgency).toBe(4); // 3 + "3 students reported"
    const n = await env.db.select().from(reports).where(eq(reports.issueId, issue.id));
    expect(n).toHaveLength(3);
  });

  it('never counts the same student twice on one issue', async () => {
    const s1 = await env.user('s1@dau.ac.in');
    const a1 = await analyzeReport(env.deps, s1, { text: 'wifi not working in hostel B', channel: 'web' });
    const r = await submitReport(env.deps, s1, { draftId: a1.draftId, choice: { kind: 'new' } });

    await expect(reportSameIssue(env.deps, s1, r.issueId)).rejects.toMatchObject({ code: 'conflict' });
    const a2 = await analyzeReport(env.deps, s1, { text: 'wifi still down in hostel B', channel: 'web' });
    expect(a2.candidates[0].alreadyReported).toBe(true);
  });

  it('a draft can only be submitted once (double click / retry)', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    const results = await Promise.allSettled([
      submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' } }),
      submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' } }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await env.db.select().from(issues)).toHaveLength(1);
  });

  it("can't submit someone else's draft, or an expired one", async () => {
    const s = await env.user('s@dau.ac.in');
    const other = await env.user('o@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    await expect(submitReport(env.deps, other, { draftId: a.draftId, choice: { kind: 'new' } })).rejects.toMatchObject({ code: 'not_found' });

    env.clock.advance(31 * 60_000);
    await expect(submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' } })).rejects.toMatchObject({ code: 'expired' });
  });

  it('asks for a location when the category needs one, and requires it on submit', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'the tap is leaking badly', channel: 'web' });
    expect(a.categorySlug).toBe('maintenance');
    expect(a.needsLocation).toBe(true);
    expect(a.followUpQuestion).toMatch(/where/i);

    await expect(submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' } })).rejects.toMatchObject({ code: 'invalid_input' });
    const a2 = await analyzeReport(env.deps, s, { text: 'the tap is leaking badly', channel: 'web' });
    const r = await submitReport(env.deps, s, { draftId: a2.draftId, choice: { kind: 'new' }, locationSlug: 'hostel-c', locationDetail: 'room 214' });
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.locationDetail).toBe('room 214');
  });

  it('records when the student corrects the AI category (training data) and trusts their pick', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    const r = await submitReport(env.deps, s, {
      draftId: a.draftId,
      choice: { kind: 'new' },
      categorySlug: 'housekeeping',
      locationSlug: 'mess',
    });
    const [rep] = await env.db.select().from(reports).where(eq(reports.issueId, r.issueId));
    expect(rep.categoryCorrected).toBe(true);
    expect(rep.ai?.categorySlug).toBe('mess');
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.departmentId).toBe(await env.dept('estate'));
  });

  it('sends low-confidence classifications to triage', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'something vague is wrong', channel: 'web' });
    const r = await submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' } });
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.needsTriage).toBe(true);
  });

  it('keeps working when the AI is down: the student picks the category, nothing is lost', async () => {
    env.classifier.failing = true;
    env.embedder.failing = true;
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'projector in LT 2 is broken', channel: 'web' });
    expect(a.aiAvailable).toBe(false);
    expect(a.categorySlug).toBeNull();
    expect(a.candidates).toEqual([]);

    await expect(submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' } })).rejects.toMatchObject({ code: 'invalid_input' });
    const a2 = await analyzeReport(env.deps, s, { text: 'projector in LT 2 is broken', channel: 'web' });
    const r = await submitReport(env.deps, s, {
      draftId: a2.draftId,
      choice: { kind: 'new' },
      categorySlug: 'maintenance',
      locationSlug: 'lecture-theatre',
    });
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.title).toBe('projector in LT 2 is broken');
    expect(issue.embedding).toBeNull();
    const [rep] = await env.db.select().from(reports).where(eq(reports.issueId, r.issueId));
    expect(rep.categoryCorrected).toBe(false); // nothing to correct when the AI never answered
  });

  it('strips phone numbers and emails before calling the AI', async () => {
    const s = await env.user('rahul.shah@dau.ac.in');
    await analyzeReport(env.deps, s, { text: 'Fan broken, call me on +91 98765 43210 or rahul.shah@dau.ac.in', channel: 'web' });
    expect(env.classifier.calls[0]).not.toMatch(/98765|rahul\.shah@/);
    expect(env.classifier.calls[0]).toContain('[PHONE]');
  });

  it('rate-limits analyses per student', async () => {
    env.deps.config.maxAnalysesPerHour = 2;
    const s = await env.user('s@dau.ac.in');
    await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    await expect(analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' })).rejects.toMatchObject({ code: 'rate_limited' });
    env.clock.advance(61 * 60_000);
    await expect(analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' })).resolves.toBeTruthy();
  });

  it('rejects too-short and too-long text', async () => {
    const s = await env.user('s@dau.ac.in');
    await expect(analyzeReport(env.deps, s, { text: 'help', channel: 'web' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(analyzeReport(env.deps, s, { text: 'x'.repeat(2001), channel: 'web' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('does not lose reports under concurrent "me too"s', async () => {
    const first = await env.user('first@dau.ac.in');
    const a = await analyzeReport(env.deps, first, { text: 'wifi not working in hostel B', channel: 'web' });
    const r = await submitReport(env.deps, first, { draftId: a.draftId, choice: { kind: 'new' } });

    const students = await Promise.all(Array.from({ length: 20 }, (_, i) => env.user(`c${i}@dau.ac.in`)));
    await Promise.all(students.map((s) => reportSameIssue(env.deps, s, r.issueId)));
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.reporterCount).toBe(21);
    expect(await env.db.select().from(reports).where(eq(reports.issueId, r.issueId))).toHaveLength(21);
  });
});

describe('student choices', () => {
  it('picking the grievance category yourself makes the report sensitive', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'mess food is cold every night', channel: 'web' });
    expect(a.isSensitive).toBe(false);
    const r = await submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' }, categorySlug: 'grievance' });
    expect(r.isSensitive).toBe(true);
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue).toMatchObject({ isSensitive: true, isConfidential: true, departmentId: await env.dept('grievance') });
    expect(await listPublicBoard(env.db, s, {}, env.clock.now())).toHaveLength(0);
  });

  it('"somewhere else" requires a description of the place', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: 'the tap is leaking badly', channel: 'web' });
    await expect(
      submitReport(env.deps, s, { draftId: a.draftId, choice: { kind: 'new' }, locationSlug: 'elsewhere' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('sensitive reports cannot be joined onto a public issue', async () => {
    const s1 = await env.user('s1@dau.ac.in');
    const s2 = await env.user('s2@dau.ac.in');
    const a1 = await analyzeReport(env.deps, s1, { text: 'wifi not working in hostel B', channel: 'web' });
    const first = await submitReport(env.deps, s1, { draftId: a1.draftId, choice: { kind: 'new' } });
    const a2 = await analyzeReport(env.deps, s2, { text: 'the wifi guy in hostel B keeps harassing me', channel: 'web' });
    expect(a2.isSensitive).toBe(true);
    expect(a2.candidates).toEqual([]);
    await expect(
      submitReport(env.deps, s2, { draftId: a2.draftId, choice: { kind: 'join', issueId: first.issueId } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('confidential reports', () => {
  it('a confidential issue is not on the public board and is not offered as a match', async () => {
    const s1 = await env.user('s1@dau.ac.in');
    const s2 = await env.user('s2@dau.ac.in');
    const a1 = await analyzeReport(env.deps, s1, { text: 'wifi not working in hostel B', channel: 'web' });
    await submitReport(env.deps, s1, { draftId: a1.draftId, choice: { kind: 'new' }, isConfidential: true });

    expect(await listPublicBoard(env.db, s2, {}, env.clock.now())).toHaveLength(0);
    const a2 = await analyzeReport(env.deps, s2, { text: 'wifi not working in hostel B', channel: 'web' });
    expect(a2.candidates).toHaveLength(0);
  });
});
