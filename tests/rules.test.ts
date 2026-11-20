import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeUrgency, mergeSignals } from '@/core/urgency';
import { dueAtFor, isOverdue, nextDueAt } from '@/core/sla';
import { redactPersonalData } from '@/core/redact';
import { checkTripwire } from '@/core/sensitive';
import { canStaffAccessIssue, isPublicIssue } from '@/core/permissions';
import { isAllowedEmail } from '@/core/users';
import { parseClassification } from '@/core/ai/prompt';
import type { Actor, Taxonomy } from '@/core/types';

const base = { severity: 'medium' as const, safetyRisk: false, affectsMany: false, timeSensitive: false, isSensitive: false, reporterCount: 1 };

describe('urgency', () => {
  it('follows the documented formula', () => {
    expect(computeUrgency({ ...base, severity: 'low' })).toBe(1);
    expect(computeUrgency(base)).toBe(2);
    expect(computeUrgency({ ...base, affectsMany: true, timeSensitive: true })).toBe(4);
    expect(computeUrgency({ ...base, severity: 'high', affectsMany: true, timeSensitive: true, reporterCount: 12 })).toBe(5);
    expect(computeUrgency({ ...base, reporterCount: 3 })).toBe(3);
    expect(computeUrgency({ ...base, reporterCount: 10 })).toBe(4);
    expect(computeUrgency({ ...base, severity: 'low', safetyRisk: true })).toBe(5);
    expect(computeUrgency({ ...base, severity: 'low', isSensitive: true })).toBe(5);
  });

  it('merges signals by OR and max severity', () => {
    expect(
      mergeSignals(
        { severity: 'high', safetyRisk: false, affectsMany: false, timeSensitive: true },
        { severity: 'low', safetyRisk: true, affectsMany: false, timeSensitive: false },
      ),
    ).toEqual({ severity: 'high', safetyRisk: true, affectsMany: false, timeSensitive: true });
  });
});

describe('deadlines', () => {
  const t0 = new Date('2026-11-20T00:00:00Z');
  it('maps urgency to SLA hours and only ever moves earlier', () => {
    expect(dueAtFor(t0, 5).toISOString()).toBe('2026-11-20T04:00:00.000Z');
    expect(dueAtFor(t0, 3).toISOString()).toBe('2026-11-23T00:00:00.000Z');
    const due3 = dueAtFor(t0, 3);
    expect(nextDueAt(t0, 5, due3).toISOString()).toBe('2026-11-20T04:00:00.000Z');
    expect(nextDueAt(t0, 1, due3)).toEqual(due3);
  });
  it('only open work can be overdue', () => {
    const past = new Date('2026-11-19T00:00:00Z');
    expect(isOverdue({ dueAt: past, status: 'open' }, t0)).toBe(true);
    expect(isOverdue({ dueAt: past, status: 'resolved' }, t0)).toBe(false);
  });
});

describe('redaction', () => {
  it('removes phones, emails, long IDs and the reporter name, keeps room numbers', () => {
    const out = redactPersonalData('I am Priya Patel (202101234), room 214. Call +91 98765-43210 or priya.p@dau.ac.in', {
      reporterName: 'Priya Patel',
    });
    expect(out).toBe('I am [NAME] [NAME] ([ID]), room 214. Call [PHONE] or [EMAIL]');
  });
});

describe('sensitive tripwire', () => {
  it.each([
    'seniors are ragging first years in hostel C',
    'a staff member keeps harassing me',
    'he touched me inappropriately in the lab',
    'someone is stalking me on the way back',
    'my roommate threatens me every day',
    'woh log mujhe pareshan karte hai roz',
    'there is eve teasing near the main gate',
    // Subtle phrasings the first eval run missed when the AI was unavailable:
    "Seniors called us first years to their room at 2am and made us do push-ups, said we'd be in trouble if we told anyone",
    'A TA keeps sending me inappropriate messages late at night and says it will affect my grades if I complain',
    "My roommate and his friends keep mocking my caste and won't let me use the common room",
    'Please keep this confidential: a faculty member asked me to come to his house alone to discuss my marks',
    "Group of seniors forced juniors to shave heads as a 'tradition' in hostel A",
  ])('flags: %s', (text) => {
    expect(checkTripwire(text).sensitive).toBe(true);
  });

  it.each(['wifi is down in hostel B', 'the mess food is terrible', 'projector not working, end my suffering lol', 'please send my marks'])(
    'does not flag: %s',
    (text) => {
      expect(checkTripwire(text).sensitive).toBe(false);
    },
  );

  it('on the eval set, catches every sensitive report on its own, with no false alarms', () => {
    // The tripwire is the safety net when the AI is down, so it must hold up without it.
    const examples = fs
      .readFileSync(path.join('fixtures', 'eval', 'reports.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { id: string; text: string; sensitive: boolean });
    const missed = examples.filter((e) => e.sensitive && !checkTripwire(e.text).sensitive).map((e) => e.id);
    const falseAlarms = examples.filter((e) => !e.sensitive && checkTripwire(e.text).sensitive).map((e) => e.id);
    expect(missed).toEqual([]);
    expect(falseAlarms).toEqual([]);
  });

  it('detects crisis language', () => {
    expect(checkTripwire('I want to kill myself').crisis).toBe(true);
    expect(checkTripwire('I want to end my life').crisis).toBe(true);
    expect(checkTripwire('I will end my semester project soon').crisis).toBe(false);
  });
});

describe('permissions', () => {
  const actor = (role: Actor['role'], departmentId: string | null): Actor => ({ id: 'u', email: 'u@x', name: null, role, departmentId, active: true });
  const issue = (o: Partial<{ departmentId: string | null; isSensitive: boolean; isConfidential: boolean; mergedIntoId: string | null }> = {}) => ({
    departmentId: 'it',
    isSensitive: false,
    isConfidential: false,
    mergedIntoId: null,
    ...o,
  });

  it('applies the documented rules', () => {
    expect(canStaffAccessIssue(actor('staff', 'it'), issue())).toBe(true);
    expect(canStaffAccessIssue(actor('staff', 'mess'), issue())).toBe(false);
    expect(canStaffAccessIssue(actor('admin', null), issue())).toBe(true);
    expect(canStaffAccessIssue(actor('student', 'it'), issue())).toBe(false);
    expect(canStaffAccessIssue(actor('admin', null), issue({ isSensitive: true, departmentId: 'gc' }))).toBe(false);
    expect(canStaffAccessIssue(actor('staff', 'gc'), issue({ isSensitive: true, departmentId: 'gc' }))).toBe(true);
    expect(isPublicIssue(issue({ isConfidential: true }))).toBe(false);
    expect(isPublicIssue(issue({ mergedIntoId: 'x' }))).toBe(false);
  });

  it('restricts sign-in to the college domain plus an allow-list', () => {
    const policy = { allowedDomain: 'dau.ac.in', extraAllowedEmails: ['vendor@gmail.com'], adminEmails: [] };
    expect(isAllowedEmail('A.Student@DAU.ac.in', policy)).toBe(true);
    expect(isAllowedEmail('vendor@gmail.com', policy)).toBe(true);
    expect(isAllowedEmail('random@gmail.com', policy)).toBe(false);
    expect(isAllowedEmail('evil@notdau.ac.in', policy)).toBe(false);
  });
});

describe('classifier output validation', () => {
  const t: Taxonomy = {
    departments: [],
    locations: [{ id: 'l1', slug: 'hostel-b', name: 'Hostel B', aliases: [] }],
    categories: [
      { id: 'c1', slug: 'it', name: 'IT', description: '', departmentId: 'd', requiresLocation: false, subcategories: [{ id: 's1', slug: 'wifi', name: 'Wi-Fi' }] },
      { id: 'c2', slug: 'mess', name: 'Mess', description: '', departmentId: 'd', requiresLocation: true, subcategories: [{ id: 's2', slug: 'food-quality', name: 'Food' }] },
    ],
  };
  const out = (o: Record<string, unknown>) =>
    JSON.stringify({
      summary: 'Wi-Fi down',
      title: 'Wi-Fi down',
      categorySlug: 'it',
      subcategorySlug: 'it/wifi',
      locationSlug: 'hostel-b',
      locationDetail: '',
      severity: 'medium',
      safetyRisk: false,
      affectsMany: true,
      timeSensitive: false,
      isSensitive: false,
      confidence: 0.9,
      ...o,
    });

  it('accepts valid output', () => {
    expect(parseClassification(out({}), t, 'm', 'x')).toMatchObject({ categorySlug: 'it', subcategorySlug: 'wifi', locationSlug: 'hostel-b', locationDetail: null });
  });
  it('drops values that are not in the taxonomy or belong to another category', () => {
    const c = parseClassification(out({ categorySlug: 'it', subcategorySlug: 'mess/food-quality', locationSlug: 'mars' }), t, 'm', 'x');
    expect(c.subcategorySlug).toBeNull();
    expect(c.locationSlug).toBeNull();
    expect(parseClassification(out({ categorySlug: 'unknown' }), t, 'm', 'x')).toMatchObject({ categorySlug: null, confidence: 0 });
  });
  it('throws on malformed output (caller falls back to triage)', () => {
    expect(() => parseClassification('{"summary": 1}', t, 'm', 'x')).toThrow();
    expect(() => parseClassification('not json', t, 'm', 'x')).toThrow();
  });
});
