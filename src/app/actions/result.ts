import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { isUserError } from '@/core/errors';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Run a server action body. Known errors become a message for the user; anything else is logged
 * and replaced with a generic message (no stack traces or internals leak to the browser).
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() through
    if (isUserError(err)) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: 'Some fields are missing or invalid.' };
    console.error('[action] unexpected error', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

export function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
