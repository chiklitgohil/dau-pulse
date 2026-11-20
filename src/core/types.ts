import type { Db } from '@/db/client';
import type { IssueSignals } from '@/db/schema';

// ─── Taxonomy as the core sees it ───────────────────────────────────────────

export type TaxonomyCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  departmentId: string;
  requiresLocation: boolean;
  subcategories: Array<{ id: string; slug: string; name: string }>;
};

export type TaxonomyLocation = { id: string; slug: string; name: string; aliases: string[] };
export type TaxonomyDepartment = { id: string; slug: string; name: string; email: string | null; isSensitive: boolean };

export type Taxonomy = {
  categories: TaxonomyCategory[];
  locations: TaxonomyLocation[];
  departments: TaxonomyDepartment[];
};

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * What the model extracts. It only *picks* from the taxonomy and reports signals;
 * urgency, routing and duplicate decisions are made by code (see urgency.ts, intake.ts).
 */
export type Classification = IssueSignals & {
  categorySlug: string | null;
  subcategorySlug: string | null;
  locationSlug: string | null;
  /** Free-text detail like "room 214, 2nd floor". */
  locationDetail: string | null;
  /** Short title, e.g. "Wi-Fi down in Hostel B". */
  title: string;
  /** One neutral sentence describing the problem. Used for matching and shown to staff. */
  summary: string;
  isSensitive: boolean;
  /** Model's self-reported confidence, 0..1. Treat as a hint; the eval measures how honest it is. */
  confidence: number;
  model: string;
};

export interface Classifier {
  classify(text: string, taxonomy: Taxonomy): Promise<Classification>;
}

export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

// ─── Wiring ─────────────────────────────────────────────────────────────────

export type CoreConfig = {
  /** Similarity at/above which we say "this looks like the same issue". */
  strongMatch: number;
  /** Similarity at/above which an issue is shown as a possible match. */
  possibleMatch: number;
  /** Below this confidence the issue goes to triage instead of trusting the AI. */
  triageConfidence: number;
  /** Only open issues younger than this are offered as matches. */
  matchWindowDays: number;
  draftTtlMinutes: number;
  maxAnalysesPerHour: number;
  maxReportsPerHour: number;
  appUrl: string;
  /** Receive escalations and the triage digest. */
  adminEmails: string[];
};

export const defaultCoreConfig: CoreConfig = {
  // gemini-embedding-001 @768 dims on AI summaries: same-issue pairs measured 0.83–0.95 in
  // `npm run eval`, unrelated pairs ≈0.75. "Possible" matches are only suggestions the student
  // confirms, so they lean towards recall. Re-tune with a full eval on real data.
  strongMatch: 0.9,
  possibleMatch: 0.84,
  triageConfidence: 0.55,
  matchWindowDays: 45,
  draftTtlMinutes: 30,
  maxAnalysesPerHour: 30,
  maxReportsPerHour: 10,
  appUrl: 'http://localhost:3000',
  adminEmails: [],
};

export type Deps = {
  db: Db;
  classifier: Classifier;
  embedder: Embedder;
  now: () => Date;
  config: CoreConfig;
  /** Called after a transaction that queued emails commits (e.g. to flush the outbox). */
  onEmailQueued?: () => void;
};

/** The person acting. Loaded fresh from the DB on every request. */
export type Actor = {
  id: string;
  email: string;
  name: string | null;
  role: 'student' | 'staff' | 'admin';
  departmentId: string | null;
  active: boolean;
};
