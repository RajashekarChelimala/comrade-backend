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
