import fs from 'fs';
import path from 'path';

export interface Issue {
  id: string;
  description: string;
  category: string;
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

export interface Database {
  issues: Issue[];
  clusters: Cluster[];
}

const dbPath = path.join(process.cwd(), 'src/lib/db.json');

const defaultDb: Database = {
  issues: [
    {
      id: "ISS-001",
      description: "Wi-Fi in Hostel B has been down since morning and I have an online quiz.",
      category: "Wi-Fi / IT",
      location: "Hostel B",
      urgency: 4,
      status: "In Review",
      contact: "Anonymous",
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      clusterId: "CLU-001"
    },
    {
      id: "ISS-002",
      description: "No internet in B block since 8 AM.",
      category: "Wi-Fi / IT",
      location: "Hostel B",
      urgency: 4,
      status: "In Review",
      contact: "John D.",
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      clusterId: "CLU-001"
    },
    {
      id: "ISS-003",
      description: "Cafeteria food quality was poor today and many students complained.",
      category: "Cafeteria",
      location: "Main Cafeteria",
      urgency: 3,
      status: "New",
      contact: "Jane S.",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      clusterId: "CLU-002"
    },
    {
      id: "ISS-004",
      description: "Bus from hostel to main gate was late again.",
      category: "Transport",
      location: "Hostel Gate",
      urgency: 2,
      status: "New",
      contact: "",
      createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      clusterId: "CLU-003"
    }
  ],
  clusters: [
    {
      id: "CLU-001",
      title: "Hostel B Wi-Fi Outage",
      category: "Wi-Fi / IT",
      location: "Hostel B",
      reportCount: 2,
      urgencyScore: 4,
      summary: "Multiple students reported that Wi-Fi in Hostel B has been unavailable or unstable since morning. The issue appears to affect academic work and online access for hostel residents.",
      suggestedDepartment: "IT / Network Operations",
      suggestedAction: "Check router/access point status in Hostel B and post a status update to affected students.",
      status: "In Progress",
      createdAt: new Date(Date.now() - 3600000 * 4.5).toISOString(),
      issueIds: ["ISS-001", "ISS-002"]
    },
    {
      id: "CLU-002",
      title: "Cafeteria Food Quality Issue",
      category: "Cafeteria",
      location: "Main Cafeteria",
      reportCount: 1,
      urgencyScore: 3,
      summary: "A student reported poor food quality in the main cafeteria today.",
      suggestedDepartment: "Food Services",
      suggestedAction: "Inspect today's food batch and address quality control with the vendor.",
      status: "New",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      issueIds: ["ISS-003"]
    },
    {
      id: "CLU-003",
      title: "Transport Delay from Hostel",
      category: "Transport",
      location: "Hostel Gate",
      reportCount: 1,
      urgencyScore: 2,
      summary: "A student reported the bus from the hostel to the main gate was delayed.",
      suggestedDepartment: "Transport Office",
      suggestedAction: "Monitor bus schedule adherence for the hostel route.",
      status: "New",
      createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      issueIds: ["ISS-004"]
    }
  ]
};

export function getDb(): Database {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2));
    return defaultDb;
  }
  const data = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(data);
}

export function saveDb(db: Database) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
