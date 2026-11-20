'use client';

import { useState } from 'react';
import { reclassifyAction } from '@/app/actions/staff';
import { ActionForm, SubmitButton } from '@/components/ActionForm';

type Props = {
  issueId: string;
  current: { categorySlug: string; subcategorySlug: string; locationSlug: string; locationDetail: string; isSensitive: boolean };
  needsTriage: boolean;
  categories: Array<{ slug: string; name: string; subcategories: Array<{ slug: string; name: string }> }>;
  locations: Array<{ slug: string; name: string }>;
};

export function ReclassifyForm({ issueId, current, needsTriage, categories, locations }: Props) {
  const [categorySlug, setCategorySlug] = useState(current.categorySlug);
  const [sensitive, setSensitive] = useState(current.isSensitive);
  const category = categories.find((c) => c.slug === categorySlug);

  return (
    <ActionForm action={reclassifyAction} className="mt-3 space-y-3">
      <input type="hidden" name="issueId" value={issueId} />
      <div>
        <label htmlFor="rc-category" className="label">
          Category
        </label>
        <select
          id="rc-category"
          name="categorySlug"
          className="input"
          value={categorySlug}
          disabled={sensitive}
          onChange={(e) => setCategorySlug(e.target.value)}
        >
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {sensitive && <input type="hidden" name="categorySlug" value={categorySlug || 'grievance'} />}
      </div>
      {category && (
        <div>
          <label htmlFor="rc-sub" className="label">
            Subcategory
          </label>
          <select id="rc-sub" name="subcategorySlug" className="input" defaultValue={current.subcategorySlug} key={categorySlug}>
            <option value="">—</option>
            {category.subcategories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="rc-loc" className="label">
          Location
        </label>
        <select id="rc-loc" name="locationSlug" className="input" defaultValue={current.locationSlug}>
          <option value="">—</option>
          {locations.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>
        <input name="locationDetail" defaultValue={current.locationDetail} placeholder="Room / floor" className="input mt-2" maxLength={120} aria-label="Location detail" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isSensitive" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="mt-0.5 size-4 accent-violet-700" />
        <span>
          <span className="font-medium">Sensitive</span>
          <span className="block text-xs text-slate-500">Only the grievance committee will be able to see it.</span>
        </span>
      </label>
      <SubmitButton>{needsTriage ? 'Confirm category' : 'Save changes'}</SubmitButton>
    </ActionForm>
  );
}
