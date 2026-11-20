import { and, eq, isNull, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { issueEvents, issues, reports, users, type Issue } from '@/db/schema';
import { UserError } from './errors';
import { alertDepartment } from './intake';
import { code, queueEmail, queueEmails, reporterEmails, templates } from './notify';
import { canStaffAccessIssue, isStaff } from './permissions';
import { nextDueAt } from './sla';
import { findCategory, findLocation, findSubcategory, loadTaxonomy, sensitiveCategory } from './taxonomy';
import type { Actor, Deps } from './types';
import { computeUrgency, mergeSignals } from './urgency';

/** Load an issue for a staff action, enforcing access. Locks the row for the transaction. */
async function loadForStaff(tx: Db, actor: Actor, issueId: string): Promise<Issue> {
  if (!isStaff(actor)) throw new UserError('forbidden', 'Staff access required.');
  const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
  if (!issue || !canStaffAccessIssue(actor, issue)) throw new UserError('not_found', 'Issue not found.');
  return issue;
}

// ─── status ─────────────────────────────────────────────────────────────────

export const statusInputSchema = z.object({
  issueId: z.uuid(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  /** Shown to reporters. Required when resolving or closing so students know what happened. */
  note: z.string().trim().max(1000).optional(),
});

export async function changeStatus(deps: Deps, actor: Actor, raw: z.input<typeof statusInputSchema>) {
  const input = statusInputSchema.parse(raw);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const issue = await loadForStaff(tx, actor, input.issueId);
    if (issue.mergedIntoId) throw new UserError('invalid_input', 'This issue was merged into another one.');
    if (issue.status === input.status) return;
    const note = input.note || null;
    if ((input.status === 'resolved' || input.status === 'closed') && !note) {
      throw new UserError('invalid_input', 'Add a short note for the students: what was done, or why it is closed.');
    }

    const reopening = input.status === 'open' || input.status === 'in_progress';
    await tx
      .update(issues)
      .set({
        status: input.status,
        updatedAt: now,
        resolvedAt: input.status === 'resolved' ? now : reopening ? null : issue.resolvedAt,
        resolutionNote: reopening ? issue.resolutionNote : note,
        // Reopening restarts the clock from now with the same urgency.
        ...(issue.status === 'resolved' || issue.status === 'closed'
          ? { dueAt: nextDueAt(now, issue.urgency, null), escalatedAt: null }
          : {}),
      })
      .where(eq(issues.id, issue.id));
    await tx.insert(issueEvents).values({
      issueId: issue.id,
      actorId: actor.id,
      type: 'status_changed',
      isPublic: true,
      data: { from: issue.status, to: input.status, note },
      createdAt: now,
    });

    const emails = await reporterEmails(tx, issue.id);
    const tpl = templates.statusChanged(deps.config.appUrl, issue, input.status, note);
    await queueEmails(
      tx,
      emails.map((to) => ({ to, ...tpl })),
    );
  });
  deps.onEmailQueued?.();
}

// ─── assignment ─────────────────────────────────────────────────────────────

export async function assignIssue(deps: Deps, actor: Actor, issueId: string, assigneeId: string | null) {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const issue = await loadForStaff(tx, actor, issueId);
    let assignee: { id: string; email: string; name: string | null } | null = null;
    if (assigneeId) {
      const [u] = await tx.select().from(users).where(eq(users.id, assigneeId));
      if (!u || !canStaffAccessIssue(u, issue)) {
        throw new UserError('invalid_input', 'That person cannot work on this issue.');
      }
      assignee = u;
    }
    if (issue.assigneeId === (assignee?.id ?? null)) return;
    await tx.update(issues).set({ assigneeId: assignee?.id ?? null, updatedAt: now }).where(eq(issues.id, issue.id));
    await tx.insert(issueEvents).values({
      issueId: issue.id,
      actorId: actor.id,
      type: 'assigned',
      isPublic: false,
      data: { assigneeId: assignee?.id ?? null, assigneeName: assignee?.name ?? assignee?.email ?? null },
      createdAt: now,
    });
    if (assignee && assignee.id !== actor.id) {
      await queueEmail(tx, { to: assignee.email, ...templates.assigned(deps.config.appUrl, issue) });
    }
  });
  deps.onEmailQueued?.();
}

// ─── reclassification ───────────────────────────────────────────────────────

export const reclassifyInputSchema = z.object({
  issueId: z.uuid(),
  categorySlug: z.string().max(64),
  subcategorySlug: z.string().max(64).nullish(),
  locationSlug: z.string().max(64).nullish(),
  locationDetail: z.string().trim().max(120).nullish(),
  isSensitive: z.boolean(),
});

/**
 * Change category / location / sensitivity. This also confirms an issue out of triage, and the
 * correction is what future model training learns from.
 */
export async function reclassifyIssue(
  deps: Deps,
  actor: Actor,
  raw: z.input<typeof reclassifyInputSchema>,
): Promise<{ stillAccessible: boolean }> {
  const input = reclassifyInputSchema.parse(raw);
  const now = deps.now();
  let stillAccessible = true;
  await deps.db.transaction(async (tx) => {
    const issue = await loadForStaff(tx, actor, input.issueId);
    const taxonomy = await loadTaxonomy(tx);
    const category = input.isSensitive ? sensitiveCategory(taxonomy) : findCategory(taxonomy, input.categorySlug);
    if (!category) throw new UserError('invalid_input', 'Unknown category.');
    if (!input.isSensitive && category.slug === sensitiveCategory(taxonomy).slug) {
      throw new UserError('invalid_input', 'Grievance issues must be marked sensitive.');
    }
    const subcategory = findSubcategory(category, input.subcategorySlug);
    const location = findLocation(taxonomy, input.locationSlug);
    const departmentChanged = category.departmentId !== issue.departmentId;
    const urgency = computeUrgency({ ...issue.signals, isSensitive: input.isSensitive, reporterCount: issue.reporterCount });

    const [updated] = await tx
      .update(issues)
      .set({
        categoryId: category.id,
        subcategoryId: subcategory?.id ?? null,
        locationId: location?.id ?? null,
        locationDetail: input.locationDetail === undefined ? issue.locationDetail : input.locationDetail || null,
        departmentId: category.departmentId,
        isSensitive: input.isSensitive,
        isConfidential: input.isSensitive || issue.isConfidential,
        title: input.isSensitive ? 'Confidential report' : issue.title,
        // Sensitive issues never take part in similarity matching.
        embedding: input.isSensitive ? null : issue.embedding,
        needsTriage: false,
        urgency,
        dueAt: nextDueAt(issue.createdAt, urgency, issue.dueAt),
        assigneeId: departmentChanged ? null : issue.assigneeId,
        updatedAt: now,
      })
      .where(eq(issues.id, issue.id))
      .returning();

    await tx.insert(issueEvents).values({
      issueId: issue.id,
      actorId: actor.id,
      type: 'reclassified',
      isPublic: false,
      data: {
        from: { categoryId: issue.categoryId, subcategoryId: issue.subcategoryId, locationId: issue.locationId, isSensitive: issue.isSensitive },
        to: { categoryId: category.id, subcategoryId: subcategory?.id ?? null, locationId: location?.id ?? null, isSensitive: input.isSensitive },
        departmentChanged,
      },
      createdAt: now,
    });
    if (departmentChanged) await alertDepartment(tx, deps.config.appUrl, taxonomy, updated);
    stillAccessible = canStaffAccessIssue(actor, updated);
  });
  deps.onEmailQueued?.();
  return { stillAccessible };
}

// ─── comments ───────────────────────────────────────────────────────────────

export async function addInternalNote(deps: Deps, actor: Actor, issueId: string, text: string) {
  const note = text.trim();
  if (!note) throw new UserError('invalid_input', 'Note is empty.');
  if (note.length > 2000) throw new UserError('invalid_input', 'Note is too long.');
  await deps.db.transaction(async (tx) => {
    const issue = await loadForStaff(tx, actor, issueId);
    await tx.insert(issueEvents).values({
      issueId: issue.id,
      actorId: actor.id,
      type: 'comment',
      isPublic: false,
      data: { text: note },
      createdAt: deps.now(),
    });
  });
}

// ─── merging duplicates ─────────────────────────────────────────────────────

/**
 * Merge `sourceId` into `targetId`. Reports move to the target (a student who reported both keeps
 * one report on the target; their other one stays visible on the closed source). The source is
 * closed with a pointer, and its reporters are told where to follow it.
 */
export async function mergeIssues(deps: Deps, actor: Actor, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new UserError('invalid_input', 'Cannot merge an issue into itself.');
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    // Lock in a stable order to avoid deadlocks between two opposite merges.
    const [firstId, secondId] = [sourceId, targetId].sort();
    const first = await loadForStaff(tx, actor, firstId);
    const second = await loadForStaff(tx, actor, secondId);
    const source = first.id === sourceId ? first : second;
    const target = first.id === targetId ? first : second;

    if (source.mergedIntoId || target.mergedIntoId) throw new UserError('invalid_input', 'One of these issues was already merged.');
    if (source.isSensitive !== target.isSensitive) {
      throw new UserError('invalid_input', 'Sensitive and non-sensitive issues cannot be merged.');
    }
    if (target.status === 'closed') throw new UserError('invalid_input', 'Reopen the target issue first.');

    const sourceEmails = await reporterEmails(tx, source.id);

    const r2 = alias(reports, 'r2');
    await tx
      .update(reports)
      .set({ issueId: target.id })
      .where(
        and(
          eq(reports.issueId, source.id),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(r2)
              .where(and(eq(r2.issueId, target.id), eq(r2.reporterId, reports.reporterId))),
          ),
        ),
      );

    const [{ n: reporterCount }] = await tx
      .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
      .from(reports)
      .where(eq(reports.issueId, target.id));
    const signals = mergeSignals(target.signals, source.signals);
    const urgency = Math.max(
      target.urgency,
      source.urgency,
      computeUrgency({ ...signals, isSensitive: target.isSensitive, reporterCount }),
    );
    const createdAt = source.createdAt < target.createdAt ? source.createdAt : target.createdAt;

    await tx
      .update(issues)
      .set({
        reporterCount,
        signals,
        urgency,
        dueAt: nextDueAt(createdAt, urgency, target.dueAt),
        updatedAt: now,
      })
      .where(eq(issues.id, target.id));
    await tx
      .update(issues)
      .set({
        status: 'closed',
        mergedIntoId: target.id,
        resolutionNote: `Merged into ${code(target.number)}`,
        possibleDuplicateOfId: null,
        updatedAt: now,
      })
      .where(eq(issues.id, source.id));
    // Anything else that pointed at the source as a possible duplicate now points at the target.
    await tx
      .update(issues)
      .set({ possibleDuplicateOfId: target.id })
      .where(and(eq(issues.possibleDuplicateOfId, source.id), isNull(issues.mergedIntoId)));

    await tx.insert(issueEvents).values([
      {
        issueId: source.id,
        actorId: actor.id,
        type: 'merged',
        isPublic: true,
        data: { into: target.id, intoNumber: target.number },
        createdAt: now,
      },
      {
        issueId: target.id,
        actorId: actor.id,
        type: 'merged',
        isPublic: true,
        data: { from: source.id, fromNumber: source.number, reporterCount },
        createdAt: now,
      },
    ]);

    const tpl = templates.merged(deps.config.appUrl, source, target);
    await queueEmails(
      tx,
      sourceEmails.map((to) => ({ to, ...tpl })),
    );
  });
  deps.onEmailQueued?.();
}

export async function dismissPossibleDuplicate(deps: Deps, actor: Actor, issueId: string) {
  await deps.db.transaction(async (tx) => {
    const issue = await loadForStaff(tx, actor, issueId);
    await tx.update(issues).set({ possibleDuplicateOfId: null, updatedAt: deps.now() }).where(eq(issues.id, issue.id));
  });
}
