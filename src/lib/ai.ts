import { Issue, Cluster } from './store';
import { GoogleGenAI, Type, Schema } from '@google/genai';

// ==========================================
// FALLBACK: HEURISTIC NLP
// Runs if Gemini API Key is missing or fails
// ==========================================
function fallbackAnalyze(description: string) {
  const lowerDesc = description.toLowerCase();
  
  let category = 'Other';
  let subCategory = 'General Inquiry';
  let urgency = 2;
  let location = 'Location Pending';

  // 1. Tech Support
  if (lowerDesc.includes('wi-fi') || lowerDesc.includes('internet') || lowerDesc.includes('network')) { category = 'Tech Support'; subCategory = 'Wi-Fi Down'; }
  else if (lowerDesc.includes('login') || lowerDesc.includes('portal') || lowerDesc.includes('password')) { category = 'Tech Support'; subCategory = 'Portal Login Issues'; }
  else if (lowerDesc.includes('computer') || lowerDesc.includes('lab') || lowerDesc.includes('printer')) { category = 'Tech Support'; subCategory = 'Lab Computers'; }
  
  // 2. Cafeteria Management
  else if (lowerDesc.includes('food') || lowerDesc.includes('meal') || lowerDesc.includes('taste')) { category = 'Cafeteria Management'; subCategory = 'Food Quality'; }
  else if (lowerDesc.includes('clean') || lowerDesc.includes('hygiene') || lowerDesc.includes('dirty')) { category = 'Cafeteria Management'; subCategory = 'Hygiene'; }
  
  // 3. Hostel Management
  else if (lowerDesc.includes('water') || lowerDesc.includes('plumbing') || lowerDesc.includes('leak')) { category = 'Hostel Management'; subCategory = 'Water/Plumbing'; }
  else if (lowerDesc.includes('light') || lowerDesc.includes('power') || lowerDesc.includes('electricity')) { category = 'Hostel Management'; subCategory = 'Electricity'; }
  else if (lowerDesc.includes('room') || lowerDesc.includes('bed') || lowerDesc.includes('fan')) { category = 'Hostel Management'; subCategory = 'Room Maintenance'; }

  // 4. Academic
  else if (lowerDesc.includes('class') || lowerDesc.includes('schedule') || lowerDesc.includes('timetable')) { category = 'Academic'; subCategory = 'Schedule Changes'; }
  else if (lowerDesc.includes('exam') || lowerDesc.includes('test') || lowerDesc.includes('quiz')) { category = 'Academic'; subCategory = 'Exam Conflicts'; }
  else if (lowerDesc.includes('faculty') || lowerDesc.includes('professor') || lowerDesc.includes('teacher')) { category = 'Academic'; subCategory = 'Faculty Issues'; }
  
  // 5. Sports
  else if (lowerDesc.includes('sport') || lowerDesc.includes('ball') || lowerDesc.includes('bat')) { category = 'Sports'; subCategory = 'Equipment Damage'; }
  else if (lowerDesc.includes('ground') || lowerDesc.includes('court') || lowerDesc.includes('pitch')) { category = 'Sports'; subCategory = 'Ground Availability'; }

  // 6. Student Placement Cell
  else if (lowerDesc.includes('internship') || lowerDesc.includes('placement') || lowerDesc.includes('job')) { category = 'Student Placement Cell'; subCategory = 'Internship Queries'; }
  else if (lowerDesc.includes('interview') || lowerDesc.includes('company')) { category = 'Student Placement Cell'; subCategory = 'Interview Scheduling'; }

  // 7. Internal Complaints / Anti - Ragging
  else if (lowerDesc.includes('harassment') || lowerDesc.includes('bully') || lowerDesc.includes('ragging')) { category = 'Internal Complaints / Anti - Ragging'; subCategory = 'Harassment'; }
  else if (lowerDesc.includes('fight') || lowerDesc.includes('dispute') || lowerDesc.includes('argue')) { category = 'Internal Complaints / Anti - Ragging'; subCategory = 'Peer Dispute'; }
  else if (lowerDesc.includes('safe') || lowerDesc.includes('danger') || lowerDesc.includes('scared')) { category = 'Internal Complaints / Anti - Ragging'; subCategory = 'Safety Concern'; }

  // Location Extraction
  const locations = ['hostel a', 'hostel b', 'hostel c', 'main cafeteria', 'library', 'academic block', 'sports ground', 'main gate'];
  for (const loc of locations) {
    if (lowerDesc.includes(loc)) {
      location = loc.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  // Urgency
  if (lowerDesc.includes('emergency') || lowerDesc.includes('safety') || lowerDesc.includes('danger') || lowerDesc.includes('ragging')) urgency = 5;
  else if (lowerDesc.includes('exam') || lowerDesc.includes('deadline') || lowerDesc.includes('urgent')) urgency = 4;
  else if (lowerDesc.includes('many students') || lowerDesc.includes('since morning')) urgency = 4;
  else if (lowerDesc.includes('late') || lowerDesc.includes('poor')) urgency = 3;

  return { category, subCategory, location, urgency };
}

// ==========================================
// MAIN: GEMINI LLM ANALYSIS
// ==========================================
export async function analyzeIssueWithLLM(description: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[DAU Pulse AI] GEMINI_API_KEY not found. Using fallback heuristic NLP.");
    return fallbackAnalyze(description);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: [
            'Cafeteria Management', 
            'Academic', 
            'Hostel Management', 
            'Sports', 
            'Student Placement Cell', 
            'Tech Support', 
            'Internal Complaints / Anti - Ragging', 
            'Other'
          ],
          description: "The primary committee responsible for this issue."
        },
        subCategory: {
          type: Type.STRING,
          description: "A specific concise sub-category for the issue, e.g., 'Food Quality', 'Wi-Fi Down', 'Exam Conflicts', 'Water/Plumbing', etc."
        },
        location: {
          type: Type.STRING,
          description: "The location of the issue mentioned in the text. Must return exactly 'Location Pending' if NO specific location is mentioned."
        },
        urgency: {
          type: Type.INTEGER,
          description: "A score from 1 to 5 indicating severity. 1=low, 5=critical safety/widespread disruption.",
        }
      },
      required: ['category', 'subCategory', 'location', 'urgency']
    };

    const prompt = `You are DAU Pulse AI, a campus intelligence engine. Analyze the following student issue report and categorize it strictly according to the schema provided.\n\nReport: "${description}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.1,
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      return {
        category: parsed.category || 'Other',
        subCategory: parsed.subCategory || 'General Inquiry',
        location: parsed.location || 'Location Pending',
        urgency: parsed.urgency || 2
      };
    }
    
    throw new Error("Empty response from Gemini.");
  } catch (error) {
    console.error("[DAU Pulse AI] Gemini API Failed. Falling back to heuristic NLP.", error);
    return fallbackAnalyze(description);
  }
}

// ==========================================
// PUBLIC: ONLY EXPOSED FOR WEBHOOK FALLBACK
// ==========================================
export function extractLocation(description: string): string | null {
  const result = fallbackAnalyze(description);
  return result.location === 'Location Pending' ? null : result.location;
}

// ==========================================
// CORE BUSINESS LOGIC
// ==========================================
export async function processNewIssue(issue: Issue, dbIssues: Issue[], dbClusters: Cluster[]): Promise<{ updatedIssues: Issue[], updatedClusters: Cluster[] }> {
  // 1. LLM Classification and Scoring
  if (!issue.category || issue.category === 'Auto') {
    const analysis = await analyzeIssueWithLLM(issue.description);
    issue.category = analysis.category;
    issue.subCategory = analysis.subCategory;
    
    if (!issue.location || issue.location === 'Not specified' || issue.location === 'WhatsApp Reported') {
      issue.location = analysis.location;
    }
    
    if (!issue.urgency || issue.urgency === 0) {
      issue.urgency = analysis.urgency;
    }
  }

  // 2. Clustering Logic
  let foundClusterId: string | null = null;
  const lowerDesc = issue.description.toLowerCase();

  for (const cluster of dbClusters) {
    // 1. Must be in the same category and not resolved
    if (cluster.category !== issue.category || cluster.status === 'Resolved') {
      continue;
    }

    // 2. Location strict check: If both have specific locations, they must match
    const clusterHasLoc = cluster.location && cluster.location !== 'Location Pending' && cluster.location !== 'Not specified' && cluster.location !== 'WhatsApp Reported';
    const issueHasLoc = issue.location && issue.location !== 'Location Pending' && issue.location !== 'Not specified' && issue.location !== 'WhatsApp Reported';

    if (clusterHasLoc && issueHasLoc) {
      if (cluster.location.toLowerCase() !== issue.location.toLowerCase()) {
        continue; // Different locations -> do not cluster
      }
    }

    // 3. Check for matching indicators
    const sameSpecificLocation = clusterHasLoc && issueHasLoc && cluster.location.toLowerCase() === issue.location.toLowerCase();
    const sameSubCategory = cluster.subCategory && issue.subCategory && cluster.subCategory.toLowerCase() === issue.subCategory.toLowerCase();

    // Word/Keyword overlap check
    const cleanDesc = lowerDesc.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    const descWords = cleanDesc.split(/\s+/).filter(w => w.length > 4);
    const stopWords = ['about', 'there', 'their', 'would', 'could', 'should', 'issue', 'problem', 'report', 'working', 'campus', 'under', 'please', 'thanks'];
    const significantDescWords = descWords.filter(w => !stopWords.includes(w));

    const clusterKeywords = cluster.title.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/).filter(w => w.length > 4 && !stopWords.includes(w));
    const hasWordOverlap = significantDescWords.some(w => clusterKeywords.includes(w));

    // Match if:
    // A: Same specific location AND same subCategory
    // B: Same specific location AND description keyword overlap
    // C: One location is pending, but same subCategory AND description word overlap
    if (
      (sameSpecificLocation && sameSubCategory) ||
      (sameSpecificLocation && hasWordOverlap) ||
      ((!clusterHasLoc || !issueHasLoc) && sameSubCategory && hasWordOverlap)
    ) {
      foundClusterId = cluster.id;
      break;
    }
  }

  if (foundClusterId) {
    issue.clusterId = foundClusterId;
    const cluster = dbClusters.find(c => c.id === foundClusterId)!;
    cluster.reportCount += 1;
    cluster.issueIds.push(issue.id);
    
    // Calculate new urgency score: base maximum urgency + report count boost
    const clusterIssues = dbIssues.filter(i => cluster.issueIds.includes(i.id));
    const maxIndividualUrgency = Math.max(...clusterIssues.map(i => i.urgency), issue.urgency);
    
    let boost = 0;
    if (cluster.reportCount >= 4) {
      boost = 2;
    } else if (cluster.reportCount >= 2) {
      boost = 1;
    }
    cluster.urgencyScore = Math.min(5, maxIndividualUrgency + boost);

    cluster.summary = `Multiple students reported issues related to ${cluster.title}. The latest report mentions: "${issue.description.substring(0, 50)}..."`;
  } else {
    const newCluster: Cluster = {
      id: `CLU-${Date.now()}`,
      title: `${issue.subCategory || issue.category} Issue in ${issue.location !== 'Location Pending' ? issue.location : 'Campus'}`,
      category: issue.category,
      subCategory: issue.subCategory,
      location: issue.location,
      reportCount: 1,
      urgencyScore: issue.urgency,
      summary: `A student reported: ${issue.description}`,
      suggestedDepartment: issue.category,
      suggestedAction: `Investigate the reported ${issue.subCategory || issue.category} issue.`,
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
