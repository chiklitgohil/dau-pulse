/** Hours to resolve, by urgency. Overdue issues are escalated in the daily digest. */
export const SLA_HOURS: Record<number, number> = {
  5: 4,
  4: 24,
  3: 72,
  2: 7 * 24,
  1: 14 * 24,
};

export function dueAtFor(createdAt: Date, urgency: number): Date {
  const hours = SLA_HOURS[urgency] ?? SLA_HOURS[1];
  return new Date(createdAt.getTime() + hours * 3600_000);
}

/** When urgency rises the deadline can only move earlier, never later. */
export function nextDueAt(createdAt: Date, urgency: number, current: Date | null): Date {
  const candidate = dueAtFor(createdAt, urgency);
  return current && current < candidate ? current : candidate;
}

export function isOverdue(issue: { dueAt: Date | null; status: string }, now: Date): boolean {
  return !!issue.dueAt && issue.dueAt < now && (issue.status === 'open' || issue.status === 'in_progress');
}
