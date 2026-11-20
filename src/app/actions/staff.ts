'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addInternalNote, assignIssue, changeStatus, dismissPossibleDuplicate, mergeIssues, reclassifyIssue } from '@/core/staff';
import { updateDepartmentEmail, updateUser } from '@/core/users';
import { getDeps } from '@/lib/deps';
import { requireStaff } from '@/lib/session';
import { run, str, type ActionResult } from './result';

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

const refresh = (issueId: string) => {
  revalidatePath(`/staff/issues/${issueId}`);
  revalidatePath('/staff');
};

export const changeStatusAction: FormAction = async (_prev, form) =>
  run(async () => {
    const actor = await requireStaff();
    const issueId = str(form, 'issueId') ?? '';
    await changeStatus(await getDeps(), actor, {
      issueId,
      status: str(form, 'status') as 'open' | 'in_progress' | 'resolved' | 'closed',
      note: str(form, 'note'),
    });
    refresh(issueId);
    return null;
  });

export const assignAction: FormAction = async (_prev, form) =>
  run(async () => {
    const actor = await requireStaff();
    const issueId = str(form, 'issueId') ?? '';
    await assignIssue(await getDeps(), actor, issueId, str(form, 'assigneeId') ?? null);
    refresh(issueId);
    return null;
  });

export const reclassifyAction: FormAction = async (_prev, form) => {
  let leftQueue = false;
  const res = await run(async () => {
    const actor = await requireStaff();
    const issueId = str(form, 'issueId') ?? '';
    const { stillAccessible } = await reclassifyIssue(await getDeps(), actor, {
      issueId,
      categorySlug: str(form, 'categorySlug') ?? '',
      subcategorySlug: str(form, 'subcategorySlug') ?? null,
      locationSlug: str(form, 'locationSlug') ?? null,
      locationDetail: str(form, 'locationDetail') ?? null,
      isSensitive: form.get('isSensitive') === 'on',
    });
    refresh(issueId);
    leftQueue = !stillAccessible;
    return null;
  });
  // Moved to a department this person can't see: take them back to their queue.
  if (res.ok && leftQueue) redirect('/staff?moved=1');
  return res;
};

export const noteAction: FormAction = async (_prev, form) =>
  run(async () => {
    const actor = await requireStaff();
    const issueId = str(form, 'issueId') ?? '';
    await addInternalNote(await getDeps(), actor, issueId, str(form, 'text') ?? '');
    refresh(issueId);
    return null;
  });

export const mergeAction: FormAction = async (_prev, form) => {
  const sourceId = str(form, 'sourceId') ?? '';
  const targetId = str(form, 'targetId') ?? '';
  const res = await run(async () => {
    const actor = await requireStaff();
    await mergeIssues(await getDeps(), actor, sourceId, targetId);
    refresh(sourceId);
    refresh(targetId);
    return null;
  });
  if (res.ok) redirect(`/staff/issues/${targetId}`);
  return res;
};

export const dismissDuplicateAction: FormAction = async (_prev, form) =>
  run(async () => {
    const actor = await requireStaff();
    const issueId = str(form, 'issueId') ?? '';
    await dismissPossibleDuplicate(await getDeps(), actor, issueId);
    refresh(issueId);
    return null;
  });

// ─── admin ──────────────────────────────────────────────────────────────────

export const updateUserAction: FormAction = async (_prev, form) =>
  run(async () => {
    const actor = await requireStaff();
    const { db } = await getDeps();
    await updateUser(db, actor, {
      userId: str(form, 'userId') ?? '',
      role: (str(form, 'role') ?? 'student') as 'student' | 'staff' | 'admin',
      departmentId: str(form, 'departmentId') ?? null,
      active: form.get('active') === 'on',
    });
    revalidatePath('/staff/admin/people');
    return null;
  });

export const updateDepartmentEmailAction: FormAction = async (_prev, form) =>
  run(async () => {
    const actor = await requireStaff();
    const { db } = await getDeps();
    await updateDepartmentEmail(db, actor, str(form, 'departmentId') ?? '', str(form, 'email') ?? null);
    revalidatePath('/staff/admin/people');
    return null;
  });
