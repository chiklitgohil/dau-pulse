import { kv } from '@vercel/kv';

export type CommitteeCategory = 
  | 'Cafeteria Management' 
  | 'Academic' 
  | 'Hostel Management' 
  | 'Sports' 
  | 'Student Placement Cell' 
  | 'Tech Support' 
  | 'Internal Complaints / Anti - Ragging' 
  | 'Other';

export interface Issue {
  id: string;
  description: string;
  category: string;
  subCategory?: string;
  location: string;
  urgency: number;
  status: 'New' | 'In Review' | 'In Progress' | 'Resolved' | 'Closed';
  contact: string;
  createdAt: string;
  clusterId?: string;
}

export interface Cluster {
  id: string;
  title: string;
  category: string;
  subCategory?: string;
  location: string;
  reportCount: number;
  urgencyScore: number;
  summary: string;
  suggestedDepartment: string;
  suggestedAction: string;
  status: 'New' | 'In Progress' | 'Resolved';
  createdAt: string;
  issueIds: string[];
}

export interface UserSession {
  phoneId: string;
  state: 'idle' | 'awaiting_location';
  pendingIssueId?: string;
  lastInteraction: string;
}

export interface Database {
  issues: Issue[];
  clusters: Cluster[];
  sessions: UserSession[];
  processedMessageIds?: string[];
}


const defaultDb: Database = {
  issues: [
    {
      id: "ISS-001",
      description: "Wi-Fi in Hostel B has been down since morning and I have an online quiz.",
      category: "Tech Support",
      subCategory: "Wi-Fi Down",
      location: "Hostel B",
      urgency: 4,
      status: "In Review",
      contact: "Anonymous",
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      clusterId: "CLU-001"
    },
    {
      id: "ISS-002",
      description: "Cafeteria food quality was poor today and many students complained.",
      category: "Cafeteria Management",
      subCategory: "Food Quality",
      location: "Main Cafeteria",
      urgency: 3,
      status: "New",
      contact: "Jane S.",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      clusterId: "CLU-002"
    }
  ],
  clusters: [
    {
      id: "CLU-001",
      title: "Hostel B Wi-Fi Outage",
      category: "Tech Support",
      subCategory: "Wi-Fi Down",
      location: "Hostel B",
      reportCount: 1,
      urgencyScore: 4,
      summary: "A student reported that Wi-Fi in Hostel B has been unavailable since morning.",
      suggestedDepartment: "Tech Support",
      suggestedAction: "Check router/access point status in Hostel B and post a status update.",
      status: "In Progress",
      createdAt: new Date(Date.now() - 3600000 * 4.5).toISOString(),
      issueIds: ["ISS-001"]
    },
    {
      id: "CLU-002",
      title: "Cafeteria Food Quality Issue",
      category: "Cafeteria Management",
      subCategory: "Food Quality",
      location: "Main Cafeteria",
      reportCount: 1,
      urgencyScore: 3,
      summary: "A student reported poor food quality in the main cafeteria today.",
      suggestedDepartment: "Cafeteria Management",
      suggestedAction: "Inspect today's food batch and address quality control with the vendor.",
      status: "New",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      issueIds: ["ISS-002"]
    }
  ],
  sessions: []
};

export async function getDb(): Promise<Database> {
  try {
    const db = await kv.get<Database>('dau_pulse_db');
    if (db) {
      db.issues = db.issues || [];
      db.clusters = db.clusters || [];
      db.sessions = db.sessions || [];
      db.processedMessageIds = db.processedMessageIds || [];
      return db;
    }
  } catch (error) {
    console.error("KV getDb error:", error);
  }
  return defaultDb;
}

export async function saveDb(db: Database) {
  try {
    await kv.set('dau_pulse_db', db);
  } catch (error) {
    console.error("KV saveDb error:", error);
  }
}
