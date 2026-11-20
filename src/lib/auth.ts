import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { getDb } from '@/db/client';
import { isAllowedEmail, upsertUserOnSignIn, type SignInPolicy } from '@/core/users';
import { env } from './env';

declare module '@auth/core/jwt' {
  interface JWT {
    uid?: string;
  }
}

function policy(): SignInPolicy {
  const e = env();
  return { allowedDomain: e.ALLOWED_EMAIL_DOMAIN, extraAllowedEmails: e.EXTRA_ALLOWED_EMAILS, adminEmails: e.ADMIN_EMAILS };
}

function config(): NextAuthConfig {
  const e = env();
  const providers: NextAuthConfig['providers'] = [];

  if (e.googleEnabled) {
    providers.push(
      // `hd` makes Google show only accounts on the college Workspace; we still verify it server-side.
      Google({ authorization: { params: { hd: e.ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' } } }),
    );
  }
  if (e.devLoginEnabled) {
    providers.push(
      Credentials({
        id: 'dev',
        name: 'Developer login',
        credentials: { email: { label: 'Email', type: 'email' } },
        async authorize(c) {
          const email = String(c?.email ?? '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
          return { id: email, email, name: email.split('@')[0] };
        },
      }),
    );
  }

  return {
    secret: e.AUTH_SECRET ?? (e.NODE_ENV !== 'production' ? 'dev-only-insecure-secret-set-AUTH_SECRET' : undefined),
    trustHost: true,
    session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
    pages: { signIn: '/signin', error: '/signin' },
    providers,
    callbacks: {
      async signIn({ account, profile, user }) {
        const p = policy();
        if (account?.provider === 'google') {
          const email = profile?.email?.toLowerCase();
          if (!email || profile?.email_verified !== true) return false;
          const explicitlyAllowed = p.extraAllowedEmails.includes(email) || p.adminEmails.includes(email);
          // Workspace accounts carry the `hd` claim; a personal Gmail with a look-alike address doesn't.
          return explicitlyAllowed || (profile.hd === p.allowedDomain && isAllowedEmail(email, p));
        }
        if (account?.provider === 'dev') return e.devLoginEnabled && !!user.email && isAllowedEmail(user.email, p);
        return false;
      },
      async jwt({ token, account, user, profile }) {
        if (account) {
          const email = (user?.email ?? profile?.email ?? '').toLowerCase();
          const actor = await upsertUserOnSignIn(
            await getDb(),
            { email, name: user?.name ?? profile?.name, image: user?.image ?? (profile?.picture as string | undefined) },
            policy(),
            new Date(),
          );
          token.uid = actor.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (token.uid && session.user) session.user.id = token.uid;
        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => config());
