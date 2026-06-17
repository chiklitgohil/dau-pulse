'use server';

import { getDb, saveDb, Issue } from '@/lib/store';
import { processNewIssue } from '@/lib/ai';
import { revalidatePath } from 'next/cache';

export async function submitIssue(formData: FormData) {
  const description = formData.get('description') as string;
  const location = formData.get('location') as string;
  const contact = formData.get('contact') as string;
  const categoryRaw = formData.get('category') as string;

  if (!description) {
    throw new Error('Description is required');
  }

  const db = getDb();
  
  const newIssue: Issue = {
    id: `ISS-${Date.now()}`,
    description,
    category: categoryRaw || 'Auto',
    location: location || 'Not specified',
    urgency: 0, // Will be scored by AI
    status: 'New',
    contact: contact || 'Anonymous',
    createdAt: new Date().toISOString()
  };

  const { updatedIssues, updatedClusters } = await processNewIssue(newIssue, db.issues, db.clusters);
  
  db.issues = updatedIssues;
  db.clusters = updatedClusters;
  
  saveDb(db);
  
  revalidatePath('/admin');
  
  return { success: true, ticketId: newIssue.id };
}

export async function getDashboardData() {
  const db = getDb();
  return {
    issues: db.issues,
    clusters: db.clusters
  };
}

export async function updateIssueStatus(issueId: string, status: any) {
  const db = getDb();
  const issue = db.issues.find(i => i.id === issueId);
  if (issue) {
    issue.status = status;
    saveDb(db);
    revalidatePath('/admin');
  }
}
