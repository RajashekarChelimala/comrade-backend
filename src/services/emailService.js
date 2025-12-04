import nodemailer from 'nodemailer';

let transporter;

export function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP configuration is missing');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

export async function sendVerificationEmail(to, code) {
  const transport = getTransporter();
  const appName = 'Comrade';

  const message = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `${appName} - Email Verification Code`,
    text: `Your ${appName} verification code is: ${code}. It will expire in 10 minutes.`,
  };

  await transport.sendMail(message);
}
