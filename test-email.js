import dotenv from 'dotenv';
import { sendVerificationEmail } from './src/services/emailService.js';

dotenv.config();

async function testEmail() {
  try {
    console.log('Testing email configuration...');
    console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
    console.log('RESEND_FROM_EMAIL:', process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev (default)');
    console.log('SMTP_HOST:', process.env.SMTP_HOST ? 'SET' : 'NOT SET');
    console.log('SMTP_PORT:', process.env.SMTP_PORT ? 'SET' : 'NOT SET');
    console.log('SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET');
    console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
    
    const testEmail = process.env.TEST_EMAIL || 'rajashekarchelimela1@gmail.com';
    const testCode = '123456';
    
    console.log(`\nSending test email to: ${testEmail}`);
    console.log('Test code:', testCode);
    console.log('---');
    
    const result = await sendVerificationEmail(testEmail, testCode);
    console.log('✅ Test email sent successfully!');
    console.log('Result:', result);
  } catch (error) {
    console.error('❌ Test email failed:', error.message);
    console.error('Full error:', error);
  }
}

testEmail();
