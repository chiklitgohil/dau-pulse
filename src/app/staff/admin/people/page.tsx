import type { Metadata } from 'next';
import { getDb } from '@/db/client';
import { listUsers } from '@/core/users';
import { loadTaxonomy } from '@/core/taxonomy';
import { requireAdmin } from '@/lib/session';
import { updateDepartmentEmailAction, updateUserAction } from '@/app/actions/staff';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { relativeTime } from '@/components/ui';

export const metadata: Metadata = { title: 'People & teams' };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireAdmin();
  const { q } = await searchParams;
  const db = await getDb();
  const [all, taxonomy] = await Promise.all([listUsers(db, actor), loadTaxonomy(db)]);
  const needle = q?.trim().toLowerCase();
  const people = needle ? all.filter((u) => u.email.includes(needle) || u.name?.toLowerCase().includes(needle)) : all;
  const staff = people.filter((u) => u.role !== 'student');
  const students = people.filter((u) => u.role === 'student');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">People & teams</h1>
        <p className="mt-1 text-slate-600">
          Everyone signs in with Google; new accounts start as students. Make someone staff and pick their team to give them that team&apos;s queue.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Team email addresses</h2>
        <p className="mt-1 text-sm text-slate-600">Each team gets a daily digest and instant alerts for urgent issues at this address.</p>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {taxonomy.departments.map((d) => (
            <li key={d.id}>
              <ActionForm action={updateDepartmentEmailAction} className="flex items-end gap-2">
                <input type="hidden" name="departmentId" value={d.id} />
                <div className="flex-1">
                  <label htmlFor={`dept-${d.id}`} className="label">
                    {d.name}
                    {d.isSensitive && <span className="ml-1 text-xs font-normal text-violet-700">(confidential)</span>}
                  </label>
                  <input id={`dept-${d.id}`} name="email" type="email" defaultValue={d.email ?? ''} placeholder="team@dau.ac.in" className="input" />
                </div>
                <SubmitButton className="btn-secondary btn-sm mb-0.5">Save</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Find a person by name or email" className="input max-w-md" aria-label="Find a person" />
        <button className="btn-secondary">Search</button>
      </form>

      <PeopleTable title={`Staff & admins (${staff.length})`} people={staff} departments={taxonomy.departments} selfId={actor.id} />
      <PeopleTable title={`Students (${students.length})`} people={students.slice(0, 200)} departments={taxonomy.departments} selfId={actor.id} />
      {students.length > 200 && <p className="text-sm text-slate-500">Showing 200 students. Search to find others.</p>}
    </div>
  );
}

function PeopleTable({
  title,
  people,
  departments,
  selfId,
}: {
  title: string;
  people: Awaited<ReturnType<typeof listUsers>>;
  departments: Array<{ id: string; name: string }>;
  selfId: string;
}) {
  return (
    <section>
      <h2 className="font-semibold">{title}</h2>
      <div className="card mt-3 divide-y divide-slate-100">
        {people.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">Nobody here.</p>}
        {people.map((u) => (
          <ActionForm key={u.id} action={updateUserAction} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <input type="hidden" name="userId" value={u.id} />
            <div className="min-w-48 flex-1">
              <p className="font-medium text-slate-900">
                {u.name ?? u.email}
                {u.id === selfId && <span className="ml-1 text-xs text-slate-500">(you)</span>}
              </p>
              <p className="text-xs text-slate-500">
                {u.email}
                {u.lastLoginAt && ` · last seen ${relativeTime(u.lastLoginAt)}`}
              </p>
            </div>
            <select name="role" defaultValue={u.role} className="input w-auto" aria-label={`Role for ${u.email}`}>
              <option value="student">Student</option>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <select name="departmentId" defaultValue={u.departmentId ?? ''} className="input w-auto" aria-label={`Team for ${u.email}`}>
              <option value="">No team</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="active" defaultChecked={u.active} className="size-4 accent-brand-700" /> Active
            </label>
            <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
          </ActionForm>
        ))}
      </div>
    </section>
  );
}
