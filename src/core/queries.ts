import { and, asc, cosineDistance, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@/db/client';
import {
  categories,
  departments,
  issueEvents,
  issues,
  locations,
  outbox,
  reports,
  subcategories,
  users,
  type IssueStatus,
} from '@/db/schema';
import { UserError } from './errors';
import { canReporterViewIssue, canStaffAccessIssue, isAdmin, isPublicIssue, isStaff, reporterDisplayName } from './permissions';
import type { Actor } from './types';

const ACTIVE: IssueStatus[] = ['open', 'in_progress'];

/** SQL version of canStaffAccessIssue, for list queries. Keep the two in sync (tested). */
export function staffAccessCondition(actor: Actor): SQL {
  const ownDept = actor.departmentId ? eq(issues.departmentId, actor.departmentId) : sql`false`;
  if (actor.role === 'admin') return or(eq(issues.isSensitive, false), ownDept)!;
  return ownDept;
}

// ─── staff queue ────────────────────────────────────────────────────────────

export type QueueView = 'department' | 'triage' | 'mine' | 'overdue' | 'all';
export type QueueFilters = {
  view?: QueueView;
  status?: IssueStatus | 'active' | 'any';
  category?: string;
  q?: string;
};

export async function listStaffQueue(db: Db, actor: Actor, filters: QueueFilters, now: Date) {
  if (!isStaff(actor)) throw new UserError('forbidden', 'Staff access required.');
  const view = filters.view ?? (actor.role === 'admin' ? 'all' : 'department');
  const status = filters.status ?? 'active';

  const conds: Array<SQL | undefined> = [staffAccessCondition(actor), isNull(issues.mergedIntoId)];
  if (view === 'department') conds.push(actor.departmentId ? eq(issues.departmentId, actor.departmentId) : sql`false`);
  if (view === 'triage') conds.push(eq(issues.needsTriage, true));
  if (view === 'mine') conds.push(eq(issues.assigneeId, actor.id));
  if (view === 'overdue') conds.push(lt(issues.dueAt, now), inArray(issues.status, ACTIVE));
  if (status === 'active') conds.push(inArray(issues.status, ACTIVE));
  else if (status !== 'any') conds.push(eq(issues.status, status));
  if (filters.category) conds.push(eq(categories.slug, filters.category));
  const q = filters.q?.trim();
  if (q) {
    const num = Number(q.replace(/^dp-?/i, ''));
    conds.push(
      Number.isInteger(num) && num > 0
        ? eq(issues.number, num)
        : or(ilike(issues.title, `%${q}%`), ilike(issues.summary, `%${q}%`)),
    );
  }

  const assignee = alias(users, 'assignee');
  return db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      urgency: issues.urgency,
      reporterCount: issues.reporterCount,
      isSensitive: issues.isSensitive,
      needsTriage: issues.needsTriage,
      possibleDuplicateOfId: issues.possibleDuplicateOfId,
      dueAt: issues.dueAt,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      categoryName: categories.name,
      locationName: locations.name,
      departmentName: departments.name,
      assigneeName: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})`,
    })
    .from(issues)
    .leftJoin(categories, eq(categories.id, issues.categoryId))
    .leftJoin(locations, eq(locations.id, issues.locationId))
    .leftJoin(departments, eq(departments.id, issues.departmentId))
    .leftJoin(assignee, eq(assignee.id, issues.assigneeId))
    .where(and(...conds))
    .orderBy(desc(issues.urgency), asc(issues.dueAt), asc(issues.createdAt))
    .limit(200);
}

export async function staffSummary(db: Db, actor: Actor, now: Date) {
  if (!isStaff(actor)) throw new UserError('forbidden', 'Staff access required.');
  const access = and(staffAccessCondition(actor), isNull(issues.mergedIntoId));
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${inArray(issues.status, ACTIVE)})::int`,
      overdue: sql<number>`count(*) filter (where ${and(inArray(issues.status, ACTIVE), lt(issues.dueAt, now))})::int`,
      newToday: sql<number>`count(*) filter (where ${gt(issues.createdAt, dayAgo)})::int`,
      triage: sql<number>`count(*) filter (where ${and(eq(issues.needsTriage, true), inArray(issues.status, ACTIVE))})::int`,
      resolvedWeek: sql<number>`count(*) filter (where ${and(eq(issues.status, 'resolved'), gt(issues.resolvedAt, new Date(now.getTime() - 7 * 86_400_000)))})::int`,
    })
    .from(issues)
    .where(access);
  return row;
}

// ─── staff issue detail ─────────────────────────────────────────────────────

export async function getStaffIssue(db: Db, actor: Actor, issueId: string) {
  if (!isStaff(actor)) throw new UserError('forbidden', 'Staff access required.');
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  if (!issue || !canStaffAccessIssue(actor, issue)) throw new UserError('not_found', 'Issue not found.');

  const assignee = alias(users, 'assignee');
  const [names] = await db
    .select({
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name,
      locationSlug: locations.slug,
      locationName: locations.name,
      departmentName: departments.name,
      assigneeName: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})`,
    })
    .from(issues)
    .leftJoin(categories, eq(categories.id, issues.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, issues.subcategoryId))
    .leftJoin(locations, eq(locations.id, issues.locationId))
    .leftJoin(departments, eq(departments.id, issues.departmentId))
    .leftJoin(assignee, eq(assignee.id, issues.assigneeId))
    .where(eq(issues.id, issue.id));

  const reportRows = await db
    .select({
      id: reports.id,
      text: reports.text,
      channel: reports.channel,
      isAnonymous: reports.isAnonymous,
      ai: reports.ai,
      categoryCorrected: reports.categoryCorrected,
      createdAt: reports.createdAt,
      reporterName: users.name,
      reporterEmail: users.email,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.issueId, issue.id))
    .orderBy(asc(reports.createdAt));

  const actorUser = alias(users, 'actor');
  const events = await db
    .select({
      id: issueEvents.id,
      type: issueEvents.type,
      data: issueEvents.data,
      isPublic: issueEvents.isPublic,
      createdAt: issueEvents.createdAt,
      actorName: sql<string | null>`coalesce(${actorUser.name}, ${actorUser.email})`,
    })
    .from(issueEvents)
    .leftJoin(actorUser, eq(actorUser.id, issueEvents.actorId))
    .where(eq(issueEvents.issueId, issue.id))
    .orderBy(asc(issueEvents.createdAt));

  const mergedFrom = await db
    .select({ id: issues.id, number: issues.number, title: issues.title })
    .from(issues)
    .where(eq(issues.mergedIntoId, issue.id));

  let mergedInto: { id: string; number: number; title: string } | null = null;
  if (issue.mergedIntoId) {
    [mergedInto] = await db
      .select({ id: issues.id, number: issues.number, title: issues.title })
      .from(issues)
      .where(eq(issues.id, issue.mergedIntoId));
  }

  // Duplicate candidates: the one flagged at intake, plus nearest open neighbours staff can see.
  const similar: Array<{ id: string; number: number; title: string; status: IssueStatus; reporterCount: number; similarity: number; flagged: boolean }> = [];
  if (issue.embedding && !issue.isSensitive && !issue.mergedIntoId) {
    const distance = sql<number>`${cosineDistance(issues.embedding, issue.embedding)}`.mapWith(Number);
    const rows = await db
      .select({ id: issues.id, number: issues.number, title: issues.title, status: issues.status, reporterCount: issues.reporterCount, distance })
      .from(issues)
      .where(
        and(
          staffAccessCondition(actor),
          ne(issues.id, issue.id),
          isNull(issues.mergedIntoId),
          isNotNull(issues.embedding),
          inArray(issues.status, ACTIVE),
        ),
      )
      .orderBy(distance)
      .limit(5);
    for (const r of rows) {
      const similarity = 1 - r.distance;
      if (similarity >= 0.8 || r.id === issue.possibleDuplicateOfId) {
        similar.push({ ...r, similarity: Math.round(similarity * 1000) / 1000, flagged: r.id === issue.possibleDuplicateOfId });
      }
    }
  }
  if (issue.possibleDuplicateOfId && !similar.some((s) => s.id === issue.possibleDuplicateOfId)) {
    const [dup] = await db.select().from(issues).where(eq(issues.id, issue.possibleDuplicateOfId));
    if (dup && canStaffAccessIssue(actor, dup) && !dup.mergedIntoId) {
      similar.unshift({ id: dup.id, number: dup.number, title: dup.title, status: dup.status, reporterCount: dup.reporterCount, similarity: 0, flagged: true });
    }
  }

  // People who can be assigned: active staff/admins of the issue's department.
  const assignable = issue.departmentId
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.departmentId, issue.departmentId), eq(users.active, true), inArray(users.role, ['staff', 'admin'])))
        .orderBy(asc(users.name))
    : [];

  return {
    issue: { ...issue, embedding: undefined },
    ...names,
    reports: reportRows.map((r) => ({
      id: r.id,
      text: r.text,
      channel: r.channel,
      ai: r.ai,
      categoryCorrected: r.categoryCorrected,
      createdAt: r.createdAt,
      isAnonymous: r.isAnonymous,
      reporter: reporterDisplayName(r, { name: r.reporterName, email: r.reporterEmail }),
    })),
    events,
    mergedFrom,
    mergedInto,
    similar,
    assignable,
  };
}

// ─── students ───────────────────────────────────────────────────────────────

export async function listPublicBoard(db: Db, actor: Actor, filters: { category?: string; q?: string }, now: Date) {
  const recentlyResolved = new Date(now.getTime() - 14 * 86_400_000);
  const conds: Array<SQL | undefined> = [
    eq(issues.isSensitive, false),
    eq(issues.isConfidential, false),
    isNull(issues.mergedIntoId),
    or(inArray(issues.status, ACTIVE), and(eq(issues.status, 'resolved'), gt(issues.resolvedAt, recentlyResolved))),
  ];
  if (filters.category) conds.push(eq(categories.slug, filters.category));
  const q = filters.q?.trim();
  if (q) conds.push(or(ilike(issues.title, `%${q}%`), ilike(issues.summary, `%${q}%`)));

  const mine = db
    .select({ issueId: reports.issueId })
    .from(reports)
    .where(eq(reports.reporterId, actor.id))
    .as('mine');

  return db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      summary: issues.summary,
      status: issues.status,
      reporterCount: issues.reporterCount,
      urgency: issues.urgency,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      categoryName: categories.name,
      locationName: locations.name,
      alreadyReported: sql<boolean>`${mine.issueId} is not null`,
    })
    .from(issues)
    .leftJoin(categories, eq(categories.id, issues.categoryId))
    .leftJoin(locations, eq(locations.id, issues.locationId))
    .leftJoin(mine, eq(mine.issueId, issues.id))
    .where(and(...conds))
    .orderBy(sql`case when ${issues.status} = 'resolved' then 1 else 0 end`, desc(issues.reporterCount), desc(issues.updatedAt))
    .limit(100);
}

export async function listMyReports(db: Db, actor: Actor) {
  const into = alias(issues, 'into');
  return db
    .select({
      reportId: reports.id,
      reportedAt: reports.createdAt,
      issueId: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      reporterCount: issues.reporterCount,
      updatedAt: issues.updatedAt,
      isSensitive: issues.isSensitive,
      categoryName: categories.name,
      mergedIntoNumber: into.number,
    })
    .from(reports)
    .innerJoin(issues, eq(issues.id, reports.issueId))
    .leftJoin(categories, eq(categories.id, issues.categoryId))
    .leftJoin(into, eq(into.id, issues.mergedIntoId))
    .where(eq(reports.reporterId, actor.id))
    .orderBy(desc(issues.updatedAt));
}

/** What a student sees on /issues/DP-n: no other students' texts or identities, no internal notes. */
export async function getReporterIssue(db: Db, actor: Actor, number: number) {
  const [issue] = await db.select().from(issues).where(eq(issues.number, number));
  if (!issue) throw new UserError('not_found', 'Issue not found.');
  const [mine] = await db
    .select({ id: reports.id, text: reports.text, createdAt: reports.createdAt })
    .from(reports)
    .where(and(eq(reports.issueId, issue.id), eq(reports.reporterId, actor.id)));
  const staffCanSee = canStaffAccessIssue(actor, issue);
  if (!canReporterViewIssue(issue, !!mine) && !staffCanSee) throw new UserError('not_found', 'Issue not found.');

  const [names] = await db
    .select({ categoryName: categories.name, locationName: locations.name, departmentName: departments.name })
    .from(issues)
    .leftJoin(categories, eq(categories.id, issues.categoryId))
    .leftJoin(locations, eq(locations.id, issues.locationId))
    .leftJoin(departments, eq(departments.id, issues.departmentId))
    .where(eq(issues.id, issue.id));

  const events = await db
    .select({ id: issueEvents.id, type: issueEvents.type, data: issueEvents.data, createdAt: issueEvents.createdAt })
    .from(issueEvents)
    .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.isPublic, true)))
    .orderBy(asc(issueEvents.createdAt));

  let mergedIntoNumber: number | null = null;
  if (issue.mergedIntoId) {
    const [m] = await db.select({ number: issues.number }).from(issues).where(eq(issues.id, issue.mergedIntoId));
    mergedIntoNumber = m?.number ?? null;
  }

  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    summary: issue.summary,
    status: issue.status,
    reporterCount: issue.reporterCount,
    isSensitive: issue.isSensitive,
    isConfidential: issue.isConfidential,
    createdAt: issue.createdAt,
    resolvedAt: issue.resolvedAt,
    resolutionNote: issue.resolutionNote,
    mergedIntoNumber,
    ...names,
    events: events.map((e) => ({ ...e, data: publicEventData(e.type, e.data) })),
    myReport: mine ?? null,
    canReportToo: !mine && isPublicIssue(issue) && ACTIVE.includes(issue.status),
    staffCanSee,
  };
}

/** Strip anything internal from event payloads before showing them to students. */
function publicEventData(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'status_changed':
      return { from: data.from, to: data.to, note: data.note };
    case 'report_added':
      return { reporterCount: data.reporterCount };
    case 'merged':
      return { intoNumber: data.intoNumber, fromNumber: data.fromNumber };
    default:
      return {};
  }
}

export async function listAdminOutbox(db: Db, actor: Actor) {
  if (!isAdmin(actor)) throw new UserError('forbidden', 'Admins only.');
  return db
    .select({
      id: outbox.id,
      toEmail: outbox.toEmail,
      subject: outbox.subject,
      status: outbox.status,
      attempts: outbox.attempts,
      lastError: outbox.lastError,
      createdAt: outbox.createdAt,
      sentAt: outbox.sentAt,
    })
    .from(outbox)
    .orderBy(desc(outbox.createdAt))
    .limit(100);
}
