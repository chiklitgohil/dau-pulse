'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === '/staff' ? pathname === '/staff' || pathname.startsWith('/staff/issues') : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors ${
        active ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}
