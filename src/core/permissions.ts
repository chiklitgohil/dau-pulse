import type { Actor } from './types';

type IssueAccess = {
  departmentId: string | null;
  isSensitive: boolean;
  isConfidential: boolean;
  mergedIntoId: string | null;
};

/**
 * Access rules, in one place.
 *
 *  - Students see public issues (the board) and every issue they reported themselves.
 *  - Staff see their own department's queue.
 *  - Admins see every non-sensitive issue, including the triage queue.
 *  - Sensitive (grievance / ragging) issues are visible ONLY to members of the department they are
 *    routed to. Admins are deliberately not included: the committee decides what to escalate.
 *  - Reporters marked anonymous are never identified in the app, to anyone.
 */
export function isStaff(actor: Actor | null): actor is Actor {
  return !!actor && actor.active && (actor.role === 'staff' || actor.role === 'admin');
}

export function isAdmin(actor: Actor | null): actor is Actor {
  return !!actor && actor.active && actor.role === 'admin';
}

export function canStaffAccessIssue(actor: Actor | null, issue: IssueAccess): boolean {
  if (!isStaff(actor)) return false;
  if (issue.isSensitive) {
    if (issue.departmentId === null) return actor.role === 'admin'; // misconfigured taxonomy: fail closed-ish
    return actor.departmentId === issue.departmentId;
  }
  if (actor.role === 'admin') return true;
  return actor.departmentId !== null && actor.departmentId === issue.departmentId;
}

/** Shown on the public board and offered to other students as a "same issue?" match. */
export function isPublicIssue(issue: IssueAccess): boolean {
  return !issue.isSensitive && !issue.isConfidential && issue.mergedIntoId === null;
}

export function canReporterViewIssue(issue: IssueAccess, isReporter: boolean): boolean {
  return isReporter || isPublicIssue(issue);
}

export function reporterDisplayName(
  report: { isAnonymous: boolean },
  reporter: { name: string | null; email: string },
): string {
  if (report.isAnonymous) return 'Anonymous student';
  return reporter.name ?? reporter.email;
}
