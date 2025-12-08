import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { initSocket } from './socket/index.js';
import { connectDb } from './config/db.js';
import { scheduleMediaCleanupJob } from './jobs/mediaCleanup.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDb();

  // Validate email configuration
  try {
    console.log('Validating email configuration...');
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      console.log('RESEND_API_KEY found - email service ready');
    } else {
      console.log('RESEND_API_KEY not found, checking SMTP fallback...');
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
      if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
        console.log('SMTP configuration found - email service ready');
      } else {
        console.warn('Neither RESEND_API_KEY nor SMTP configuration found');
        console.warn('Email features will not be available');
      }
    }
  } catch (emailError) {
    console.warn('Email configuration validation failed:', emailError.message);
    console.warn('Email features will not be available until properly configured');
  }

  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL?.split(',') || '*',
      credentials: true,
    },
  });

  initSocket(io);

  scheduleMediaCleanupJob();

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Comrade backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});
