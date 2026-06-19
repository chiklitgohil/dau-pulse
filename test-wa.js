// Removed dotenv
async function sendWhatsAppMessage(toPhone, messageText) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

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
    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
  }
}

sendWhatsAppMessage('918799617271', 'Hello from test script!');
