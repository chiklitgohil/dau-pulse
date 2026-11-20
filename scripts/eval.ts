import fs from 'node:fs';
import path from 'node:path';
import { createPgliteDb } from '@/db/client';
import { EMBEDDING_DIMENSIONS } from '@/db/schema';
import { seedTaxonomy } from '@/db/seed';
import { SENSITIVE_CATEGORY_SLUG } from '@/config/taxonomy';
import { GeminiClassifier, GeminiEmbedder } from '@/core/ai/gemini';
import { redactPersonalData } from '@/core/redact';
import { checkTripwire } from '@/core/sensitive';
import { loadTaxonomy } from '@/core/taxonomy';
import { defaultCoreConfig, type Classification } from '@/core/types';
import { arg } from './_shared';

/**
 * Measures the classifier and duplicate matching against labelled examples.
 *
 *   npm run eval                                   # fixtures/eval/reports.jsonl, models from GEMINI_MODELS
 *   npm run eval -- --model gemini-3.5-flash       # try a specific model
 *   npm run eval -- --file .data/labels.jsonl      # real exported data (npm run export:labels)
 *   npm run eval -- --limit 20 --strict            # quick run; non-zero exit if below the bar
 *
 * Reports: routed-category accuracy, subcategory/location accuracy, sensitive-report recall
 * (the number that must stay at 100%), how honest the model's confidence is, latency, and the
 * duplicate-similarity thresholds that best separate same-issue from different-issue pairs.
 */

type Expect<T> = T | T[];
type Example = {
  id: string;
  text: string;
  category: Expect<string | null>;
  subcategory?: string | null;
  location: Expect<string | null>;
  sensitive: boolean;
  group: string | null;
};
type Outcome = {
  ex: Example;
  c: Classification | null;
  error: string | null;
  ms: number;
  tripwire: string[];
  sensitive: boolean;
  routed: string | null;
};

const ok = <T>(expected: Expect<T>, actual: T) => (Array.isArray(expected) ? expected.includes(actual) : expected === actual);
const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is required for the eval');
  const file = arg('file') ?? path.join('fixtures', 'eval', 'reports.jsonl');
  const limit = Number(arg('limit') ?? Infinity);
  const models = (arg('model') ?? process.env.GEMINI_MODELS ?? 'gemini-2.5-flash,gemini-3.5-flash,gemini-3.1-flash-lite')
    .split(',')
    .map((s) => s.trim());
  const concurrency = Number(arg('concurrency') ?? 3);
  // Free-tier keys allow ~10 requests/minute per model. Pass --rpm 0 on a paid key.
  const rpm = Number(arg('rpm') ?? 9);
  let nextSlot = Date.now();
  const throttle = async () => {
    if (!rpm) return;
    const wait = nextSlot - Date.now();
    nextSlot = Math.max(nextSlot, Date.now()) + 60_000 / rpm;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };

  const examples: Example[] = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .slice(0, limit);

  const { db, close } = await createPgliteDb();
  await seedTaxonomy(db);
  const taxonomy = await loadTaxonomy(db);
  await close();

  const classifier = new GeminiClassifier(key, models, { attemptsPerModel: 3 });
  const embedder = new GeminiEmbedder(key, process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001', EMBEDDING_DIMENSIONS);

  console.log(`Evaluating ${examples.length} examples from ${file} with ${models.join(' → ')} …\n`);
  const outcomes: Outcome[] = new Array(examples.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < examples.length) {
        const i = next++;
        const ex = examples[i];
        const tw = checkTripwire(ex.text);
        await throttle();
        const t0 = Date.now();
        let c: Classification | null = null;
        let error: string | null = null;
        try {
          c = await classifier.classify(redactPersonalData(ex.text), taxonomy);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
        const sensitive = tw.sensitive || !!c?.isSensitive;
        outcomes[i] = { ex, c, error, ms: Date.now() - t0, tripwire: tw.matched, sensitive, routed: sensitive ? SENSITIVE_CATEGORY_SLUG : (c?.categorySlug ?? null) };
        process.stdout.write(`\r  ${++done}/${examples.length}`);
      }
    }),
  );
  process.stdout.write('\n\n');

  const valid = outcomes.filter((o) => o.c);
  const errors = outcomes.filter((o) => o.error);

  // ── Category / subcategory / location ──
  const catRight = valid.filter((o) => ok(o.ex.category, o.routed));
  const rawRight = valid.filter((o) => ok(o.ex.category, o.c!.categorySlug));
  const subScored = valid.filter((o) => o.ex.subcategory && ok(o.ex.category, o.routed) && !o.sensitive);
  const subRight = subScored.filter((o) => o.c!.subcategorySlug === o.ex.subcategory);
  const locScored = valid.filter((o) => !o.ex.sensitive);
  const locRight = locScored.filter((o) => ok(o.ex.location, o.c!.locationSlug));

  // ── Sensitive ──
  const pos = outcomes.filter((o) => o.ex.sensitive);
  const neg = outcomes.filter((o) => !o.ex.sensitive);
  const caught = pos.filter((o) => o.sensitive);
  const falseAlarms = neg.filter((o) => o.sensitive);
  const llmCaught = pos.filter((o) => o.c?.isSensitive);
  const twCaught = pos.filter((o) => o.tripwire.length > 0);

  // ── Calibration ──
  const buckets = [
    [0, 0.5],
    [0.5, 0.7],
    [0.7, 0.85],
    [0.85, 0.95],
    [0.95, 1.01],
  ].map(([lo, hi]) => {
    const inB = valid.filter((o) => o.c!.confidence >= lo && o.c!.confidence < hi && !o.sensitive);
    const right = inB.filter((o) => ok(o.ex.category, o.c!.categorySlug));
    return { range: `${lo.toFixed(2)}–${Math.min(hi, 1).toFixed(2)}`, n: inB.length, accuracy: inB.length ? right.length / inB.length : null };
  });
  const triage = valid.filter((o) => !o.sensitive && o.c!.confidence < defaultCoreConfig.triageConfidence);

  // ── Latency ──
  const ms = outcomes.map((o) => o.ms).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  const byModel = Object.entries(
    valid.reduce<Record<string, number>>((acc, o) => ((acc[o.c!.model] = (acc[o.c!.model] ?? 0) + 1), acc), {}),
  );

  console.log('CLASSIFICATION');
  console.log(`  routed category        ${pct(catRight.length, valid.length)}   (${catRight.length}/${valid.length}; sensitive reports count as correct when routed to grievance)`);
  console.log(`  model's own category   ${pct(rawRight.length, valid.length)}`);
  console.log(`  subcategory            ${pct(subRight.length, subScored.length)}   (where category was right)`);
  console.log(`  location               ${pct(locRight.length, locScored.length)}   (incl. correctly saying "none")`);
  console.log(`  sent to triage         ${pct(triage.length, valid.length)}   (confidence < ${defaultCoreConfig.triageConfidence})`);
  console.log(`  errors                 ${errors.length}`);
  console.log('\nSENSITIVE REPORTS (must catch all)');
  console.log(`  recall (AI or keywords) ${pct(caught.length, pos.length)}   (${caught.length}/${pos.length})`);
  console.log(`    AI alone              ${pct(llmCaught.length, pos.length)}`);
  console.log(`    keywords alone        ${pct(twCaught.length, pos.length)}`);
  console.log(`  false alarms            ${falseAlarms.length}/${neg.length}${falseAlarms.length ? `: ${falseAlarms.map((o) => o.ex.id).join(', ')}` : ''}`);
  console.log('\nCONFIDENCE vs ACCURACY (is the model honest about being unsure?)');
  for (const b of buckets) console.log(`  ${b.range}   n=${String(b.n).padStart(3)}   accuracy ${b.accuracy === null ? '  n/a' : pct(b.accuracy * 100, 100)}`);
  console.log(`\nLATENCY  p50 ${q(0.5)} ms   p95 ${q(0.95)} ms   models used: ${byModel.map(([m, n]) => `${m}×${n}`).join(', ')}`);

  const mistakes = valid
    .filter((o) => !ok(o.ex.category, o.routed) || (!o.ex.sensitive && !ok(o.ex.location, o.c!.locationSlug)))
    .map((o) => ({
      id: o.ex.id,
      text: o.ex.text,
      expected: { category: o.ex.category, location: o.ex.location },
      got: { category: o.routed, location: o.c!.locationSlug, confidence: o.c!.confidence },
    }));
  if (mistakes.length) {
    console.log('\nMISTAKES');
    for (const m of mistakes) {
      console.log(`  [${m.id}] ${m.text.slice(0, 70)}`);
      console.log(`        expected ${JSON.stringify(m.expected)}  got ${JSON.stringify(m.got)}`);
    }
  }
  for (const o of pos.filter((o) => !o.sensitive)) console.log(`\n  ⚠ MISSED SENSITIVE [${o.ex.id}] ${o.ex.text}`);

  // ── Duplicate matching ──
  const items = valid.filter((o) => !o.sensitive);
  const vectors: number[][] = [];
  for (let i = 0; i < items.length; i += 50) {
    vectors.push(...(await embedder.embed(items.slice(i, i + 50).map((o) => o.c!.summary))));
  }
  type Pair = { sim: number; same: boolean; sameCategory: boolean };
  const pairs: Pair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const la = a.c!.locationSlug;
      const lb = b.c!.locationSlug;
      if (la && lb && la !== lb) continue; // the system never matches across two known places
      pairs.push({
        sim: cosine(vectors[i], vectors[j]),
        same: !!a.ex.group && a.ex.group === b.ex.group,
        sameCategory: a.c!.categorySlug === b.c!.categorySlug,
      });
    }
  }
  const positives = pairs.filter((p) => p.same).length;
  const rows: Array<{ t: number; precision: number; recall: number }> = [];
  console.log(`\nDUPLICATE MATCHING  (${pairs.length} comparable pairs, ${positives} true duplicates)`);
  console.log('  threshold  precision  recall   (same category)');
  for (let t = 0.8; t <= 0.991; t += 0.01) {
    const hit = pairs.filter((p) => p.sameCategory && p.sim >= t);
    const tp = hit.filter((p) => p.same).length;
    const precision = hit.length ? tp / hit.length : 1;
    const recall = positives ? tp / positives : 1;
    rows.push({ t: Number(t.toFixed(2)), precision, recall });
    console.log(`  ${t.toFixed(2)}       ${pct(precision * 100, 100)}    ${pct(recall * 100, 100)}`);
  }
  const strong = rows.find((r) => r.precision >= 0.95) ?? rows[rows.length - 1];
  const possible = [...rows].reverse().find((r) => r.recall >= 0.9) ?? rows[0];
  console.log(
    `\n  Suggested: strongMatch ≈ ${strong.t} (precision ${pct(strong.precision * 100, 100)}), possibleMatch ≈ ${Math.min(possible.t, strong.t)} (recall ${pct(possible.recall * 100, 100)})`,
  );
  console.log(`  Current:   strongMatch = ${defaultCoreConfig.strongMatch}, possibleMatch = ${defaultCoreConfig.possibleMatch}   (src/core/types.ts)`);

  const report = {
    at: new Date().toISOString(),
    file,
    models,
    n: examples.length,
    category: catRight.length / valid.length,
    subcategory: subScored.length ? subRight.length / subScored.length : null,
    location: locRight.length / locScored.length,
    sensitiveRecall: pos.length ? caught.length / pos.length : null,
    falseAlarms: falseAlarms.map((o) => o.ex.id),
    calibration: buckets,
    latency: { p50: q(0.5), p95: q(0.95) },
    errors: errors.map((o) => ({ id: o.ex.id, error: o.error })),
    mistakes,
    dedup: { pairs: pairs.length, positives, thresholds: rows, suggested: { strong: strong.t, possible: Math.min(possible.t, strong.t) } },
  };
  const outDir = path.join('.data', 'eval');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `report-${report.at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${out}`);

  if (arg('strict') === 'true') {
    const failures: string[] = [];
    if (report.sensitiveRecall !== null && report.sensitiveRecall < 1) failures.push('a sensitive report was missed');
    if (report.category < 0.85) failures.push(`category accuracy ${(report.category * 100).toFixed(1)}% < 85%`);
    if (errors.length > 0) failures.push(`${errors.length} classification errors`);
    if (failures.length) {
      console.error(`\n✗ Eval failed: ${failures.join('; ')}`);
      process.exit(1);
    }
    console.log('\n✓ Eval passed');
  }
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
