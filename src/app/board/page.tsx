import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getDb } from '@/db/client';
import { SENSITIVE_CATEGORY_SLUG } from '@/config/taxonomy';
import { listPublicBoard } from '@/core/queries';
import { loadTaxonomy } from '@/core/taxonomy';
import { requireActor } from '@/lib/session';
import { MeTooButton } from '@/components/MeTooButton';
import { EmptyState, StatusBadge, issueCode, relativeTime } from '@/components/ui';

export const metadata: Metadata = { title: 'Campus board' };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const actor = await requireActor();
  const { category, q } = await searchParams;
  const db = await getDb();
  const [items, taxonomy] = await Promise.all([listPublicBoard(db, actor, { category, q }, new Date()), loadTaxonomy(db)]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Campus board</h1>
          <p className="mt-1 text-slate-600">What students have reported and what&apos;s being done. Tap “Me too” if it affects you.</p>
        </div>
        <Link href="/report" className="btn-primary">
          Report a problem
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap gap-2" role="search">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search issues" className="input pl-9" aria-label="Search issues" />
        </div>
        <select name="category" defaultValue={category ?? ''} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {taxonomy.categories
            .filter((c) => c.slug !== SENSITIVE_CATEGORY_SLUG)
            .map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <EmptyState title="Nothing here yet">No open issues match. If something&apos;s wrong, be the first to report it.</EmptyState>
        ) : (
          items.map((i) => (
            <article key={i.id} className="card flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={i.status} />
                  <span className="text-xs text-slate-500">
                    {issueCode(i.number)} · {i.categoryName}
                    {i.locationName && ` · ${i.locationName}`}
                  </span>
                </div>
                <h2 className="mt-1.5 font-semibold text-slate-900">
                  <Link href={`/issues/${i.number}`} className="hover:underline">
                    {i.title}
                  </Link>
                </h2>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{i.summary}</p>
                <p className="mt-1.5 text-xs text-slate-500">
                  {i.reporterCount} student{i.reporterCount === 1 ? '' : 's'} · updated {relativeTime(i.updatedAt)}
                </p>
              </div>
              {i.status !== 'resolved' && <MeTooButton issueId={i.id} alreadyReported={i.alreadyReported} />}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
