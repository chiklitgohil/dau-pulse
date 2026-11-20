import { and, asc, cosineDistance, eq, gt, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { issueEvents, issues, reports, type ReportAi } from '@/db/schema';
import { alertDepartment } from './intake';
import { redactPersonalData } from './redact';
import { checkTripwire } from './sensitive';
import { nextDueAt } from './sla';
import { loadTaxonomy, sensitiveCategory } from './taxonomy';
import type { Deps } from './types';
import { computeUrgency, mergeSignals } from './urgency';

/**
 * Issues created while the AI was unavailable have a raw-text title and no embedding, so they
 * can't be matched as duplicates. Once the AI is back, fill those in:
 *   - title / summary / signals from the classifier (the student's category choice is kept)
 *   - embedding, plus a "possible duplicate" flag if a near-identical open issue exists
 *   - if the AI now says it's sensitive, route it to the grievance committee (AI OR keywords rule)
 * Idempotent and safe to run from several places; runs from the cron routes and after submits.
 */
export async function backfillMissingAi(deps: Deps, limit = 10): Promise<{ enriched: number; failed: number }> {
  const { db } = deps;
  const now = deps.now();
  const since = new Date(now.getTime() - 7 * 86_400_000);

  const candidates = await db
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        // Note: the embedding may exist (embeddings have their own quota); what matters is that
        // classification failed. A backfilled report's `ai` no longer has an `error` key.
        eq(issues.isSensitive, false),
        isNull(issues.mergedIntoId),
        inArray(issues.status, ['open', 'in_progress']),
        gt(issues.createdAt, since),
        // Only those whose first report recorded an AI failure.
        sql`exists (select 1 from ${reports} r where r.issue_id = ${issues.id} and r.ai ? 'error')`,
      ),
    )
    .orderBy(asc(issues.createdAt))
    .limit(limit);
  if (candidates.length === 0) return { enriched: 0, failed: 0 };

  const taxonomy = await loadTaxonomy(db);
  let enriched = 0;
  let failed = 0;

  for (const { id } of candidates) {
    try {
      const [first] = await db
        .select()
        .from(reports)
        .where(and(eq(reports.issueId, id), isNotNull(reports.text)))
        .orderBy(asc(reports.createdAt))
        .limit(1);
      if (!first?.text) continue;

      const redacted = redactPersonalData(first.text);
      const c = await deps.classifier.classify(redacted, taxonomy);
      const tripwire = checkTripwire(first.text);
      const sensitive = c.isSensitive || tripwire.sensitive;
      const [embedding] = sensitive ? [null] : await deps.embedder.embed([c.summary]);

      await db.transaction(async (tx) => {
        const [issue] = await tx.select().from(issues).where(eq(issues.id, id)).for('update');
        const [current] = await tx.select({ ai: reports.ai }).from(reports).where(eq(reports.id, first.id));
        if (!issue || issue.isSensitive || !current?.ai?.error) return; // someone else got here first

        const ai: ReportAi = {
          model: c.model,
          categorySlug: c.categorySlug,
          subcategorySlug: c.subcategorySlug,
          locationSlug: c.locationSlug,
          confidence: c.confidence,
          isSensitive: c.isSensitive,
          tripwire: tripwire.matched,
        };
        const chosen = taxonomy.categories.find((cat) => cat.id === issue.categoryId);
        await tx
          .update(reports)
          .set({ ai: { ...ai, backfilled: true }, categoryCorrected: !!chosen && !!c.categorySlug && chosen.slug !== c.categorySlug })
          .where(eq(reports.id, first.id));

        if (sensitive) {
          const cat = sensitiveCategory(taxonomy);
          const [updated] = await tx
            .update(issues)
            .set({
              isSensitive: true,
              isConfidential: true,
              categoryId: cat.id,
              subcategoryId: null,
              departmentId: cat.departmentId,
              title: 'Confidential report',
              summary: c.summary,
              urgency: 5,
              dueAt: nextDueAt(issue.createdAt, 5, issue.dueAt),
              assigneeId: null,
              updatedAt: now,
            })
            .where(eq(issues.id, id))
            .returning();
          await tx.insert(issueEvents).values({
            issueId: id,
            actorId: null,
            type: 'reclassified',
            isPublic: false,
            data: { reason: 'AI flagged as sensitive after it became available', to: { isSensitive: true } },
            createdAt: now,
          });
          await alertDepartment(tx, deps.config.appUrl, taxonomy, updated);
          return;
        }

        const signals = mergeSignals(issue.signals, c);
        const urgency = Math.max(issue.urgency, computeUrgency({ ...signals, isSensitive: false, reporterCount: issue.reporterCount }));

        // Flag (never merge) a near-identical open issue for staff.
        let possibleDuplicateOfId = issue.possibleDuplicateOfId;
        if (!possibleDuplicateOfId && embedding && !issue.isConfidential) {
          const distance = sql<number>`${cosineDistance(issues.embedding, embedding)}`.mapWith(Number);
          const [nearest] = await tx
            .select({ id: issues.id, distance })
            .from(issues)
            .where(
              and(
                ne(issues.id, id),
                isNotNull(issues.embedding),
                isNull(issues.mergedIntoId),
                eq(issues.isSensitive, false),
                inArray(issues.status, ['open', 'in_progress']),
                issue.categoryId ? eq(issues.categoryId, issue.categoryId) : undefined,
              ),
            )
            .orderBy(distance)
            .limit(1);
          if (nearest && 1 - nearest.distance >= deps.config.strongMatch) possibleDuplicateOfId = nearest.id;
        }

        await tx
          .update(issues)
          .set({
            title: issue.isConfidential ? issue.title : c.title,
            summary: c.summary,
            signals,
            urgency,
            dueAt: nextDueAt(issue.createdAt, urgency, issue.dueAt),
            embedding: embedding ?? issue.embedding,
            possibleDuplicateOfId,
            updatedAt: now,
          })
          .where(eq(issues.id, id));
      });
      enriched++;
    } catch (err) {
      failed++;
      console.error('[backfill] still cannot reach the AI; will retry later', err instanceof Error ? err.message : err);
      break; // the AI is probably still down; don't hammer it
    }
  }
  if (enriched) deps.onEmailQueued?.();
  return { enriched, failed };
}
