import { and, cosineDistance, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { drafts, issueEvents, issues, reports, type Channel, type Issue, type IssueSignals, type ReportAi } from '@/db/schema';
import { OTHER_LOCATION_SLUG, SENSITIVE_CATEGORY_SLUG } from '@/config/taxonomy';
import { UserError } from './errors';
import { queueEmail, queueEmails, templates } from './notify';
import { isPublicIssue } from './permissions';
import { redactPersonalData } from './redact';
import { checkTripwire, type TripwireResult } from './sensitive';
import { nextDueAt, dueAtFor } from './sla';
import { findCategory, findLocation, findSubcategory, loadTaxonomy, sensitiveCategory } from './taxonomy';
import type { Actor, Classification, Deps, Taxonomy } from './types';
import { computeUrgency, mergeSignals } from './urgency';

/**
 * The intake pipeline. Channel-agnostic: the web form calls it today, a WhatsApp adapter can call
 * the same two functions later.
 *
 *   analyzeReport()  text → AI classification + similar open issues + follow-up question (stores a draft)
 *   submitReport()   draft + reporter's confirmations → joins an existing issue or creates a new one
 *   reportSameIssue()  "me too" on an existing public issue, no text needed
 */

export const MIN_TEXT = 10;
export const MAX_TEXT = 2000;

export type MatchCandidate = {
  issueId: string;
  number: number;
  title: string;
  summary: string;
  locationName: string | null;
  status: 'open' | 'in_progress';
  reporterCount: number;
  similarity: number;
  strength: 'strong' | 'possible';
  alreadyReported: boolean;
};

export type Analysis = {
  draftId: string;
  expiresAt: string;
  /** false when the AI was unavailable: the reporter picks the category, staff double-check. */
  aiAvailable: boolean;
  categorySlug: string | null;
  subcategorySlug: string | null;
  locationSlug: string | null;
  locationDetail: string | null;
  title: string;
  summary: string;
  isSensitive: boolean;
  crisis: boolean;
  confidence: number | null;
  needsLocation: boolean;
  followUpQuestion: string | null;
  candidates: MatchCandidate[];
};

/** Stored server-side; the client only ever gets the draft id. */
type DraftAnalysis = {
  classification: Classification | null;
  classificationError: string | null;
  tripwire: TripwireResult;
  embedding: number[] | null;
  candidateIds: string[];
  topCandidate: { issueId: string; similarity: number } | null;
};

const DEFAULT_SIGNALS: IssueSignals = { severity: 'medium', safetyRisk: false, affectsMany: false, timeSensitive: false };

// ─── analyze ────────────────────────────────────────────────────────────────

export async function analyzeReport(
  deps: Deps,
  actor: Actor,
  input: { text: string; channel: Channel },
): Promise<Analysis> {
  const text = normalizeText(input.text);
  assertActive(actor);
  if (text.length < MIN_TEXT) throw new UserError('invalid_input', 'Please describe the problem in a bit more detail.');
  if (text.length > MAX_TEXT) throw new UserError('invalid_input', `Please keep it under ${MAX_TEXT} characters.`);

  const { db, config } = deps;
  const now = deps.now();
  const hourAgo = new Date(now.getTime() - 3600_000);
  const [{ n: recent }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(drafts)
    .where(and(eq(drafts.reporterId, actor.id), gt(drafts.createdAt, hourAgo)));
  if (recent >= config.maxAnalysesPerHour) {
    throw new UserError('rate_limited', 'Too many reports in the last hour. Please try again later.');
  }

  const taxonomy = await loadTaxonomy(db);
  const redacted = redactPersonalData(text, { reporterName: actor.name });
  const tripwire = checkTripwire(text);

  let classification: Classification | null = null;
  let classificationError: string | null = null;
  try {
    classification = await deps.classifier.classify(redacted, taxonomy);
  } catch (err) {
    classificationError = err instanceof Error ? err.message : String(err);
    console.error('[intake] classification failed; report will need triage', classificationError);
  }

  const isSensitive = tripwire.sensitive || !!classification?.isSensitive;

  // Sensitive reports are never matched against (or shown next to) other students' issues.
  let embedding: number[] | null = null;
  let candidates: MatchCandidate[] = [];
  if (!isSensitive) {
    try {
      [embedding] = await deps.embedder.embed([classification?.summary ?? redacted]);
    } catch (err) {
      console.error('[intake] embedding failed; skipping duplicate suggestions', err);
    }
    if (embedding) {
      candidates = await findCandidates(db, deps, taxonomy, actor, {
        embedding,
        categoryId: findCategory(taxonomy, classification?.categorySlug)?.id ?? null,
        locationId: findLocation(taxonomy, classification?.locationSlug)?.id ?? null,
      });
    }
  }

  const category = isSensitive ? sensitiveCategory(taxonomy) : findCategory(taxonomy, classification?.categorySlug);
  const needsLocation = !isSensitive && !!category?.requiresLocation && !classification?.locationSlug;

  const draftAnalysis: DraftAnalysis = {
    classification,
    classificationError,
    tripwire,
    embedding,
    candidateIds: candidates.map((c) => c.issueId),
    topCandidate: candidates[0] ? { issueId: candidates[0].issueId, similarity: candidates[0].similarity } : null,
  };
  const expiresAt = new Date(now.getTime() + config.draftTtlMinutes * 60_000);
  const [draft] = await db
    .insert(drafts)
    .values({ reporterId: actor.id, channel: input.channel, text, analysis: draftAnalysis, expiresAt, createdAt: now })
    .returning({ id: drafts.id });

  const fallback = fallbackTitle(redacted);
  return {
    draftId: draft.id,
    expiresAt: expiresAt.toISOString(),
    aiAvailable: classification !== null,
    categorySlug: category?.slug ?? null,
    subcategorySlug: isSensitive && classification?.categorySlug !== category?.slug ? null : (classification?.subcategorySlug ?? null),
    locationSlug: classification?.locationSlug ?? null,
    locationDetail: classification?.locationDetail ?? null,
    title: classification?.title ?? fallback,
    summary: classification?.summary ?? fallback,
    isSensitive,
    crisis: tripwire.crisis,
    confidence: classification?.confidence ?? null,
    needsLocation,
    followUpQuestion: needsLocation ? 'Where on campus is this happening? Pick the place, and add a room or floor if it helps.' : null,
    candidates,
  };
}

async function findCandidates(
  db: Db,
  deps: Deps,
  taxonomy: Taxonomy,
  actor: Actor,
  q: { embedding: number[]; categoryId: string | null; locationId: string | null },
): Promise<MatchCandidate[]> {
  const { config } = deps;
  const since = new Date(deps.now().getTime() - config.matchWindowDays * 86_400_000);
  const distance = sql<number>`${cosineDistance(issues.embedding, q.embedding)}`.mapWith(Number);

  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      summary: issues.summary,
      categoryId: issues.categoryId,
      locationId: issues.locationId,
      status: issues.status,
      reporterCount: issues.reporterCount,
      distance,
    })
    .from(issues)
    .where(
      and(
        inArray(issues.status, ['open', 'in_progress']),
        isNull(issues.mergedIntoId),
        eq(issues.isSensitive, false),
        eq(issues.isConfidential, false),
        isNotNull(issues.embedding),
        gt(issues.createdAt, since),
        // Two different places are two different problems.
        q.locationId ? or(isNull(issues.locationId), eq(issues.locationId, q.locationId)) : undefined,
      ),
    )
    .orderBy(distance)
    .limit(10);

  const kept = rows
    .map((r) => ({ ...r, similarity: 1 - r.distance }))
    // Same category: show possible matches. Different category: only near-identical ones
    // (the AI can file the same problem under two categories).
    .filter((r) =>
      r.categoryId !== null && r.categoryId === q.categoryId ? r.similarity >= config.possibleMatch : r.similarity >= config.strongMatch,
    )
    .slice(0, 3);
  if (kept.length === 0) return [];

  const mine = await db
    .select({ issueId: reports.issueId })
    .from(reports)
    .where(and(eq(reports.reporterId, actor.id), inArray(reports.issueId, kept.map((k) => k.id))));
  const mineSet = new Set(mine.map((m) => m.issueId));

  return kept.map((r) => ({
    issueId: r.id,
    number: r.number,
    title: r.title,
    summary: r.summary,
    locationName: taxonomy.locations.find((l) => l.id === r.locationId)?.name ?? null,
    status: r.status as 'open' | 'in_progress',
    reporterCount: r.reporterCount,
    similarity: Math.round(r.similarity * 1000) / 1000,
    strength: r.similarity >= config.strongMatch ? 'strong' : 'possible',
    alreadyReported: mineSet.has(r.id),
  }));
}

// ─── submit ─────────────────────────────────────────────────────────────────

export const submitInputSchema = z.object({
  draftId: z.uuid(),
  choice: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('new') }),
    z.object({ kind: z.literal('join'), issueId: z.uuid() }),
  ]),
  categorySlug: z.string().max(64).nullish(),
  subcategorySlug: z.string().max(64).nullish(),
  locationSlug: z.string().max(64).nullish(),
  locationDetail: z.string().max(120).nullish(),
  isAnonymous: z.boolean().default(false),
  isConfidential: z.boolean().default(false),
});
export type SubmitInput = z.input<typeof submitInputSchema>;

export type SubmitResult = { issueId: string; issueNumber: number; joined: boolean; isSensitive: boolean };

export async function submitReport(deps: Deps, actor: Actor, rawInput: SubmitInput): Promise<SubmitResult> {
  assertActive(actor);
  const input = submitInputSchema.parse(rawInput);
  const { db } = deps;
  const now = deps.now();
  await assertReportRateLimit(deps, actor, now);

  const [draft] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, input.draftId), eq(drafts.reporterId, actor.id)));
  if (!draft) throw new UserError('not_found', 'This report could not be found. Please start again.');
  if (draft.consumedAt) throw new UserError('conflict', 'This report was already submitted.');
  if (draft.expiresAt < now) throw new UserError('expired', 'This took a while, so please check your report again.');

  const analysis = draft.analysis as DraftAnalysis;
  const taxonomy = await loadTaxonomy(db);

  const result = await db.transaction(async (tx) => {
    // Claim the draft first: a double-click or retry can't create two issues.
    const claimed = await tx
      .update(drafts)
      .set({ consumedAt: now })
      .where(and(eq(drafts.id, draft.id), isNull(drafts.consumedAt)))
      .returning({ id: drafts.id });
    if (claimed.length === 0) throw new UserError('conflict', 'This report was already submitted.');

    // Sensitive if the tripwire or the AI says so, or the student chose the grievance category themselves.
    const isSensitive =
      analysis.tripwire.sensitive || !!analysis.classification?.isSensitive || input.categorySlug === SENSITIVE_CATEGORY_SLUG;
    const ai = reportAi(analysis);

    if (input.choice.kind === 'join') {
      if (isSensitive) throw new UserError('invalid_input', 'Sensitive reports are always kept separate.');
      const issue = await lockIssue(tx, input.choice.issueId);
      if (!issue || !isPublicIssue(issue) || !['open', 'in_progress'].includes(issue.status)) {
        throw new UserError('not_found', 'That issue is no longer open. Please submit yours as a new report.');
      }
      await attachReport(tx, deps, issue, actor, {
        channel: draft.channel,
        text: draft.text,
        ai,
        signals: analysis.classification ? pickSignals(analysis.classification) : null,
        isAnonymous: input.isAnonymous,
        now,
      });
      return { issueId: issue.id, issueNumber: issue.number, joined: true, isSensitive: false };
    }

    return createIssue(tx, deps, taxonomy, actor, {
      channel: draft.channel,
      text: draft.text,
      analysis,
      ai,
      isSensitive,
      input,
      now,
    });
  });

  deps.onEmailQueued?.();
  return result;
}

/** "Me too" from the public board or an issue page. */
export async function reportSameIssue(deps: Deps, actor: Actor, issueId: string): Promise<SubmitResult> {
  assertActive(actor);
  const now = deps.now();
  await assertReportRateLimit(deps, actor, now);
  const result = await deps.db.transaction(async (tx) => {
    const issue = await lockIssue(tx, issueId);
    if (!issue || !isPublicIssue(issue) || !['open', 'in_progress'].includes(issue.status)) {
      throw new UserError('not_found', 'That issue is no longer open.');
    }
    await attachReport(tx, deps, issue, actor, {
      channel: 'web',
      text: null,
      ai: null,
      signals: null,
      isAnonymous: false,
      now,
    });
    return { issueId: issue.id, issueNumber: issue.number, joined: true, isSensitive: false };
  });
  deps.onEmailQueued?.();
  return result;
}

async function createIssue(
  tx: Db,
  deps: Deps,
  taxonomy: Taxonomy,
  actor: Actor,
  p: {
    channel: Channel;
    text: string;
    analysis: DraftAnalysis;
    ai: ReportAi;
    isSensitive: boolean;
    input: z.output<typeof submitInputSchema>;
    now: Date;
  },
): Promise<SubmitResult> {
  const { classification } = p.analysis;
  const { input } = p;

  // Category: sensitive always goes to the grievance committee; otherwise the reporter's pick wins.
  const aiCategory = findCategory(taxonomy, classification?.categorySlug);
  const picked = findCategory(taxonomy, input.categorySlug);
  const category = p.isSensitive ? sensitiveCategory(taxonomy) : (picked ?? aiCategory);
  // Only a correction if the AI actually suggested something different.
  const categoryCorrected = !p.isSensitive && !!picked && !!aiCategory && picked.slug !== aiCategory.slug;

  const subcategory =
    findSubcategory(category, input.subcategorySlug) ??
    (category?.slug === aiCategory?.slug ? findSubcategory(category, classification?.subcategorySlug) : undefined);
  const location = findLocation(taxonomy, input.locationSlug) ?? findLocation(taxonomy, classification?.locationSlug);
  const locationDetail = (input.locationDetail ?? classification?.locationDetail ?? '').trim() || null;

  if (!category) throw new UserError('invalid_input', 'Please choose what kind of problem this is.');
  if (category.requiresLocation && !location && !p.isSensitive) {
    throw new UserError('invalid_input', 'Please choose where on campus this is happening.');
  }
  if (location?.slug === OTHER_LOCATION_SLUG && !locationDetail) {
    throw new UserError('invalid_input', 'Please describe where it is.');
  }

  const lowConfidence = !!classification && !categoryCorrected && classification.confidence < deps.config.triageConfidence;
  const needsTriage = !p.isSensitive && lowConfidence;

  const signals = classification ? pickSignals(classification) : DEFAULT_SIGNALS;
  const urgency = computeUrgency({ ...signals, isSensitive: p.isSensitive, reporterCount: 1 });
  const fallback = fallbackTitle(redactPersonalData(p.text, { reporterName: actor.name }));
  const title = p.isSensitive ? 'Confidential report' : (classification?.title ?? fallback);
  const summary = classification?.summary ?? fallback;

  const [issue] = await tx
    .insert(issues)
    .values({
      title,
      summary,
      categoryId: category.id,
      subcategoryId: subcategory?.id ?? null,
      locationId: location?.id ?? null,
      locationDetail,
      departmentId: category.departmentId,
      status: 'open',
      urgency,
      signals,
      isSensitive: p.isSensitive,
      isConfidential: p.isSensitive || input.isConfidential,
      needsTriage,
      reporterCount: 1,
      possibleDuplicateOfId: p.isSensitive ? null : (p.analysis.topCandidate?.issueId ?? null),
      embedding: p.isSensitive ? null : p.analysis.embedding,
      dueAt: dueAtFor(p.now, urgency),
      createdAt: p.now,
      updatedAt: p.now,
    })
    .returning();

  await tx.insert(reports).values({
    issueId: issue.id,
    reporterId: actor.id,
    channel: p.channel,
    text: p.text,
    isAnonymous: input.isAnonymous,
    ai: p.ai,
    categoryCorrected,
    createdAt: p.now,
  });
  await tx.insert(issueEvents).values({
    issueId: issue.id,
    actorId: null,
    type: 'created',
    isPublic: true,
    data: { channel: p.channel, urgency, needsTriage },
    createdAt: p.now,
  });

  const { appUrl } = deps.config;
  await queueEmail(tx, {
    to: actor.email,
    ...(p.isSensitive ? templates.sensitiveReceived(appUrl, issue) : templates.received(appUrl, issue, false)),
  });
  if (p.isSensitive || urgency >= 4) await alertDepartment(tx, appUrl, taxonomy, issue);

  return { issueId: issue.id, issueNumber: issue.number, joined: false, isSensitive: p.isSensitive };
}

/** Add a student's report to an existing issue and recompute its priority. */
export async function attachReport(
  tx: Db,
  deps: Deps,
  issue: Issue,
  actor: Actor,
  r: {
    channel: Channel;
    text: string | null;
    ai: ReportAi | null;
    signals: IssueSignals | null;
    isAnonymous: boolean;
    now: Date;
  },
): Promise<void> {
  const inserted = await tx
    .insert(reports)
    .values({
      issueId: issue.id,
      reporterId: actor.id,
      channel: r.channel,
      text: r.text,
      isAnonymous: r.isAnonymous,
      ai: r.ai,
      createdAt: r.now,
    })
    .onConflictDoNothing({ target: [reports.issueId, reports.reporterId] })
    .returning({ id: reports.id });
  if (inserted.length === 0) throw new UserError('conflict', `You already reported this issue (DP-${issue.number}).`);

  const [{ n: reporterCount }] = await tx
    .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
    .from(reports)
    .where(eq(reports.issueId, issue.id));
  const signals = r.signals ? mergeSignals(issue.signals, r.signals) : issue.signals;
  const urgency = Math.max(issue.urgency, computeUrgency({ ...signals, isSensitive: issue.isSensitive, reporterCount }));

  const [updated] = await tx
    .update(issues)
    .set({
      reporterCount,
      signals,
      urgency,
      dueAt: nextDueAt(issue.createdAt, urgency, issue.dueAt),
      updatedAt: r.now,
    })
    .where(eq(issues.id, issue.id))
    .returning();

  await tx.insert(issueEvents).values({
    issueId: issue.id,
    actorId: null,
    type: 'report_added',
    isPublic: true,
    data: { reporterCount, urgency, previousUrgency: issue.urgency },
    createdAt: r.now,
  });

  const { appUrl } = deps.config;
  await queueEmail(tx, { to: actor.email, ...templates.received(appUrl, updated, true) });
  if (issue.urgency < 4 && urgency >= 4) {
    await alertDepartment(tx, appUrl, await loadTaxonomy(tx), updated);
  }
}

/** Urgent and sensitive issues are emailed to the responsible department straight away. */
export async function alertDepartment(tx: Db, appUrl: string, taxonomy: Taxonomy, issue: Issue) {
  const dept = taxonomy.departments.find((d) => d.id === issue.departmentId);
  if (!dept?.email) return;
  await queueEmails(tx, [{ to: dept.email, ...templates.urgentAlert(appUrl, issue) }]);
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function lockIssue(tx: Db, issueId: string): Promise<Issue | undefined> {
  // Row lock: concurrent "me too"s on the same issue are serialised, so counts stay exact.
  const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
  return issue;
}

async function assertReportRateLimit(deps: Deps, actor: Actor, now: Date) {
  const hourAgo = new Date(now.getTime() - 3600_000);
  const [{ n }] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.reporterId, actor.id), gt(reports.createdAt, hourAgo)));
  if (n >= deps.config.maxReportsPerHour) {
    throw new UserError('rate_limited', 'You have sent a lot of reports in the last hour. Please try again later.');
  }
}

function assertActive(actor: Actor) {
  if (!actor.active) throw new UserError('forbidden', 'Your account is disabled.');
}

function pickSignals(c: Classification): IssueSignals {
  return { severity: c.severity, safetyRisk: c.safetyRisk, affectsMany: c.affectsMany, timeSensitive: c.timeSensitive };
}

function reportAi(a: DraftAnalysis): ReportAi {
  const c = a.classification;
  return {
    model: c?.model ?? null,
    categorySlug: c?.categorySlug ?? null,
    subcategorySlug: c?.subcategorySlug ?? null,
    locationSlug: c?.locationSlug ?? null,
    confidence: c?.confidence ?? null,
    isSensitive: c?.isSensitive ?? false,
    tripwire: a.tripwire.matched,
    ...(a.classificationError ? { error: a.classificationError.slice(0, 500) } : {}),
  };
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 59).trimEnd()}…` : oneLine;
}
