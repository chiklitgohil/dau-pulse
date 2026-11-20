import type { EmailTransport } from '@/core/notify';
import { env } from './env';

let transport: EmailTransport | undefined;

export function getEmailTransport(): EmailTransport {
  if (transport) return transport;
  const e = env();
  if (e.EMAIL_TRANSPORT === 'smtp') {
    if (!e.SMTP_URL) throw new Error('EMAIL_TRANSPORT=smtp needs SMTP_URL');
    let mailer: import('nodemailer').Transporter | undefined;
    transport = {
      async send(msg) {
        if (!mailer) {
          const nodemailer = await import('nodemailer');
          mailer = nodemailer.createTransport(e.SMTP_URL);
        }
        await mailer.sendMail({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.body });
      },
    };
  } else {
    transport = {
      async send(msg) {
        console.info(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.body}\n`);
      },
    };
  }
  return transport;
}
