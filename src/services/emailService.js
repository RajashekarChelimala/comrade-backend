// Email service using Nodemailer (SMTP)
// Optimized for Gmail (App Password required)

import nodemailer from 'nodemailer';

function getSMTPTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error('Missing SMTP configuration. Please check your .env file.');
    throw new Error('Missing SMTP configuration');
  }

  // Create transporter

  // Create transporter
  // Note: For port 465, secure: true. For 587, secure: false.
  const isSecure = Number(SMTP_PORT) === 465;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: isSecure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    debug: process.env.NODE_ENV !== 'production', // Help debug in dev
    logger: process.env.NODE_ENV !== 'production'
  });

  return transporter;
}

export async function sendVerificationEmail(to, code) {
  const appName = 'Comrade';

  console.log(`Preparing to send verification email to: ${to}`);

  try {
    const transporter = getSMTPTransporter();

    // Verify connection configuration first
    try {
      await transporter.verify();
      console.log('SMTP connection verified successfully.');
    } catch (verifyError) {
      console.error('SMTP Connection Verification Failed:', verifyError.message);
      // We throw here because if we can't connect, we can't send.
      // This helps identify Render blocking issues immediately.
      throw new Error(`SMTP Connection Failed: ${verifyError.message}`);
    }

    const message = {
      from: `"${appName}" <${process.env.SMTP_USER}>`,
      to,
      subject: `${appName} - Email Verification Code`,
      text: `Your ${appName} verification code is: ${code}. It will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${appName} - Email Verification</h2>
          <p>Your verification code is:</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #000;">${code}</span>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">This email was sent by ${appName} verification system.</p>
        </div>
      `,
    };

    const result = await transporter.sendMail(message);
    console.log('Email sent successfully:', result.messageId);
    return result;

  } catch (error) {
    console.error('Failed to send verification email:', {
      to,
      error: error.message,
      code: error.code,
      command: error.command
    });

    // Provide a helpful hint for Render users
    if (error.source === 'timeout' || error.code === 'ETIMEDOUT' || error.message.includes('Connection timeout')) {
      console.warn('!!! WARNING !!!: Connection timed out. If you are hosting on Render Free Tier, OUTBOUND SMTP (ports 25, 465, 587) IS BLOCKED.');
      console.warn('Recommendation: Move backend to Railway or Fly.io, OR upgrade Render plan.');
    }

    throw error;
  }
}
