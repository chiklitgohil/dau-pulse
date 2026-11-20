import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { categories, departments, locations, subcategories } from '@/db/schema';
import { SENSITIVE_CATEGORY_SLUG } from '@/config/taxonomy';
import type { Taxonomy, TaxonomyCategory } from './types';

/** Active taxonomy. Small tables; loaded per request so admin edits apply immediately. */
export async function loadTaxonomy(db: Db): Promise<Taxonomy> {
  const [cats, subs, locs, depts] = await Promise.all([
    db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.sortOrder)),
    db.select().from(subcategories).where(eq(subcategories.active, true)),
    db.select().from(locations).where(eq(locations.active, true)).orderBy(asc(locations.name)),
    db.select().from(departments).orderBy(asc(departments.name)),
  ]);
  return {
    categories: cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      departmentId: c.departmentId,
      requiresLocation: c.requiresLocation,
      subcategories: subs
        .filter((s) => s.categoryId === c.id)
        .map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
    })),
    locations: locs.map((l) => ({ id: l.id, slug: l.slug, name: l.name, aliases: l.aliases })),
    departments: depts.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      email: d.email,
      isSensitive: d.isSensitive,
    })),
  };
}

export function findCategory(t: Taxonomy, slug: string | null | undefined): TaxonomyCategory | undefined {
  return slug ? t.categories.find((c) => c.slug === slug) : undefined;
}

export function findSubcategory(cat: TaxonomyCategory | undefined, slug: string | null | undefined) {
  return cat && slug ? cat.subcategories.find((s) => s.slug === slug) : undefined;
}

export function findLocation(t: Taxonomy, slug: string | null | undefined) {
  return slug ? t.locations.find((l) => l.slug === slug) : undefined;
}

export function sensitiveCategory(t: Taxonomy): TaxonomyCategory {
  const cat = findCategory(t, SENSITIVE_CATEGORY_SLUG);
  if (!cat) throw new Error(`Taxonomy is missing the sensitive category "${SENSITIVE_CATEGORY_SLUG}"`);
  return cat;
}
