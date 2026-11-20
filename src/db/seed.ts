import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import { categories, departments, locations, subcategories } from './schema';
import {
  categorySeeds,
  departmentSeeds,
  locationSeeds,
  type CategorySeed,
  type DepartmentSeed,
  type LocationSeed,
} from '@/config/taxonomy';

export type TaxonomySeed = {
  departments: DepartmentSeed[];
  categories: CategorySeed[];
  locations: LocationSeed[];
};

export const defaultTaxonomySeed: TaxonomySeed = {
  departments: departmentSeeds,
  categories: categorySeeds,
  locations: locationSeeds,
};

/**
 * Upserts the taxonomy by slug. Rows removed from the seed are deactivated, never deleted,
 * so existing issues keep pointing at them.
 */
export async function seedTaxonomy(
  db: Db,
  opts: { onlyIfEmpty?: boolean; seed?: TaxonomySeed } = {},
): Promise<{ seeded: boolean }> {
  const seed = opts.seed ?? defaultTaxonomySeed;
  if (opts.onlyIfEmpty) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(departments);
    if (n > 0) return { seeded: false };
  }

  validateSeed(seed);

  await db.transaction(async (tx) => {
    const deptIds = new Map<string, string>();
    for (const d of seed.departments) {
      const [row] = await tx
        .insert(departments)
        .values({ slug: d.slug, name: d.name, email: d.email ?? null, isSensitive: d.isSensitive ?? false })
        .onConflictDoUpdate({
          target: departments.slug,
          // Don't overwrite an email set by an admin unless the seed specifies one.
          set: {
            name: d.name,
            isSensitive: d.isSensitive ?? false,
            ...(d.email ? { email: d.email } : {}),
          },
        })
        .returning({ id: departments.id });
      deptIds.set(d.slug, row.id);
    }

    for (const [i, c] of seed.categories.entries()) {
      const [row] = await tx
        .insert(categories)
        .values({
          slug: c.slug,
          name: c.name,
          description: c.description,
          departmentId: deptIds.get(c.department)!,
          requiresLocation: c.requiresLocation,
          sortOrder: i,
          active: true,
        })
        .onConflictDoUpdate({
          target: categories.slug,
          set: {
            name: c.name,
            description: c.description,
            departmentId: deptIds.get(c.department)!,
            requiresLocation: c.requiresLocation,
            sortOrder: i,
            active: true,
          },
        })
        .returning({ id: categories.id });

      for (const s of c.subcategories) {
        await tx
          .insert(subcategories)
          .values({ categoryId: row.id, slug: s.slug, name: s.name, active: true })
          .onConflictDoUpdate({
            target: [subcategories.categoryId, subcategories.slug],
            set: { name: s.name, active: true },
          });
      }
      await tx
        .update(subcategories)
        .set({ active: false })
        .where(
          and(
            eq(subcategories.categoryId, row.id),
            notInArray(
              subcategories.slug,
              c.subcategories.map((s) => s.slug),
            ),
          ),
        );
    }
    await tx
      .update(categories)
      .set({ active: false })
      .where(
        notInArray(
          categories.slug,
          seed.categories.map((c) => c.slug),
        ),
      );

    for (const l of seed.locations) {
      await tx
        .insert(locations)
        .values({ slug: l.slug, name: l.name, aliases: l.aliases, active: true })
        .onConflictDoUpdate({ target: locations.slug, set: { name: l.name, aliases: l.aliases, active: true } });
    }
    await tx
      .update(locations)
      .set({ active: false })
      .where(
        notInArray(
          locations.slug,
          seed.locations.map((l) => l.slug),
        ),
      );
  });

  return { seeded: true };
}

function validateSeed(seed: TaxonomySeed) {
  const deptSlugs = new Set(seed.departments.map((d) => d.slug));
  for (const c of seed.categories) {
    if (!deptSlugs.has(c.department)) {
      throw new Error(`Category "${c.slug}" points at unknown department "${c.department}"`);
    }
    if (c.subcategories.length === 0) throw new Error(`Category "${c.slug}" needs at least one subcategory`);
  }
  for (const list of [seed.departments, seed.categories, seed.locations]) {
    const slugs = list.map((x) => x.slug);
    const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
    if (dup) throw new Error(`Duplicate slug "${dup}" in taxonomy seed`);
  }
}
