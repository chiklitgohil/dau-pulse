import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { departments, drafts, issueEvents, issues } from '@/db/schema';
import { code, queueEmails, type EmailMessage } from './notify';
import type { Deps } from './types';

const ACTIVE = ['open', 'in_progress'] as const;

/**
 * Daily job (run by cron):
 *   1. escalate issues that passed their deadline (once per issue)
 *   2. email each department a digest of its queue
 *   3. email admins an overview (triage backlog, overdue by department, escalations)
 *   4. clean up expired drafts
 * Most staff won't open a dashboard every day; the digest brings the queue to them.
 */
export async function runDailyJobs(deps: Deps): Promise<{ escalated: number; digests: number; draftsDeleted: number }> {
  const { db, config } = deps;
  const now = deps.now();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const messages: EmailMessage[] = [];

  const escalated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(issues)
      .set({ escalatedAt: now })
      .where(and(inArray(issues.status, [...ACTIVE]), lt(issues.dueAt, now), isNull(issues.escalatedAt), isNull(issues.mergedIntoId)))
      .returning({ id: issues.id, number: issues.number, title: issues.title, isSensitive: issues.isSensitive, departmentId: issues.departmentId, urgency: issues.urgency });
    if (rows.length) {
      await tx.insert(issueEvents).values(
        rows.map((r) => ({ issueId: r.id, actorId: null, type: 'escalated' as const, isPublic: false, data: { reason: 'overdue' }, createdAt: now })),
      );
    }
    return rows;
  });

  const depts = await db.select().from(departments);
  let digests = 0;
  for (const dept of depts) {
    if (!dept.email) continue;
    const queue = await db
      .select({ id: issues.id, number: issues.number, title: issues.title, urgency: issues.urgency, dueAt: issues.dueAt, createdAt: issues.createdAt, reporterCount: issues.reporterCount, status: issues.status })
      .from(issues)
      .where(and(eq(issues.departmentId, dept.id), inArray(issues.status, [...ACTIVE]), isNull(issues.mergedIntoId)))
      .orderBy(desc(issues.urgency), asc(issues.dueAt));
    if (queue.length === 0) continue;

    const overdue = queue.filter((i) => i.dueAt && i.dueAt < now);
    const fresh = queue.filter((i) => i.createdAt > dayAgo);
    const line = (i: (typeof queue)[number]) =>
      dept.isSensitive
        ? `  ${code(i.number)}  urgency ${i.urgency}  ${config.appUrl}/staff/issues/${i.id}`
        : `  ${code(i.number)}  [${i.urgency}/5]  ${i.title}  (${i.reporterCount} reporter${i.reporterCount === 1 ? '' : 's'})`;

    const body = [
      `Good morning. Here is the ${dept.name} queue in DAU Pulse.`,
      '',
      `Open: ${queue.length}   New in last 24h: ${fresh.length}   Overdue: ${overdue.length}`,
      '',
      ...(overdue.length ? ['OVERDUE', ...overdue.slice(0, 15).map(line), ''] : []),
      'TOP PRIORITY',
      ...queue.slice(0, 10).map(line),
      '',
      `Open your queue: ${config.appUrl}/staff`,
      '',
      '— DAU Pulse',
    ].join('\n');
    messages.push({
      to: dept.email,
      subject: `${dept.name}: ${queue.length} open${overdue.length ? `, ${overdue.length} overdue` : ''}`,
      body,
    });
    digests++;
  }

  if (config.adminEmails.length) {
    const [triage] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(issues)
      .where(and(eq(issues.needsTriage, true), inArray(issues.status, [...ACTIVE]), isNull(issues.mergedIntoId)));
    const overdueByDept = await db
      .select({ name: departments.name, n: sql<number>`count(*)::int` })
      .from(issues)
      .innerJoin(departments, eq(departments.id, issues.departmentId))
      .where(and(inArray(issues.status, [...ACTIVE]), lt(issues.dueAt, now), isNull(issues.mergedIntoId)))
      .groupBy(departments.name)
      .orderBy(desc(sql`count(*)`));
    const [created] = await db.select({ n: sql<number>`count(*)::int` }).from(issues).where(gt(issues.createdAt, dayAgo));

    if (triage.n || overdueByDept.length || escalated.length || created.n) {
      const body = [
        'DAU Pulse daily overview',
        '',
        `New issues in last 24h: ${created.n}`,
        `Waiting for triage: ${triage.n}${triage.n ? `  → ${config.appUrl}/staff?view=triage` : ''}`,
        '',
        ...(overdueByDept.length ? ['Overdue by department:', ...overdueByDept.map((d) => `  ${d.name}: ${d.n}`), ''] : []),
        ...(escalated.length
          ? [
              'Newly escalated (passed deadline):',
              ...escalated.map((e) => (e.isSensitive ? `  ${code(e.number)}  (confidential)` : `  ${code(e.number)}  [${e.urgency}/5]  ${e.title}`)),
              '',
            ]
          : []),
        '— DAU Pulse',
      ].join('\n');
      for (const to of config.adminEmails) {
        messages.push({ to, subject: `DAU Pulse overview: ${triage.n} to triage, ${escalated.length} escalated`, body });
      }
    }
  }

  await queueEmails(db, messages);
  const deleted = await db
    .delete(drafts)
    .where(lt(drafts.createdAt, new Date(now.getTime() - 2 * 86_400_000)))
    .returning({ id: drafts.id });

  deps.onEmailQueued?.();
  return { escalated: escalated.length, digests, draftsDeleted: deleted.length };
}
