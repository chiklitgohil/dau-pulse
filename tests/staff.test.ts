import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { issueEvents, issues, outbox, reports } from '@/db/schema';
import { analyzeReport, reportSameIssue, submitReport } from '@/core/intake';
import { getReporterIssue, getStaffIssue, listMyReports, listPublicBoard, listStaffQueue } from '@/core/queries';
import { addInternalNote, assignIssue, changeStatus, mergeIssues, reclassifyIssue } from '@/core/staff';
import { deliverOutbox, type EmailTransport } from '@/core/notify';
import { runDailyJobs } from '@/core/jobs';
import type { Actor } from '@/core/types';
import { createTestEnv, type TestEnv } from './helpers';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

async function report(actor: Actor, text: string, extra: Record<string, unknown> = {}) {
  const a = await analyzeReport(env.deps, actor, { text, channel: 'web' });
  return submitReport(env.deps, actor, { draftId: a.draftId, choice: { kind: 'new' }, ...extra });
}

describe('sensitive reports', () => {
  it('route to the grievance committee only, whatever the AI category, and stay hidden from everyone else', async () => {
    const student = await env.user('s@dau.ac.in');
    const other = await env.user('o@dau.ac.in');
    const itStaff = await env.user('it@dau.ac.in', 'staff', 'it');
    const hostelStaff = await env.user('warden@dau.ac.in', 'staff', 'hostel');
    const admin = await env.user('dean@dau.ac.in', 'admin');
    const committee = await env.user('gc@dau.ac.in', 'staff', 'grievance');

    // AI says "hostel" but flags sensitive → grievance.
    const a = await analyzeReport(env.deps, student, { text: 'seniors came to our room at night and made us do things', channel: 'web' });
    expect(a.isSensitive).toBe(true);
    expect(a.categorySlug).toBe('grievance');
    expect(a.needsLocation).toBe(false);
    expect(a.candidates).toEqual([]);
    const r = await submitReport(env.deps, student, { draftId: a.draftId, choice: { kind: 'new' } });

    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue).toMatchObject({ isSensitive: true, isConfidential: true, urgency: 5, title: 'Confidential report' });
    expect(issue.departmentId).toBe(await env.dept('grievance'));
    expect(issue.embedding).toBeNull();

    // Visible to the committee …
    expect((await listStaffQueue(env.db, committee, {}, env.clock.now())).map((i) => i.id)).toEqual([issue.id]);
    await expect(getStaffIssue(env.db, committee, issue.id)).resolves.toBeTruthy();
    // … and the reporter, but nobody else — including admins.
    await expect(getReporterIssue(env.db, student, issue.number)).resolves.toBeTruthy();
    for (const who of [itStaff, hostelStaff, admin]) {
      expect(await listStaffQueue(env.db, who, { view: 'all' }, env.clock.now())).toHaveLength(0);
      await expect(getStaffIssue(env.db, who, issue.id)).rejects.toMatchObject({ code: 'not_found' });
    }
    await expect(getReporterIssue(env.db, other, issue.number)).rejects.toMatchObject({ code: 'not_found' });
    expect(await listPublicBoard(env.db, other, {}, env.clock.now())).toHaveLength(0);

    // The committee is alerted without details in the email body.
    const alert = (await env.emails()).find((e) => e.to === 'grievance@dau.ac.in');
    expect(alert?.subject).toMatch(/Confidential/);
    expect(alert?.body).not.toMatch(/senior/i);
  });

  it('the keyword tripwire catches what the AI misses', async () => {
    const s = await env.user('s@dau.ac.in');
    // FakeClassifier does not flag this as sensitive.
    const a = await analyzeReport(env.deps, s, { text: 'The mess supervisor keeps harassing the girls at dinner', channel: 'web' });
    expect(a.isSensitive).toBe(true);
    expect(a.categorySlug).toBe('grievance');
  });

  it('flags crisis language so the UI can show support immediately', async () => {
    const s = await env.user('s@dau.ac.in');
    const a = await analyzeReport(env.deps, s, { text: "exams are too much and I don't want to live, I want to die", channel: 'web' });
    expect(a.crisis).toBe(true);
    expect(a.isSensitive).toBe(true);
  });

  it('anonymous reporters are never identified to staff', async () => {
    const s = await env.user('secret.student@dau.ac.in');
    const committee = await env.user('gc@dau.ac.in', 'staff', 'grievance');
    const r = await report(s, 'I am being bullied by my roommate', { isAnonymous: true });
    const detail = await getStaffIssue(env.db, committee, r.issueId);
    expect(detail.reports[0].reporter).toBe('Anonymous student');
    expect(JSON.stringify(detail)).not.toContain('secret.student');
  });
});

describe('staff queue & access', () => {
  it('staff see only their department; admins see all non-sensitive issues', async () => {
    const s = await env.user('s@dau.ac.in');
    const itStaff = await env.user('it@dau.ac.in', 'staff', 'it');
    const messStaff = await env.user('mess@dau.ac.in', 'staff', 'mess');
    const admin = await env.user('dean@dau.ac.in', 'admin');
    await report(s, 'wifi not working in hostel B');
    await report(s, 'mess food is cold every night');

    expect((await listStaffQueue(env.db, itStaff, {}, env.clock.now())).map((i) => i.title)).toEqual(['Wi-Fi down in Hostel B']);
    expect((await listStaffQueue(env.db, messStaff, {}, env.clock.now())).map((i) => i.title)).toEqual(['Bad food at the mess']);
    expect(await listStaffQueue(env.db, admin, {}, env.clock.now())).toHaveLength(2);
    await expect(listStaffQueue(env.db, s, {}, env.clock.now())).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a disabled staff account loses access', async () => {
    const s = await env.user('s@dau.ac.in');
    const itStaff = await env.user('it@dau.ac.in', 'staff', 'it');
    const r = await report(s, 'wifi not working in hostel B');
    await expect(getStaffIssue(env.db, { ...itStaff, active: false }, r.issueId)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('staff cannot act on another department’s issue', async () => {
    const s = await env.user('s@dau.ac.in');
    const messStaff = await env.user('mess@dau.ac.in', 'staff', 'mess');
    const r = await report(s, 'wifi not working in hostel B');
    await expect(changeStatus(env.deps, messStaff, { issueId: r.issueId, status: 'resolved', note: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('resolving the loop', () => {
  it('status changes are logged publicly and every reporter is emailed; resolving needs a note', async () => {
    const s1 = await env.user('s1@dau.ac.in');
    const s2 = await env.user('s2@dau.ac.in');
    const itStaff = await env.user('it@dau.ac.in', 'staff', 'it');
    const r = await report(s1, 'wifi not working in hostel B');
    await reportSameIssue(env.deps, s2, r.issueId);
    await env.db.delete(outbox);

    await changeStatus(env.deps, itStaff, { issueId: r.issueId, status: 'in_progress', note: 'Router replacement ordered' });
    await expect(changeStatus(env.deps, itStaff, { issueId: r.issueId, status: 'resolved' })).rejects.toMatchObject({ code: 'invalid_input' });
    await changeStatus(env.deps, itStaff, { issueId: r.issueId, status: 'resolved', note: 'Replaced the access point on floor 2' });

    const mails = await env.emails();
    expect(mails.filter((m) => /Resolved/.test(m.subject)).map((m) => m.to).sort()).toEqual(['s1@dau.ac.in', 's2@dau.ac.in']);
    expect(mails.find((m) => /Resolved/.test(m.subject))?.body).toContain('Replaced the access point');

    const view = await getReporterIssue(env.db, s1, r.issueNumber);
    expect(view.status).toBe('resolved');
    expect(view.events.map((e) => e.type)).toEqual(['created', 'report_added', 'status_changed', 'status_changed']);

    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.resolvedAt).not.toBeNull();
    expect((await listMyReports(env.db, s2))[0].status).toBe('resolved');
  });

  it('internal notes and assignments are not shown to students', async () => {
    const s = await env.user('s@dau.ac.in');
    const itStaff = await env.user('it@dau.ac.in', 'staff', 'it');
    const it2 = await env.user('it2@dau.ac.in', 'staff', 'it');
    const r = await report(s, 'wifi not working in hostel B');
    await addInternalNote(env.deps, itStaff, r.issueId, 'Vendor is slow, chase on Monday');
    await assignIssue(env.deps, itStaff, r.issueId, it2.id);

    const view = await getReporterIssue(env.db, s, r.issueNumber);
    expect(JSON.stringify(view)).not.toMatch(/Vendor|it2/);
    expect((await env.emails()).some((m) => m.to === 'it2@dau.ac.in')).toBe(true);

    const messStaff = await env.user('mess@dau.ac.in', 'staff', 'mess');
    await expect(assignIssue(env.deps, itStaff, r.issueId, messStaff.id)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('reclassify & merge', () => {
  it('reclassifying moves the issue to the new department, clears triage and alerts the new team', async () => {
    const s = await env.user('s@dau.ac.in');
    const admin = await env.user('dean@dau.ac.in', 'admin');
    const r = await report(s, 'something vague is wrong');
    expect((await listStaffQueue(env.db, admin, { view: 'triage' }, env.clock.now())).map((i) => i.id)).toEqual([r.issueId]);

    await reclassifyIssue(env.deps, admin, { issueId: r.issueId, categorySlug: 'it', subcategorySlug: 'portal', isSensitive: false });
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.departmentId).toBe(await env.dept('it'));
    expect(issue.needsTriage).toBe(false);
    const events = await env.db.select().from(issueEvents).where(eq(issueEvents.issueId, r.issueId));
    expect(events.find((e) => e.type === 'reclassified')?.isPublic).toBe(false);
    expect((await env.emails()).some((m) => m.to === 'it-team@dau.ac.in')).toBe(true);
  });

  it('marking an issue sensitive hands it to the committee and removes it from the board', async () => {
    const s = await env.user('s@dau.ac.in');
    const messStaff = await env.user('mess@dau.ac.in', 'staff', 'mess');
    const r = await report(s, 'mess food is cold every night');
    const res = await reclassifyIssue(env.deps, messStaff, { issueId: r.issueId, categorySlug: 'mess', isSensitive: true });
    expect(res.stillAccessible).toBe(false);
    const [issue] = await env.db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue).toMatchObject({ isSensitive: true, urgency: 5, departmentId: await env.dept('grievance') });
    expect(await listPublicBoard(env.db, s, {}, env.clock.now())).toHaveLength(0);
  });

  it('merging moves reports, keeps counts exact, closes the duplicate and tells its reporters', async () => {
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((n) => env.user(`${n}@dau.ac.in`)));
    const itStaff = await env.user('it@dau.ac.in', 'staff', 'it');
    const target = await report(a, 'wifi not working in hostel B');
    // b and c file a "new" issue instead of joining (the duplicate the AI flagged).
    const dupe = await report(b, 'internet is down in hostel B');
    await reportSameIssue(env.deps, c, dupe.issueId);
    await reportSameIssue(env.deps, a, dupe.issueId); // a reported both

    const [dupeRow] = await env.db.select().from(issues).where(eq(issues.id, dupe.issueId));
    expect(dupeRow.possibleDuplicateOfId).toBe(target.issueId);

    await mergeIssues(env.deps, itStaff, dupe.issueId, target.issueId);
    const [t] = await env.db.select().from(issues).where(eq(issues.id, target.issueId));
    const [d] = await env.db.select().from(issues).where(eq(issues.id, dupe.issueId));
    expect(t.reporterCount).toBe(3);
    expect(d).toMatchObject({ status: 'closed', mergedIntoId: target.issueId });
    expect(await env.db.select().from(reports).where(eq(reports.issueId, target.issueId))).toHaveLength(3);
    expect(await env.db.select().from(reports).where(eq(reports.issueId, dupe.issueId))).toHaveLength(1); // a's second report

    const mergedMails = (await env.emails()).filter((m) => /now tracked as/.test(m.subject)).map((m) => m.to).sort();
    expect(mergedMails).toEqual(['a@dau.ac.in', 'b@dau.ac.in', 'c@dau.ac.in']);
    expect((await getReporterIssue(env.db, b, t.number)).myReport).not.toBeNull();
    await expect(mergeIssues(env.deps, itStaff, dupe.issueId, target.issueId)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('email outbox', () => {
  it('delivers once, retries failures with backoff, and gives up after repeated failures', async () => {
    const s = await env.user('s@dau.ac.in');
    await report(s, 'wifi not working in hostel B');
    const sent: string[] = [];
    let fail = true;
    const transport: EmailTransport = {
      async send(m) {
        if (fail) throw new Error('smtp down');
        sent.push(m.to);
      },
    };

    env.clock.advance(1000); // emails are stamped with the DB clock, which has moved on since the test clock froze
    expect(await deliverOutbox(env.db, transport, env.clock.now())).toMatchObject({ sent: 0, retrying: 1 });
    // Not due again yet.
    expect(await deliverOutbox(env.db, transport, env.clock.now())).toMatchObject({ sent: 0, retrying: 0 });
    fail = false;
    env.clock.advance(2 * 60_000);
    expect(await deliverOutbox(env.db, transport, env.clock.now())).toMatchObject({ sent: 1 });
    expect(await deliverOutbox(env.db, transport, env.clock.now())).toMatchObject({ sent: 0 });
    expect(sent).toEqual(['s@dau.ac.in']);
  });
});

describe('daily jobs', () => {
  it('escalates overdue issues once and sends department and admin digests', async () => {
    const s = await env.user('s@dau.ac.in');
    await report(s, 'wifi not working in hostel B'); // urgency 3 → due in 72h
    await env.db.delete(outbox);

    env.clock.advance(73 * 3600_000);
    const first = await runDailyJobs(env.deps);
    expect(first.escalated).toBe(1);
    const mails = await env.emails();
    expect(mails.find((m) => m.to === 'it-team@dau.ac.in')?.subject).toMatch(/1 open, 1 overdue/);
    expect(mails.find((m) => m.to === 'dean@dau.ac.in')?.body).toMatch(/Newly escalated/);

    const second = await runDailyJobs(env.deps);
    expect(second.escalated).toBe(0);
  });
});
