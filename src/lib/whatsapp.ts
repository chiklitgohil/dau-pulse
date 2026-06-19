// WhatsApp Cloud API utility

export async function sendWhatsAppMessage(toPhone: string, messageText: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn('[WhatsApp Mock] Missing environment variables. Simulating message send:');
    console.warn(`[WhatsApp Mock] To: ${toPhone} | Message: ${messageText}`);
    return { success: true, simulated: true };
  }

  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: {
          body: messageText
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('WhatsApp API Error:', data);
      throw new Error(`WhatsApp API error: ${data.error?.message || 'Unknown error'}`);
    }

    return { success: true, data, simulated: false };
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    throw error;
  }
}
