import { z } from 'zod';

const list = z
  .string()
  .optional()
  .transform((s) =>
    (s ?? '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),

  AUTH_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  ALLOWED_EMAIL_DOMAIN: z.string().default('dau.ac.in'),
  EXTRA_ALLOWED_EMAILS: list,
  ADMIN_EMAILS: list,
  AUTH_DEV_LOGIN: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODELS: z.string().default('gemini-2.5-flash,gemini-3.5-flash,gemini-3.1-flash-lite'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),

  EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('DAU Pulse <pulse@dau.ac.in>'),

  CRON_SECRET: z.string().optional(),
});

export type Env = z.output<typeof schema> & { devLoginEnabled: boolean; googleEnabled: boolean };

let cached: Env | undefined;

/** Parsed lazily so `next build` doesn't need runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const raw = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]));
  const parsed = schema.parse(raw);
  cached = {
    ...parsed,
    APP_URL: parsed.APP_URL.replace(/\/$/, ''),
    // Never allowed in production, whatever the env says.
    devLoginEnabled: parsed.NODE_ENV !== 'production' && parsed.AUTH_DEV_LOGIN === 'true',
    googleEnabled: !!(parsed.AUTH_GOOGLE_ID && parsed.AUTH_GOOGLE_SECRET),
  };
  return cached;
}
