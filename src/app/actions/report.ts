'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { backfillMissingAi } from '@/core/backfill';
import { analyzeReport, reportSameIssue, submitReport, type Analysis, type SubmitInput, type SubmitResult } from '@/core/intake';
import { getDeps } from '@/lib/deps';
import { requireActor } from '@/lib/session';
import { run, type ActionResult } from './result';

export async function analyzeAction(text: string): Promise<ActionResult<Analysis>> {
  return run(async () => {
    const actor = await requireActor();
    return analyzeReport(await getDeps(), actor, { text: String(text ?? ''), channel: 'web' });
  });
}

export async function submitAction(input: SubmitInput): Promise<ActionResult<SubmitResult>> {
  return run(async () => {
    const actor = await requireActor();
    const deps = await getDeps();
    const result = await submitReport(deps, actor, input);
    revalidatePath('/board');
    revalidatePath('/my');
    // If earlier reports were filed while the AI was down, try to fill them in now (cheap no-op otherwise).
    after(() => backfillMissingAi(deps, 3).catch((err) => console.error('[backfill]', err)));
    return result;
  });
}

export async function meTooAction(issueId: string): Promise<ActionResult<SubmitResult>> {
  return run(async () => {
    const actor = await requireActor();
    const result = await reportSameIssue(await getDeps(), actor, String(issueId));
    revalidatePath('/board');
    revalidatePath('/my');
    revalidatePath(`/issues/${result.issueNumber}`);
    return result;
  });
}
