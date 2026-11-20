import { redirect } from 'next/navigation';
import { isStaff } from '@/core/permissions';
import { currentActor } from '@/lib/session';

export default async function Home() {
  const actor = await currentActor();
  if (!actor) redirect('/signin');
  redirect(isStaff(actor) ? '/staff' : '/report');
}
