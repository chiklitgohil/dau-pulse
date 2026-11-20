import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, Copy, Lock, ShieldQuestion } from 'lucide-react';
import { getDb } from '@/db/client';
import type { IssueStatus } from '@/db/schema';
import { isUserError } from '@/core/errors';
import { getStaffIssue } from '@/core/queries';
import { loadTaxonomy } from '@/core/taxonomy';
import { isOverdue } from '@/core/sla';
import { explainUrgency } from '@/core/urgency';
import { requireStaff } from '@/lib/session';
import { assignAction, changeStatusAction, dismissDuplicateAction, mergeAction, noteAction } from '@/app/actions/staff';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { STATUS_LABEL, StatusBadge, UrgencyBadge, formatDateTime, issueCode, relativeTime } from '@/components/ui';
import { ReclassifyForm } from './ReclassifyForm';

export const metadata: Metadata = { title: 'Issue' };

export default async function StaffIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();

  let d: Awaited<ReturnType<typeof getStaffIssue>>;
  try {
    d = await getStaffIssue(db, actor, id);
  } catch (err) {
    if (isUserError(err)) notFound();
    throw err;
  }
  const taxonomy = await loadTaxonomy(db);
  const { issue } = d;
  const now = new Date();
  const overdue = isOverdue(issue, now);
  const active = issue.status === 'open' || issue.status === 'in_progress';
  const merged = !!issue.mergedIntoId;

  return (
    <div className="space-y-6">
      <Link href="/staff" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Back to queue
      </Link>

      <header className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-600">{issueCode(issue.number)}</span>
          <StatusBadge status={issue.status} />
          <UrgencyBadge urgency={issue.urgency} />
          {issue.isSensitive && (
            <span className="inline-flex items-center gap-1 font-medium text-violet-700">
              <Lock className="size-3.5" aria-hidden /> Confidential
            </span>
          )}
          {issue.needsTriage && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <ShieldQuestion className="size-3.5" aria-hidden /> AI was unsure: please confirm the category
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-bold text-slate-900">{issue.title}</h1>
        <p className="mt-1 text-slate-700">{issue.summary}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Category" value={[d.categoryName, d.subcategoryName].filter(Boolean).join(' › ') || 'Uncategorised'} />
          <Fact label="Where" value={[d.locationName, issue.locationDetail].filter(Boolean).join(', ') || '—'} />
          <Fact label="Team" value={d.departmentName ?? 'Triage'} />
          <Fact label="Reporters" value={String(issue.reporterCount)} />
          <Fact label="Reported" value={relativeTime(issue.createdAt, now)} />
          <Fact
            label="Due"
            value={issue.dueAt && active ? relativeTime(issue.dueAt, now) : '—'}
            className={overdue ? 'text-rose-700' : undefined}
          />
        </dl>
        <p className="mt-3 text-xs text-slate-500">Urgency {issue.urgency}/5: {explainUrgency({ ...issue.signals, isSensitive: issue.isSensitive, reporterCount: issue.reporterCount }).join(', ')}</p>
        {d.mergedInto && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
            Merged into{' '}
            <Link href={`/staff/issues/${d.mergedInto.id}`} className="font-semibold underline">
              {issueCode(d.mergedInto.number)} {d.mergedInto.title}
            </Link>
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">Reports ({d.reports.length})</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {d.reports.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{r.reporter}</span>
                    <span>· {formatDateTime(r.createdAt)}</span>
                    <span>· {r.channel}</span>
                    {r.categoryCorrected && <span className="font-medium text-amber-700">· student changed AI category</span>}
                  </div>
                  {r.text ? (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{r.text}</p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500 italic">Added themselves (“me too”)</p>
                  )}
                  {r.ai && (r.ai.error || r.ai.tripwire.length > 0) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Bot className="size-3" aria-hidden />
                      {r.ai.error ? 'AI unavailable for this report.' : `Flagged by keywords: ${r.ai.tripwire.join(', ')}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Activity</h2>
            <ol className="mt-3 space-y-3">
              {d.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-slate-800">
                    <span className="font-medium">{e.actorName ?? 'System'}</span> {describeEvent(e.type, e.data)}
                    {!e.isPublic && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 uppercase">internal</span>}
                  </p>
                  {typeof e.data.note === 'string' && e.data.note && (
                    <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 whitespace-pre-wrap text-slate-700">{e.data.note}</p>
                  )}
                  {e.type === 'comment' && typeof e.data.text === 'string' && (
                    <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 whitespace-pre-wrap text-slate-800">{e.data.text}</p>
                  )}
                  <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
            <ActionForm action={noteAction} resetOnSuccess className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="issueId" value={issue.id} />
              <label htmlFor="note" className="label">
                Internal note <span className="font-normal text-slate-500">(staff only)</span>
              </label>
              <textarea id="note" name="text" rows={2} required maxLength={2000} className="input" />
              <div className="mt-2 flex justify-end">
                <SubmitButton className="btn-secondary btn-sm">Add note</SubmitButton>
              </div>
            </ActionForm>
          </section>
        </div>

        <aside className="space-y-6">
          {!merged && (
            <section className="card p-5">
              <h2 className="font-semibold">Update status</h2>
              <ActionForm key={issue.status} action={changeStatusAction} resetOnSuccess className="mt-3 space-y-3">
                <input type="hidden" name="issueId" value={issue.id} />
                <select name="status" defaultValue={nextStatus(issue.status)} className="input" aria-label="New status">
                  {(['open', 'in_progress', 'resolved', 'closed'] as IssueStatus[])
                    .filter((s) => s !== issue.status)
                    .map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                </select>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={1000}
                  className="input"
                  placeholder="Note for the students (required when resolving or closing)"
                  aria-label="Note for students"
                />
                <p className="hint">All {issue.reporterCount} reporter{issue.reporterCount === 1 ? '' : 's'} will get an email.</p>
                <SubmitButton>Update</SubmitButton>
              </ActionForm>
            </section>
          )}

          {!merged && (
            <section className="card p-5">
              <h2 className="font-semibold">Owner</h2>
              <ActionForm key={issue.assigneeId ?? 'none'} action={assignAction} className="mt-3 flex gap-2">
                <input type="hidden" name="issueId" value={issue.id} />
                <select name="assigneeId" defaultValue={issue.assigneeId ?? ''} className="input" aria-label="Assignee">
                  <option value="">Unassigned</option>
                  {d.assignable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                      {u.id === actor.id ? ' (me)' : ''}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
              </ActionForm>
              {d.assignable.length === 0 && <p className="hint">No staff in this department yet. An admin can add people.</p>}
            </section>
          )}

          {!merged && d.similar.length > 0 && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Copy className="size-4 text-sky-700" aria-hidden /> Possible duplicates
              </h2>
              <p className="mt-1 text-xs text-slate-500">Merging moves this issue&apos;s reporters into the other one and closes this one.</p>
              <ul className="mt-3 space-y-3">
                {d.similar.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <Link href={`/staff/issues/${s.id}`} className="font-medium hover:underline">
                      {issueCode(s.number)} {s.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {s.reporterCount} reporters · {STATUS_LABEL[s.status]}
                      {s.similarity > 0 && ` · ${Math.round(s.similarity * 100)}% similar`}
                      {s.flagged && ' · flagged at intake'}
                    </p>
                    <ActionForm action={mergeAction} className="mt-2">
                      <input type="hidden" name="sourceId" value={issue.id} />
                      <input type="hidden" name="targetId" value={s.id} />
                      <SubmitButton className="btn-secondary btn-sm">Merge into {issueCode(s.number)}</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
              {issue.possibleDuplicateOfId && (
                <ActionForm action={dismissDuplicateAction} className="mt-3">
                  <input type="hidden" name="issueId" value={issue.id} />
                  <SubmitButton className="btn-ghost btn-sm">Not a duplicate</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {d.mergedFrom.length > 0 && (
            <section className="card p-5 text-sm">
              <h2 className="font-semibold">Merged into this</h2>
              <ul className="mt-2 space-y-1">
                {d.mergedFrom.map((m) => (
                  <li key={m.id}>
                    <Link href={`/staff/issues/${m.id}`} className="text-brand-700 hover:underline">
                      {issueCode(m.number)} {m.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!merged && (
            <section className="card p-5">
              <h2 className="font-semibold">Category & routing</h2>
              <ReclassifyForm
                issueId={issue.id}
                current={{
                  categorySlug: d.categorySlug ?? '',
                  subcategorySlug: d.subcategorySlug ?? '',
                  locationSlug: d.locationSlug ?? '',
                  locationDetail: issue.locationDetail ?? '',
                  isSensitive: issue.isSensitive,
                }}
                needsTriage={issue.needsTriage}
                categories={taxonomy.categories.map((c) => ({
                  slug: c.slug,
                  name: c.name,
                  subcategories: c.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
                }))}
                locations={taxonomy.locations.map((l) => ({ slug: l.slug, name: l.name }))}
              />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${className ?? ''}`}>{value}</dd>
    </div>
  );
}

function nextStatus(s: IssueStatus): IssueStatus {
  return s === 'open' ? 'in_progress' : s === 'in_progress' ? 'resolved' : 'open';
}

function describeEvent(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'created':
      return `created the issue${data.needsTriage ? ' (sent to triage)' : ''}`;
    case 'report_added':
      return `added a report (${data.reporterCount} total, urgency ${data.urgency})`;
    case 'status_changed':
      return `changed status ${STATUS_LABEL[data.from as IssueStatus] ?? data.from} → ${STATUS_LABEL[data.to as IssueStatus] ?? data.to}`;
    case 'assigned':
      return data.assigneeName ? `assigned it to ${data.assigneeName}` : 'unassigned it';
    case 'reclassified':
      return `changed the category${data.departmentChanged ? ' and moved it to another team' : ''}`;
    case 'comment':
      return 'added a note';
    case 'merged':
      return data.intoNumber ? `merged it into ${issueCode(Number(data.intoNumber))}` : `merged ${issueCode(Number(data.fromNumber))} into this`;
    case 'escalated':
      return 'escalated it: deadline passed';
    default:
      return type;
  }
}
