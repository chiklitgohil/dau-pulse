'use server';

import { getDb, saveDb, Issue } from '@/lib/store';
import { processNewIssue } from '@/lib/ai';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { revalidatePath } from 'next/cache';

export async function submitIssue(formData: FormData) {
  const description = formData.get('description') as string;
  const location = formData.get('location') as string;
  const contact = formData.get('contact') as string;
  const categoryRaw = formData.get('category') as string;

  if (!description) {
    throw new Error('Description is required');
  }

  const db = await getDb();
  
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
  
  await saveDb(db);
  
  revalidatePath('/admin');
  
  return { success: true, ticketId: newIssue.id };
}

export async function getDashboardData() {
  const db = await getDb();
  return {
    issues: db.issues,
    clusters: db.clusters
  };
}

export async function updateIssueStatus(issueId: string, status: any) {
  const db = await getDb();
  const issue = db.issues.find(i => i.id === issueId);
  if (issue) {
    issue.status = status;
    await saveDb(db);
    revalidatePath('/admin');
  }
}

export async function resolveCluster(clusterId: string) {
  const db = await getDb();
  const cluster = db.clusters.find(c => c.id === clusterId);
  
  if (!cluster) return;

  cluster.status = 'Resolved';
  
  const resolvedIssuePhones = new Set<string>();

  for (const issueId of cluster.issueIds) {
    const issue = db.issues.find(i => i.id === issueId);
    if (issue) {
      issue.status = 'Resolved';
      if (issue.phone) {
        resolvedIssuePhones.add(issue.phone);
      }
    }
  }

  await saveDb(db);

  // Send WhatsApp messages asynchronously
  for (const phone of resolvedIssuePhones) {
    try {
      await sendWhatsAppMessage(
        phone, 
        `✅ Good news! The issue you reported regarding "${cluster.title}" has been marked as Resolved by the campus administration.`
      );
    } catch (e) {
      console.error('Failed to notify user about resolution:', e);
    }
  }

  revalidatePath('/admin');
  revalidatePath(`/admin/clusters/${clusterId}`);
}
