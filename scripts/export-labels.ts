import fs from 'node:fs';
import path from 'node:path';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { categories, issues, locations, reports, subcategories } from '@/db/schema';
import { openDb, arg } from './_shared';

/**
 * Export real reports with their FINAL labels (after student corrections and staff
 * reclassification) as JSONL, in the same format as fixtures/eval/reports.jsonl.
 *
 * This is the dataset for the future model bake-off (docs/ModelSelection.md §5).
 * It contains raw student text: keep it inside the college, never commit it.
 *
 *   npm run export:labels -- --out .data/labels.jsonl [--include-sensitive]
 */
async function main() {
  const out = arg('out') ?? path.join('.data', 'labels.jsonl');
  const includeSensitive = arg('include-sensitive') === 'true';
  const { db, close } = await openDb();
  try {
    const rows = await db
      .select({
        id: reports.id,
        text: reports.text,
        ai: reports.ai,
        categoryCorrected: reports.categoryCorrected,
        issueId: issues.id,
        category: categories.slug,
        subcategory: subcategories.slug,
        location: locations.slug,
        sensitive: issues.isSensitive,
        needsTriage: issues.needsTriage,
      })
      .from(reports)
      .innerJoin(issues, eq(issues.id, reports.issueId))
      .leftJoin(categories, eq(categories.id, issues.categoryId))
      .leftJoin(subcategories, eq(subcategories.id, issues.subcategoryId))
      .leftJoin(locations, eq(locations.id, issues.locationId))
      // Only reports with text, on issues a human has effectively confirmed (not still in triage).
      .where(and(isNotNull(reports.text), eq(issues.needsTriage, false), isNull(issues.mergedIntoId)));

    const lines = rows
      .filter((r) => includeSensitive || !r.sensitive)
      .map((r) =>
        JSON.stringify({
          id: r.id,
          text: r.text,
          category: r.category,
          subcategory: r.subcategory,
          location: r.location,
          sensitive: r.sensitive,
          group: r.issueId,
          ai: r.ai ? { category: r.ai.categorySlug, confidence: r.ai.confidence, model: r.ai.model } : null,
          corrected: r.categoryCorrected || (r.ai?.categorySlug ?? null) !== r.category,
        }),
      );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''));
    const corrected = lines.filter((l) => JSON.parse(l).corrected).length;
    console.log(`✓ Wrote ${lines.length} labelled reports to ${out} (${corrected} where the final label differs from the AI's)`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
