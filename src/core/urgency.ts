import type { IssueSignals } from '@/db/schema';

/**
 * Urgency 1–5, computed from the model's signals with a fixed formula so it is consistent and
 * explainable to staff ("high severity + affects many people + 4 students reported it").
 *
 *   base:            low 1 · medium 2 · high 3
 *   +1 affects many people
 *   +1 time-sensitive (exam tomorrow, no water since morning)
 *   +1 if 3+ students reported it, +1 more at 10+
 *   = 5 for safety risks and sensitive (grievance) issues
 */
export function computeUrgency(input: IssueSignals & { isSensitive: boolean; reporterCount: number }): number {
  if (input.safetyRisk || input.isSensitive) return 5;
  let u = { low: 1, medium: 2, high: 3 }[input.severity];
  if (input.affectsMany) u += 1;
  if (input.timeSensitive) u += 1;
  if (input.reporterCount >= 3) u += 1;
  if (input.reporterCount >= 10) u += 1;
  return clamp(u, 1, 5);
}

export function explainUrgency(input: IssueSignals & { isSensitive: boolean; reporterCount: number }): string[] {
  if (input.isSensitive) return ['Sensitive matter'];
  if (input.safetyRisk) return ['Safety risk'];
  const parts = [`${input.severity} severity`];
  if (input.affectsMany) parts.push('affects many people');
  if (input.timeSensitive) parts.push('time-sensitive');
  if (input.reporterCount >= 3) parts.push(`${input.reporterCount} students reported`);
  return parts;
}

/** Combine a new report's signals into an issue's: booleans OR together, severity takes the max. */
export function mergeSignals(a: IssueSignals, b: IssueSignals): IssueSignals {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return {
    severity: rank[a.severity] >= rank[b.severity] ? a.severity : b.severity,
    safetyRisk: a.safetyRisk || b.safetyRisk,
    affectsMany: a.affectsMany || b.affectsMany,
    timeSensitive: a.timeSensitive || b.timeSensitive,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
