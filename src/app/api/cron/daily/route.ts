import { NextResponse } from 'next/server';
import { backfillMissingAi } from '@/core/backfill';
import { runDailyJobs } from '@/core/jobs';
import { deliverOutbox } from '@/core/notify';
import { getDeps } from '@/lib/deps';
import { getEmailTransport } from '@/lib/email';
import { authorizeCron } from '../authorize';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily: escalate overdue issues, send digests, then deliver everything pending. */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const deps = { ...(await getDeps()), onEmailQueued: undefined };
  const backfill = await backfillMissingAi(deps, 50);
  const jobs = await runDailyJobs(deps);
  const delivery = await deliverOutbox(deps.db, getEmailTransport(), new Date(), 200);
  return NextResponse.json({ ok: true, ...jobs, backfill, delivery });
}
