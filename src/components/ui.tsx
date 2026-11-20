import type { IssueStatus } from '@/db/schema';

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_STYLE: Record<IssueStatus, string> = {
  open: 'bg-sky-50 text-sky-800 ring-sky-200',
  in_progress: 'bg-amber-50 text-amber-800 ring-amber-200',
  resolved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  closed: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return <Pill className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function UrgencyBadge({ urgency }: { urgency: number }) {
  const style =
    urgency >= 5
      ? 'bg-rose-600 text-white ring-rose-600'
      : urgency === 4
        ? 'bg-orange-100 text-orange-900 ring-orange-200'
        : urgency === 3
          ? 'bg-amber-50 text-amber-900 ring-amber-200'
          : 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <Pill className={`${style} tabular-nums`} title={`Urgency ${urgency} of 5`}>
      U{urgency}
    </Pill>
  );
}

export function Pill({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {children}
    </p>
  );
}

export const issueCode = (n: number) => `DP-${n}`;

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 hours ago", "in 2 days". */
export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), 'day');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}
