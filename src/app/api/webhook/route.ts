import { NextResponse } from 'next/server';
import { getDb, saveDb, Issue, UserSession } from '@/lib/store';
import { processNewIssue, extractLocation } from '@/lib/ai';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'dau_pulse_secret_token';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const contactInfo = value.contacts?.[0];
        
        if (message.type === 'text') {
          const fromPhone = message.from;
          const textBody = message.text.body;
          const senderName = contactInfo?.profile?.name || fromPhone;

          const db = getDb();
          
          // Check if user has an active session
          let session = db.sessions.find(s => s.phoneId === fromPhone);
          
          // STATE: Awaiting Location
          if (session && session.state === 'awaiting_location' && session.pendingIssueId) {
            const pendingIssue = db.issues.find(i => i.id === session!.pendingIssueId);
            
            if (pendingIssue) {
              // The user replied with their location!
              pendingIssue.location = extractLocation(textBody) || textBody.substring(0, 50); // Fallback to raw text if NLP fails
              
              // Update the cluster location too if it's the only issue
              const cluster = db.clusters.find(c => c.id === pendingIssue.clusterId);
              if (cluster && cluster.reportCount === 1) {
                cluster.location = pendingIssue.location;
              }

              // Clear session
              db.sessions = db.sessions.filter(s => s.phoneId !== fromPhone);
              saveDb(db);

              await sendWhatsAppMessage(fromPhone, `Got it! We have updated your ticket (${pendingIssue.id}) with location: ${pendingIssue.location}. Your issue is fully logged.`);
              return new NextResponse('OK', { status: 200 });
            }
          }

          // STATE: New Request
          const newIssue: Issue = {
            id: `ISS-WA-${Date.now()}`,
            description: textBody,
            category: 'Auto',
            location: 'WhatsApp Reported', // Triggers extraction inside processNewIssue
            urgency: 0,
            status: 'New',
            contact: senderName,
            createdAt: new Date().toISOString()
          };

          const { updatedIssues, updatedClusters } = await processNewIssue(newIssue, db.issues, db.clusters);
          db.issues = updatedIssues;
          db.clusters = updatedClusters;
          
          const savedIssue = db.issues.find(i => i.id === newIssue.id);

          // Did NLP fail to find a location?
          if (savedIssue?.location === 'Location Pending') {
            // Save state
            if (session) {
              session.state = 'awaiting_location';
              session.pendingIssueId = savedIssue.id;
              session.lastInteraction = new Date().toISOString();
            } else {
              db.sessions.push({
                phoneId: fromPhone,
                state: 'awaiting_location',
                pendingIssueId: savedIssue.id,
                lastInteraction: new Date().toISOString()
              });
            }
            saveDb(db);

            const promptText = `We've categorized your issue under ${savedIssue.category} (${savedIssue.subCategory}).\n\nTo help us route it to the right team, could you please reply with your specific location on campus? (e.g., Hostel B, Main Cafeteria)`;
            await sendWhatsAppMessage(fromPhone, promptText);
            return new NextResponse('OK', { status: 200 });
          }

          // Complete with location
          saveDb(db);
          const replyText = `Thanks for reporting this to DAU Pulse.\n\nTicket ID: ${savedIssue?.id}\nCategory: ${savedIssue?.category} (${savedIssue?.subCategory})\nLocation: ${savedIssue?.location}\nUrgency: ${savedIssue?.urgency}/5\n\nWe have logged this issue for campus administrators.`;
          await sendWhatsAppMessage(fromPhone, replyText);
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
