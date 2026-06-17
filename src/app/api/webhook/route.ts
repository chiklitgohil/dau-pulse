import { NextResponse } from 'next/server';
import { getDb, saveDb, Issue } from '@/lib/store';
import { processNewIssue } from '@/lib/ai';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

// The token you configure in Meta Developer Portal for webhook verification
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'dau_pulse_secret_token';

// GET: Meta Webhook Verification
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully!');
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST: Receive messages from WhatsApp
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check if it's a WhatsApp status update or a message
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      // If there is a message
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const contactInfo = value.contacts?.[0];
        
        // We only process text messages for the MVP
        if (message.type === 'text') {
          const fromPhone = message.from; // Sender's phone number
          const textBody = message.text.body; // The actual message text
          const senderName = contactInfo?.profile?.name || fromPhone;

          console.log(`[WhatsApp] Received message from ${senderName} (${fromPhone}): ${textBody}`);

          // Create the issue in our DB
          const db = getDb();
          const newIssue: Issue = {
            id: `ISS-WA-${Date.now()}`,
            description: textBody,
            category: 'Auto', // Let AI classify
            location: 'WhatsApp Reported',
            urgency: 0,
            status: 'New',
            contact: senderName,
            createdAt: new Date().toISOString()
          };

          const { updatedIssues, updatedClusters } = await processNewIssue(newIssue, db.issues, db.clusters);
          db.issues = updatedIssues;
          db.clusters = updatedClusters;
          saveDb(db);

          // Find the generated issue to see what category/urgency the AI assigned
          const savedIssue = db.issues.find(i => i.id === newIssue.id);

          // Send confirmation back via WhatsApp
          const replyText = `Thanks for reporting this to DAU Pulse.\n\nTicket ID: ${savedIssue?.id}\nCategory: ${savedIssue?.category}\nUrgency: ${savedIssue?.urgency}/5\n\nWe have logged this issue for campus administrators.`;
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
