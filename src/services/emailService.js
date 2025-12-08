import nodemailer from 'nodemailer';

let transporter;

export function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  
  console.log('Checking SMTP configuration...');
  console.log('SMTP_HOST:', SMTP_HOST ? 'SET' : 'NOT SET');
  console.log('SMTP_PORT:', SMTP_PORT ? 'SET' : 'NOT SET');
  console.log('SMTP_USER:', SMTP_USER ? 'SET' : 'NOT SET');
  console.log('SMTP_PASS:', SMTP_PASS ? 'SET' : 'NOT SET');
  
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    const error = new Error('SMTP configuration is missing');
    console.error('Missing SMTP config:', {
      SMTP_HOST: !!SMTP_HOST,
      SMTP_PORT: !!SMTP_PORT,
      SMTP_USER: !!SMTP_USER,
      SMTP_PASS: !!SMTP_PASS
    });
    throw error;
  }

  console.log('Creating SMTP transporter for host:', SMTP_HOST);
  
  transporter = nodemailer.createTransport({
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

  // Verify connection configuration
  transporter.verify((error, success) => {
    if (error) {
      console.error('SMTP connection verification failed:', error);
    } else {
      console.log('SMTP server is ready to take our messages');
    }
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

  try {
    console.log('Attempting to send verification email to:', to);
    console.log('Using SMTP host:', process.env.SMTP_HOST, 'port:', process.env.SMTP_PORT);
    
    const result = await transport.sendMail(message);
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Failed to send verification email:', {
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
