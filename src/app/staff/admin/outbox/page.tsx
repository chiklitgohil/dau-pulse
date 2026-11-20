import type { Metadata } from 'next';
import { getDb } from '@/db/client';
import { listAdminOutbox } from '@/core/queries';
import { env } from '@/lib/env';
import { requireAdmin } from '@/lib/session';
import { EmptyState, Pill, formatDateTime } from '@/components/ui';

export const metadata: Metadata = { title: 'Email log' };

const STYLE = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  sent: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-800 ring-rose-200',
} as const;

export default async function OutboxPage() {
  const actor = await requireAdmin();
  const rows = await listAdminOutbox(await getDb(), actor);
  const transport = env().EMAIL_TRANSPORT;

  return (
    <div>
      <h1 className="page-title">Email log</h1>
      <p className="mt-1 text-slate-600">
        The last 100 emails. Failed sends are retried with backoff.{' '}
        {transport === 'console' && <strong className="text-amber-800">Email is in console mode: messages are printed to the server log, not sent.</strong>}
      </p>
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState title="No emails yet" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">To</th>
                  <th className="px-4 py-2.5">Subject</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2.5">{r.toEmail}</td>
                    <td className="px-4 py-2.5">{r.subject}</td>
                    <td className="px-4 py-2.5">
                      <Pill className={STYLE[r.status]}>
                        {r.status}
                        {r.attempts > 1 && ` (${r.attempts} tries)`}
                      </Pill>
                      {r.lastError && r.status !== 'sent' && <p className="mt-1 max-w-xs truncate text-xs text-rose-700" title={r.lastError}>{r.lastError}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
