import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Lock } from 'lucide-react';
import { getDb } from '@/db/client';
import { isUserError } from '@/core/errors';
import { getReporterIssue } from '@/core/queries';
import { requireActor } from '@/lib/session';
import { MeTooButton } from '@/components/MeTooButton';
import { STATUS_LABEL, StatusBadge, formatDateTime, issueCode, relativeTime } from '@/components/ui';
import type { IssueStatus } from '@/db/schema';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  return { title: issueCode(Number((await params).number)) };
}

export default async function IssuePage({ params }: { params: Promise<{ number: string }> }) {
  const actor = await requireActor();
  const n = Number((await params).number.replace(/^dp-?/i, ''));
  if (!Number.isInteger(n)) notFound();

  let issue: Awaited<ReturnType<typeof getReporterIssue>>;
  try {
    issue = await getReporterIssue(await getDb(), actor, n);
  } catch (err) {
    if (isUserError(err)) notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {issue.mergedIntoNumber && (
        <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
          This was the same problem as{' '}
          <Link className="font-semibold underline" href={`/issues/${issue.mergedIntoNumber}`}>
            {issueCode(issue.mergedIntoNumber)}
          </Link>
          , so it is tracked there now.
        </p>
      )}

      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{issueCode(issue.number)}</span>
          <StatusBadge status={issue.status} />
          {issue.isSensitive && (
            <span className="inline-flex items-center gap-1 text-violet-700">
              <Lock className="size-3.5" aria-hidden /> Confidential
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-bold text-slate-900">{issue.title}</h1>
        <p className="mt-2 text-slate-700">{issue.summary}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Category" value={issue.categoryName ?? '—'} />
          <Fact label="Where" value={issue.locationName ?? '—'} />
          <Fact label="Handled by" value={issue.departmentName ?? 'Being routed'} />
          <Fact label="Reported by" value={`${issue.reporterCount} student${issue.reporterCount === 1 ? '' : 's'}`} />
        </dl>

        {issue.resolutionNote && (issue.status === 'resolved' || issue.status === 'closed') && (
          <div className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">{issue.status === 'resolved' ? 'What was done' : 'Why it was closed'}</p>
            <p className="mt-1 whitespace-pre-wrap">{issue.resolutionNote}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {issue.canReportToo && <MeTooButton issueId={issue.id} alreadyReported={false} />}
          {issue.staffCanSee && (
            <Link href={`/staff/issues/${issue.id}`} className="btn-ghost btn-sm">
              <ExternalLink className="size-3.5" aria-hidden /> Open in staff view
            </Link>
          )}
          {issue.status === 'resolved' && issue.myReport && (
            <Link href="/report" className="text-sm text-brand-700 hover:underline">
              Not actually fixed? Report it again.
            </Link>
          )}
        </div>
      </div>

      {issue.myReport?.text && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-500">What you wrote · {relativeTime(issue.myReport.createdAt)}</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap text-slate-800">{issue.myReport.text}</p>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-4 space-y-4 border-l border-slate-200 pl-5">
          {issue.events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-brand-500 ring-4 ring-white" aria-hidden />
              <p className="text-sm text-slate-800">{describe(e.type, e.data)}</p>
              {e.type === 'status_changed' && typeof e.data.note === 'string' && e.data.note && (
                <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap text-slate-700">{e.data.note}</p>
              )}
              <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function describe(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'created':
      return 'Reported';
    case 'report_added':
      return `Another student reported it (${data.reporterCount} in total)`;
    case 'status_changed':
      return `Status changed to ${STATUS_LABEL[data.to as IssueStatus] ?? String(data.to)}`;
    case 'merged':
      return data.intoNumber ? `Merged into ${issueCode(Number(data.intoNumber))}` : `${issueCode(Number(data.fromNumber))} was merged into this issue`;
    default:
      return type;
  }
}
