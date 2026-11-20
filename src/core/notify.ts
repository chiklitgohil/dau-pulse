import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { outbox, reports, users } from '@/db/schema';
import { rowsOf } from '@/db/util';

export type EmailMessage = { to: string; subject: string; body: string };

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

const MAX_ATTEMPTS = 6;

/** Queue an email. Call inside the same transaction as the change it describes. */
export async function queueEmail(db: Db, msg: EmailMessage): Promise<void> {
  await db.insert(outbox).values({ toEmail: msg.to, subject: msg.subject, body: msg.body });
}

export async function queueEmails(db: Db, msgs: EmailMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  await db.insert(outbox).values(msgs.map((m) => ({ toEmail: m.to, subject: m.subject, body: m.body })));
}

/** Emails of everyone who reported an issue (deduplicated, active accounts only). */
export async function reporterEmails(db: Db, issueId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ email: users.email })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(and(eq(reports.issueId, issueId), eq(users.active, true)));
  return rows.map((r) => r.email);
}

/**
 * Deliver pending emails. Safe to run concurrently: rows are claimed with SKIP LOCKED and a lease,
 * so two workers never send the same email. Failures back off exponentially (1, 2, 4 … minutes).
 */
export async function deliverOutbox(
  db: Db,
  transport: EmailTransport,
  now: Date,
  limit = 25,
): Promise<{ sent: number; failed: number; retrying: number }> {
  const lease = new Date(now.getTime() + 5 * 60_000);
  type Row = { id: string; to_email: string; subject: string; body: string; attempts: number };
  const result = await db.execute(sql`
    UPDATE ${outbox} SET attempts = attempts + 1, next_attempt_at = ${lease.toISOString()}
    WHERE id IN (
      SELECT id FROM ${outbox}
      WHERE status = 'pending' AND next_attempt_at <= ${now.toISOString()}
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, to_email, subject, body, attempts
  `);

  const claimedRows = rowsOf<Row>(result);

  let sent = 0;
  let failed = 0;
  let retrying = 0;
  for (const row of claimedRows) {
    try {
      await transport.send({ to: row.to_email, subject: row.subject, body: row.body });
      await db.update(outbox).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(outbox.id, row.id));
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (row.attempts >= MAX_ATTEMPTS) {
        await db.update(outbox).set({ status: 'failed', lastError: message }).where(eq(outbox.id, row.id));
        failed++;
      } else {
        const backoff = new Date(now.getTime() + 60_000 * 2 ** (row.attempts - 1));
        await db.update(outbox).set({ lastError: message, nextAttemptAt: backoff }).where(eq(outbox.id, row.id));
        retrying++;
      }
    }
  }
  return { sent, failed, retrying };
}

export async function pendingOutboxCount(db: Db, now: Date): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outbox)
    .where(and(inArray(outbox.status, ['pending']), lte(outbox.nextAttemptAt, now)));
  return n;
}

// ─── Templates ──────────────────────────────────────────────────────────────

export const code = (n: number) => `DP-${n}`;
const issueUrl = (appUrl: string, n: number) => `${appUrl}/issues/${n}`;
const staffUrl = (appUrl: string, id: string) => `${appUrl}/staff/issues/${id}`;
const footer = '\n\n— DAU Pulse\nYou are receiving this because you reported or are responsible for this issue.';

export const templates = {
  received(appUrl: string, issue: { number: number; title: string }, joined: boolean): Omit<EmailMessage, 'to'> {
    return {
      subject: `${code(issue.number)} ${joined ? 'Added your report to' : 'Received'}: ${issue.title}`,
      body: `${
        joined
          ? `Thanks. Other students already reported this, so we added you to the same issue. More reports make it a higher priority.`
          : `Thanks for reporting. Your issue has been sent to the team responsible.`
      }\n\n${code(issue.number)}: ${issue.title}\nTrack it: ${issueUrl(appUrl, issue.number)}\n\nWe'll email you when the status changes.${footer}`,
    };
  },

  sensitiveReceived(appUrl: string, issue: { number: number }): Omit<EmailMessage, 'to'> {
    return {
      subject: `${code(issue.number)}: your confidential report was received`,
      body: `Your report has been received and is visible only to the Grievance & Anti-Ragging Committee.\n\nTrack it: ${issueUrl(appUrl, issue.number)}${footer}`,
    };
  },

  statusChanged(
    appUrl: string,
    issue: { number: number; title: string },
    status: string,
    note: string | null,
  ): Omit<EmailMessage, 'to'> {
    const label: Record<string, string> = {
      open: 'Reopened',
      in_progress: 'Being worked on',
      resolved: 'Resolved',
      closed: 'Closed',
    };
    return {
      subject: `${code(issue.number)} ${label[status] ?? status}: ${issue.title}`,
      body: `Status: ${label[status] ?? status}${note ? `\n\nNote from staff:\n${note}` : ''}\n\n${issueUrl(appUrl, issue.number)}${
        status === 'resolved' ? `\n\nNot actually fixed? Open the link and report it again.` : ''
      }${footer}`,
    };
  },

  merged(appUrl: string, from: { number: number }, into: { number: number; title: string }): Omit<EmailMessage, 'to'> {
    return {
      subject: `${code(from.number)} is now tracked as ${code(into.number)}`,
      body: `Your report was the same problem as ${code(into.number)} (${into.title}), so they are now tracked together.\n\n${issueUrl(appUrl, into.number)}${footer}`,
    };
  },

  urgentAlert(
    appUrl: string,
    issue: { id: string; number: number; title: string; urgency: number; isSensitive: boolean },
  ): Omit<EmailMessage, 'to'> {
    // Sensitive issues: no details in email, which is less protected than the app.
    if (issue.isSensitive) {
      return {
        subject: `[Confidential] New sensitive report ${code(issue.number)}`,
        body: `A sensitive report was submitted and is waiting for the committee.\n\nOpen it in DAU Pulse: ${staffUrl(appUrl, issue.id)}${footer}`,
      };
    }
    return {
      subject: `[Urgency ${issue.urgency}/5] ${code(issue.number)}: ${issue.title}`,
      body: `An urgent issue needs attention.\n\n${code(issue.number)}: ${issue.title}\nUrgency: ${issue.urgency}/5\n\n${staffUrl(appUrl, issue.id)}${footer}`,
    };
  },

  assigned(appUrl: string, issue: { id: string; number: number; title: string; isSensitive: boolean }): Omit<EmailMessage, 'to'> {
    return {
      subject: `${code(issue.number)} assigned to you${issue.isSensitive ? '' : `: ${issue.title}`}`,
      body: `You have been assigned ${code(issue.number)}.\n\n${staffUrl(appUrl, issue.id)}${footer}`,
    };
  },
};
