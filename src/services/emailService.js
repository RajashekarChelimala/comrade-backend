import { Resend } from 'resend';

let resend;

function getResendClient() {
  if (resend) return resend;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  console.log('Checking email configuration...');
  console.log('RESEND_API_KEY:', RESEND_API_KEY ? 'SET' : 'NOT SET');
  
  if (!RESEND_API_KEY) {
    const error = new Error('RESEND_API_KEY is missing. Please add it to your environment variables.');
    console.error('Missing RESEND_API_KEY');
    throw error;
  }

  console.log('Creating Resend client...');
  resend = new Resend(RESEND_API_KEY);
  return resend;
}

// Keep SMTP for local development fallback
function getSMTPTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  
  console.log('Checking SMTP configuration...');
  console.log('SMTP_HOST:', SMTP_HOST ? 'SET' : 'NOT SET');
  console.log('SMTP_PORT:', SMTP_PORT ? 'SET' : 'NOT SET');
  console.log('SMTP_USER:', SMTP_USER ? 'SET' : 'NOT SET');
  console.log('SMTP_PASS:', SMTP_PASS ? 'SET' : 'NOT SET');
  
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    const error = new Error('Both RESEND_API_KEY and SMTP configuration are missing');
    console.error('Missing email config:', {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      SMTP_HOST: !!SMTP_HOST,
      SMTP_PORT: !!SMTP_PORT,
      SMTP_USER: !!SMTP_USER,
      SMTP_PASS: !!SMTP_PASS
    });
    throw error;
  }

  console.log('Creating SMTP transporter for host:', SMTP_HOST);
  
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    debug: process.env.NODE_ENV !== 'production',
    logger: process.env.NODE_ENV !== 'production'
  });

  return transporter;
}

export async function sendVerificationEmail(to, code) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const appName = 'Comrade';

  // Use Resend API if available, otherwise fallback to SMTP
  if (RESEND_API_KEY) {
    try {
      console.log('Attempting to send verification email via Resend API to:', to);
      
      const resend = getResendClient();
      const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev', // Use Resend's verified domain
        to: [to],
        subject: `${appName} - Email Verification Code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${appName} - Email Verification</h2>
            <p>Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${code}</span>
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">This email was sent by ${appName} verification system.</p>
          </div>
        `,
      });

      if (error) {
        console.error('Resend API error:', error);
        throw new Error(`Resend API error: ${error.message}`);
      }

      console.log('Email sent successfully via Resend:', data);
      return data;
    } catch (error) {
      console.error('Failed to send verification email via Resend:', {
        to,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  } else {
    // Fallback to SMTP
    try {
      console.log('RESEND_API_KEY not found, using SMTP fallback to:', to);
      console.log('Using SMTP host:', process.env.SMTP_HOST, 'port:', process.env.SMTP_PORT);
      
      const transport = getSMTPTransporter();
      const message = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: `${appName} - Email Verification Code`,
        text: `Your ${appName} verification code is: ${code}. It will expire in 10 minutes.`,
      };

      const result = await transport.sendMail(message);
      console.log('Email sent successfully via SMTP:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send verification email via SMTP:', {
        to,
        error: error.message,
        stack: error.stack,
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpUser: process.env.SMTP_USER
      });
      throw error;
    }
  }
}
