const test = async () => {
  try {
    const r = await fetch('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '55555',
                type: 'text',
                text: {body: 'food is bad'}
              }]
            }
          }]
        }]
      })
    });
    const text = await r.text();
    console.log(r.status, text);
  } catch (e) {
    console.error(e);
  }
};
test();
