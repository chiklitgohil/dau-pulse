import { requireStaff } from '@/lib/session';

/** Every /staff page requires a staff or admin account (each page and action also checks). */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return children;
}
