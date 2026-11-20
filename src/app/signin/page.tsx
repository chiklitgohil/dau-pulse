import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CheckCircle2, Megaphone, Users } from 'lucide-react';
import { devSignInAction, googleSignInAction } from '@/app/actions/auth';
import { env } from '@/lib/env';
import { currentActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  AccessDenied: 'Please sign in with your college Google account.',
  Configuration: 'Sign-in is not configured correctly. Please tell the DAU Pulse admins.',
  Verification: 'That sign-in link has expired. Please try again.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentActor()) redirect('/');
  const { error } = await searchParams;
  const e = env();

  return (
    <div className="mx-auto grid max-w-4xl items-center gap-10 py-6 md:grid-cols-2">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">Something broken on campus?</h1>
        <p className="mt-3 text-slate-600">
          Tell us in your own words. DAU Pulse sends it to the team that fixes it, groups it with reports from other students, and emails you when it&apos;s done.
        </p>
        <ul className="mt-6 space-y-3 text-sm text-slate-700">
          <li className="flex gap-3">
            <Megaphone className="size-5 shrink-0 text-brand-600" aria-hidden />
            Write it like a message. No forms, no menus.
          </li>
          <li className="flex gap-3">
            <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
            See if others reported it too, and add your voice to raise its priority.
          </li>
          <li className="flex gap-3">
            <CheckCircle2 className="size-5 shrink-0 text-brand-600" aria-hidden />
            Get told what was done. Every report has an owner and a deadline.
          </li>
        </ul>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-slate-500">Use your @{e.ALLOWED_EMAIL_DOMAIN} Google account.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
          </p>
        )}

        {e.googleEnabled ? (
          <form action={googleSignInAction} className="mt-6">
            <button type="submit" className="btn-primary w-full py-2.5">
              <GoogleIcon /> Continue with Google
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Google sign-in isn&apos;t configured yet (set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code>).
          </p>
        )}

        {e.devLoginEnabled && (
          <form action={devSignInAction} className="mt-6 border-t border-dashed border-slate-300 pt-6">
            <label htmlFor="dev-email" className="label">
              Developer login <span className="font-normal text-slate-500">(local only)</span>
            </label>
            <div className="flex gap-2">
              <input id="dev-email" name="email" type="email" required placeholder={`student@${e.ALLOWED_EMAIL_DOMAIN}`} className="input" />
              <button type="submit" className="btn-secondary">
                Go
              </button>
            </div>
            <p className="hint">Signs you in as any allowed email. Emails listed in ADMIN_EMAILS become admins.</p>
          </form>
        )}
      </section>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.67 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.96 2.75 2.9 6.86 2.9 12s4.06 9.25 9.1 9.25c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.05-.15-1.5z" />
    </svg>
  );
}
