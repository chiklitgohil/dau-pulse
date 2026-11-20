import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/app/actions/auth';
import { isAdmin, isStaff } from '@/core/permissions';
import { currentActor } from '@/lib/session';
import { NavLink } from './NavLink';

export async function Header() {
  const actor = await currentActor();
  const staff = isStaff(actor);
  const admin = isAdmin(actor);

  return (
    <header className="border-b border-brand-800 bg-brand-700 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm text-brand-900">DP</span>
          <span className="text-lg">DAU Pulse</span>
        </Link>

        {actor && (
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto" aria-label="Main">
            <NavLink href="/report">Report</NavLink>
            <NavLink href="/board">Campus board</NavLink>
            <NavLink href="/my">My reports</NavLink>
            {staff && <NavLink href="/staff">Staff queue</NavLink>}
            {admin && <NavLink href="/staff/admin/people">People</NavLink>}
            {admin && <NavLink href="/staff/admin/outbox">Email log</NavLink>}
          </nav>
        )}

        {actor && (
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-brand-100 sm:inline" title={actor.email}>
              {actor.name ?? actor.email}
            </span>
            <form action={signOutAction}>
              <button type="submit" className="flex items-center gap-1 rounded-md px-2 py-1 text-brand-100 hover:bg-brand-800 hover:text-white">
                <LogOut className="size-4" aria-hidden />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
