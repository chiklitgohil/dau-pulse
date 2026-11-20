'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { meTooAction } from '@/app/actions/report';

export function MeTooButton({ issueId, alreadyReported }: { issueId: string; alreadyReported: boolean }) {
  const [done, setDone] = useState(alreadyReported);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
        <Check className="size-4" aria-hidden /> You reported this
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className="btn-secondary btn-sm"
        onClick={() =>
          start(async () => {
            const res = await meTooAction(issueId);
            if (res.ok || /already reported/.test(res.error)) setDone(true);
            else setError(res.error);
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
        Me too
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </span>
  );
}
