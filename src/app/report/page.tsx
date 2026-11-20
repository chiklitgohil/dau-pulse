import type { Metadata } from 'next';
import { getDb } from '@/db/client';
import { OTHER_LOCATION_SLUG, SENSITIVE_CATEGORY_SLUG } from '@/config/taxonomy';
import { loadTaxonomy } from '@/core/taxonomy';
import { requireActor } from '@/lib/session';
import { ReportFlow, type TaxonomyOptions } from './ReportFlow';

export const metadata: Metadata = { title: 'Report a problem' };

export default async function ReportPage() {
  await requireActor();
  const t = await loadTaxonomy(await getDb());
  const options: TaxonomyOptions = {
    categories: t.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      requiresLocation: c.requiresLocation,
      isSensitive: c.slug === SENSITIVE_CATEGORY_SLUG,
      subcategories: c.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
    })),
    locations: t.locations.map((l) => ({ slug: l.slug, name: l.name })),
    otherLocationSlug: OTHER_LOCATION_SLUG,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">Report a problem</h1>
      <p className="mt-1 text-slate-600">Write it the way you&apos;d tell a friend. We&apos;ll work out who needs to fix it.</p>
      <div className="mt-6">
        <ReportFlow options={options} />
      </div>
    </div>
  );
}
