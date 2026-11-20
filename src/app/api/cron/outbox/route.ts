import { NextResponse } from 'next/server';
import { backfillMissingAi } from '@/core/backfill';
import { deliverOutbox } from '@/core/notify';
import { getDeps } from '@/lib/deps';
import { getEmailTransport } from '@/lib/email';
import { authorizeCron } from '../authorize';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Catch-up job: classify issues that were filed while the AI was down, and retry emails that
 * failed or were queued while the mail server was down. Run it often (every 10 min) if you can.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const deps = { ...(await getDeps()), onEmailQueued: undefined };
  const backfill = await backfillMissingAi(deps, 20);
  const delivery = await deliverOutbox(deps.db, getEmailTransport(), new Date(), 200);
  return NextResponse.json({ ok: true, backfill, delivery });
}
