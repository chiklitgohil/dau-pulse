import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { departments, users, type Role } from '@/db/schema';
import { UserError } from './errors';
import { isAdmin } from './permissions';
import type { Actor } from './types';

export type SignInPolicy = {
  allowedDomain: string | null;
  extraAllowedEmails: string[];
  adminEmails: string[];
};

/** Is this Google account allowed in? Domain accounts only (plus an explicit allow-list). */
export function isAllowedEmail(email: string, policy: SignInPolicy): boolean {
  const e = email.trim().toLowerCase();
  if (policy.extraAllowedEmails.includes(e) || policy.adminEmails.includes(e)) return true;
  if (!policy.allowedDomain) return false;
  return e.endsWith(`@${policy.allowedDomain.toLowerCase()}`);
}

/** Create the user on first sign-in, refresh name/photo, and grant admin to bootstrap emails. */
export async function upsertUserOnSignIn(
  db: Db,
  profile: { email: string; name?: string | null; image?: string | null },
  policy: SignInPolicy,
  now: Date,
): Promise<Actor> {
  const email = profile.email.trim().toLowerCase();
  const makeAdmin = policy.adminEmails.includes(email);
  const [row] = await db
    .insert(users)
    .values({
      email,
      name: profile.name ?? null,
      image: profile.image ?? null,
      role: makeAdmin ? 'admin' : 'student',
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        ...(profile.name ? { name: profile.name } : {}),
        ...(profile.image ? { image: profile.image } : {}),
        ...(makeAdmin ? { role: 'admin' as const } : {}),
        lastLoginAt: now,
      },
    })
    .returning();
  return toActor(row);
}

export async function getActor(db: Db, userId: string): Promise<Actor | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ? toActor(row) : null;
}

export function toActor(row: typeof users.$inferSelect): Actor {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    departmentId: row.departmentId,
    active: row.active,
  };
}

// ─── admin: people & roles ──────────────────────────────────────────────────

export async function listUsers(db: Db, actor: Actor) {
  if (!isAdmin(actor)) throw new UserError('forbidden', 'Admins only.');
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      departmentId: users.departmentId,
      departmentName: departments.name,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .orderBy(asc(users.role), asc(users.email));
}

export const updateUserSchema = z.object({
  userId: z.uuid(),
  role: z.enum(['student', 'staff', 'admin']),
  departmentId: z.uuid().nullable(),
  active: z.boolean(),
});

export async function updateUser(db: Db, actor: Actor, raw: z.input<typeof updateUserSchema>) {
  if (!isAdmin(actor)) throw new UserError('forbidden', 'Admins only.');
  const input = updateUserSchema.parse(raw);
  if (input.userId === actor.id && (input.role !== 'admin' || !input.active)) {
    throw new UserError('invalid_input', "You can't remove your own admin access.");
  }
  if (input.role === 'staff' && !input.departmentId) {
    throw new UserError('invalid_input', 'Staff must belong to a department.');
  }
  const role: Role = input.role;
  await db
    .update(users)
    .set({ role, departmentId: input.role === 'student' ? null : input.departmentId, active: input.active })
    .where(eq(users.id, input.userId));
}

export async function updateDepartmentEmail(db: Db, actor: Actor, departmentId: string, email: string | null) {
  if (!isAdmin(actor)) throw new UserError('forbidden', 'Admins only.');
  const value = email?.trim() || null;
  if (value && !z.email().safeParse(value).success) throw new UserError('invalid_input', 'Not a valid email.');
  await db.update(departments).set({ email: value }).where(eq(departments.id, departmentId));
}
