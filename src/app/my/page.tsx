import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { getDb } from '@/db/client';
import { listMyReports } from '@/core/queries';
import { requireActor } from '@/lib/session';
import { EmptyState, StatusBadge, issueCode, relativeTime } from '@/components/ui';

export const metadata: Metadata = { title: 'My reports' };

export default async function MyReportsPage() {
  const actor = await requireActor();
  const rows = await listMyReports(await getDb(), actor);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="page-title">My reports</h1>
      <p className="mt-1 text-slate-600">Everything you&apos;ve reported or added yourself to.</p>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState title="No reports yet">
            <Link href="/report" className="font-medium text-brand-700 hover:underline">
              Report a problem
            </Link>{' '}
            and it will show up here.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.reportId}>
                <Link href={`/issues/${r.mergedIntoNumber ?? r.number}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      {r.isSensitive && <Lock className="size-3.5 text-violet-600" aria-label="Confidential" />}
                      <span className="text-slate-500">{issueCode(r.number)}</span> <span className="truncate">{r.title}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.categoryName} · reported {relativeTime(r.reportedAt)}
                      {r.reporterCount > 1 && ` · ${r.reporterCount} students`}
                      {r.mergedIntoNumber && ` · now tracked as ${issueCode(r.mergedIntoNumber)}`}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
