import type { Metadata } from 'next';
import Link from 'next/link';
import { Copy, Lock, Search, ShieldQuestion } from 'lucide-react';
import { getDb } from '@/db/client';
import type { IssueStatus } from '@/db/schema';
import { listStaffQueue, staffSummary, type QueueView } from '@/core/queries';
import { loadTaxonomy } from '@/core/taxonomy';
import { isOverdue } from '@/core/sla';
import { requireStaff } from '@/lib/session';
import { EmptyState, StatusBadge, UrgencyBadge, issueCode, relativeTime } from '@/components/ui';

export const metadata: Metadata = { title: 'Staff queue' };

const VIEWS: Array<{ id: QueueView; label: string; adminOnly?: boolean }> = [
  { id: 'department', label: 'My department' },
  { id: 'mine', label: 'Assigned to me' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'triage', label: 'Needs triage', adminOnly: true },
  { id: 'all', label: 'All', adminOnly: true },
];

type Search = { view?: string; status?: string; category?: string; q?: string; moved?: string };

export default async function StaffQueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const isAdmin = actor.role === 'admin';
  const views = VIEWS.filter((v) => !v.adminOnly || isAdmin).filter((v) => v.id !== 'department' || actor.departmentId);
  const defaultView: QueueView = actor.departmentId ? 'department' : isAdmin ? 'all' : 'mine';
  const view = (views.find((v) => v.id === sp.view)?.id ?? defaultView) as QueueView;
  const status = (['open', 'in_progress', 'resolved', 'closed', 'any'].includes(sp.status ?? '') ? sp.status : 'active') as IssueStatus | 'active' | 'any';

  const db = await getDb();
  const now = new Date();
  const [rows, summary, taxonomy] = await Promise.all([
    listStaffQueue(db, actor, { view, status, category: sp.category || undefined, q: sp.q }, now),
    staffSummary(db, actor, now),
    loadTaxonomy(db),
  ]);
  const dept = taxonomy.departments.find((d) => d.id === actor.departmentId);

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { view, status: status === 'active' ? undefined : status, category: sp.category, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/staff?${p}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Staff queue</h1>
          <p className="mt-1 text-slate-600">
            {dept ? dept.name : isAdmin ? 'Administrator' : 'No department assigned yet. Ask an admin to add you to one.'}
          </p>
        </div>
      </div>

      {sp.moved && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">The issue was moved to another team.</p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Open" value={summary.active} />
        <Tile label="Overdue" value={summary.overdue} tone={summary.overdue ? 'bad' : undefined} />
        <Tile label="New today" value={summary.newToday} />
        {isAdmin && <Tile label="Needs triage" value={summary.triage} tone={summary.triage ? 'warn' : undefined} />}
        <Tile label="Resolved this week" value={summary.resolvedWeek} tone="good" />
      </dl>

      <nav className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200" aria-label="Queue views">
        {views.map((v) => (
          <Link
            key={v.id}
            href={href({ view: v.id })}
            aria-current={v.id === view ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
              v.id === view ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <form className="mt-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="view" value={view} />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" aria-hidden />
          <input name="q" defaultValue={sp.q} placeholder="Search title or DP-number" className="input pl-9" aria-label="Search" />
        </div>
        <select name="status" defaultValue={status} className="input w-auto" aria-label="Status">
          <option value="active">Open + in progress</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="any">Any status</option>
        </select>
        <select name="category" defaultValue={sp.category ?? ''} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {taxonomy.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Apply</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title="Nothing in this view">Nice. New reports will appear here as they come in.</EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Urgency</th>
                  <th className="px-4 py-2.5">Issue</th>
                  <th className="px-4 py-2.5">Reporters</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const overdue = isOverdue(r, now);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        <UrgencyBadge urgency={r.urgency} />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/staff/issues/${r.id}`} className="font-medium text-slate-900 hover:underline">
                          <span className="text-slate-500">{issueCode(r.number)}</span> {r.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span>
                            {r.categoryName ?? 'Uncategorised'}
                            {r.locationName && ` · ${r.locationName}`}
                            {view === 'all' && r.departmentName && ` · ${r.departmentName}`}
                          </span>
                          {r.isSensitive && (
                            <span className="inline-flex items-center gap-0.5 font-medium text-violet-700">
                              <Lock className="size-3" aria-hidden /> Confidential
                            </span>
                          )}
                          {r.needsTriage && (
                            <span className="inline-flex items-center gap-0.5 font-medium text-amber-700">
                              <ShieldQuestion className="size-3" aria-hidden /> Check category
                            </span>
                          )}
                          {r.possibleDuplicateOfId && (
                            <span className="inline-flex items-center gap-0.5 font-medium text-sky-700">
                              <Copy className="size-3" aria-hidden /> Possible duplicate
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.reporterCount}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap ${overdue ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>
                        {r.dueAt && (r.status === 'open' || r.status === 'in_progress') ? relativeTime(r.dueAt, now) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.assigneeName ?? <span className="text-slate-400">Unassigned</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'warn' | 'good' }) {
  const color = tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div className="card px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
