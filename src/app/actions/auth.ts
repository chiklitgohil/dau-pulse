'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/lib/auth';

export async function googleSignInAction() {
  await signIn('google', { redirectTo: '/' });
}

export async function devSignInAction(form: FormData) {
  try {
    await signIn('dev', { email: String(form.get('email') ?? ''), redirectTo: '/' });
  } catch (err) {
    if (err instanceof AuthError) redirect('/signin?error=AccessDenied');
    throw err;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/signin' });
}
