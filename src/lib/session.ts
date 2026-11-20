import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/db/client';
import { isAdmin, isStaff } from '@/core/permissions';
import type { Actor } from '@/core/types';
import { getActor } from '@/core/users';
import { auth } from './auth';

/**
 * The signed-in person, loaded fresh from the database on every request, so role changes and
 * deactivation take effect immediately (the session cookie only carries the user id).
 */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  const actor = await getActor(await getDb(), uid);
  return actor?.active ? actor : null;
});

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/signin');
  return actor;
}

export async function requireStaff(): Promise<Actor> {
  const actor = await requireActor();
  if (!isStaff(actor)) redirect('/report');
  return actor;
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor();
  if (!isAdmin(actor)) redirect('/staff');
  return actor;
}
