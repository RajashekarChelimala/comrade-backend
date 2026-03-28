import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import app from './app.js';
import { initSocket } from './socket/index.js';
import { connectDb } from './config/db.js';
import { scheduleMediaCleanupJob } from './jobs/mediaCleanup.js';
import { scheduleScheduledMessagesJob } from './jobs/scheduledMessages.js';

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDb();

  // Validate email configuration
  try {
    console.log('Validating email configuration...');
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
      console.log('SMTP configuration found - email service ready');
    } else {
      console.warn('SMTP configuration not found');
      console.warn('Email features will not be available');
    }
  } catch (emailError) {
    console.warn('Email configuration validation failed:', emailError.message);
    console.warn('Email features will not be available until properly configured');
  }

  // Admin Seeding
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPass) {
    try {
      // Dynamic import not strictly necessary if potential circular dep is not an issue, 
      // but keeping it as per previous pattern or just importing User at top if possible.
      // Top level import is safer for standard models.
      const { User } = await import('./models/User.js');
      const adminUser = await User.findOne({ email: adminEmail });

      if (!adminUser) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(adminPass, salt);

        await User.create({
          name: 'Admin',
          email: adminEmail,
          passwordHash,
          role: 'admin',
          comradeId: 'admin',
          emailVerified: true, // Fixed field name
          status: 'active',
          settings: {
            isSearchable: true,
            searchableByEmail: true,
            showLastSeen: true
          }
        });
        console.log(`Admin user created: ${adminEmail}`);
      } else {
        let updated = false;
        if (adminUser.role !== 'admin') {
          adminUser.role = 'admin';
          updated = true;
        }
        if (!adminUser.emailVerified) {
          adminUser.emailVerified = true;
          updated = true;
        }

        if (updated) {
          await adminUser.save();
          console.log(`User ${adminEmail} updated (Promoted/Verified)`);
        }
      }
    } catch (err) {
      console.error('Failed to seed admin user:', err);
    }
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
  scheduleScheduledMessagesJob();

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
