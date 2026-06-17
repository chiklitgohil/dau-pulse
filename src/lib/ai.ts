import { Issue, Cluster } from './store';

export async function mockClassifyIssue(description: string): Promise<string> {
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes('wi-fi') || lowerDesc.includes('internet') || lowerDesc.includes('network')) return 'Wi-Fi / IT';
  if (lowerDesc.includes('food') || lowerDesc.includes('cafeteria')) return 'Cafeteria';
  if (lowerDesc.includes('bus') || lowerDesc.includes('transport') || lowerDesc.includes('late')) return 'Transport';
  if (lowerDesc.includes('class') || lowerDesc.includes('assignment') || lowerDesc.includes('exam')) return 'Academics';
  if (lowerDesc.includes('light') || lowerDesc.includes('water') || lowerDesc.includes('maintenance')) return 'Hostel';
  if (lowerDesc.includes('id card') || lowerDesc.includes('lost')) return 'Lost & Found';
  return 'Other';
}

export async function mockScoreUrgency(description: string): Promise<number> {
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes('emergency') || lowerDesc.includes('safety') || lowerDesc.includes('danger')) return 5;
  if (lowerDesc.includes('exam') || lowerDesc.includes('deadline') || lowerDesc.includes('urgent')) return 4;
  if (lowerDesc.includes('many students') || lowerDesc.includes('since morning')) return 4;
  if (lowerDesc.includes('late') || lowerDesc.includes('poor')) return 3;
  return 2;
}

export async function mockSuggestDepartment(category: string): Promise<string> {
  const map: Record<string, string> = {
    'Wi-Fi / IT': 'IT / Network Operations',
    'Cafeteria': 'Food Services',
    'Transport': 'Transport Office',
    'Academics': 'Academic Affairs',
    'Hostel': 'Hostel Management',
    'Lost & Found': 'Campus Security'
  };
  return map[category] || 'General Administration';
}

export async function processNewIssue(issue: Issue, dbIssues: Issue[], dbClusters: Cluster[]): Promise<{ updatedIssues: Issue[], updatedClusters: Cluster[] }> {
  // 1. Classify and Score
  if (!issue.category || issue.category === 'Auto') {
    issue.category = await mockClassifyIssue(issue.description);
  }
  if (!issue.urgency || issue.urgency === 0) {
    issue.urgency = await mockScoreUrgency(issue.description);
  }

  // 2. Clustering (Mock Logic: Group by exact category and similar location/keywords)
  let foundClusterId: string | null = null;
  const lowerDesc = issue.description.toLowerCase();

  for (const cluster of dbClusters) {
    if (cluster.category === issue.category && cluster.status !== 'Resolved') {
      // Basic similarity check
      const keywords = cluster.title.toLowerCase().split(' ');
      const hasOverlap = keywords.some(kw => kw.length > 4 && lowerDesc.includes(kw));
      if (hasOverlap || cluster.location === issue.location) {
        foundClusterId = cluster.id;
        break;
      }
    }
  }

  if (foundClusterId) {
    // Add to existing cluster
    issue.clusterId = foundClusterId;
    const cluster = dbClusters.find(c => c.id === foundClusterId)!;
    cluster.reportCount += 1;
    cluster.issueIds.push(issue.id);
    if (issue.urgency > cluster.urgencyScore) {
      cluster.urgencyScore = issue.urgency;
    }
    cluster.summary = `Multiple students reported issues related to ${cluster.title}. The latest report mentions: "${issue.description.substring(0, 50)}..."`;
  } else {
    // Create new cluster
    const newCluster: Cluster = {
      id: `CLU-${Date.now()}`,
      title: `${issue.category} Issue in ${issue.location || 'Campus'}`,
      category: issue.category,
      location: issue.location || 'General',
      reportCount: 1,
      urgencyScore: issue.urgency,
      summary: `A student reported: ${issue.description}`,
      suggestedDepartment: await mockSuggestDepartment(issue.category),
      suggestedAction: `Investigate the reported ${issue.category} issue.`,
      status: 'New',
      createdAt: new Date().toISOString(),
      issueIds: [issue.id]
    };
    issue.clusterId = newCluster.id;
    dbClusters.push(newCluster);
  }

  dbIssues.push(issue);
  return { updatedIssues: dbIssues, updatedClusters: dbClusters };
}
