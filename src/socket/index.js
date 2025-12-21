import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

let ioInstance = null;

export function initSocket(io) {
  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication token required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.user = { id: payload.sub };
      return next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user?.id;
    // eslint-disable-next-line no-console
    console.log('Socket connected', userId);

    if (userId) {
      try {
        await User.findByIdAndUpdate(userId, { isOnline: true });
        // Optionally emit to friends/global that user is online
      } catch (error) {
        console.error('Error updating online status (connect):', error);
      }
    }

    socket.on('join_chat', async (chatId) => {
      if (!chatId) return;
      socket.join(`chat:${chatId}`);

      // Notify others in room
      socket.to(`chat:${chatId}`).emit('chat:user_joined', { userId: socket.user.id });

      // Get all sockets in this room to send current participants to the joiner
      const sockets = await io.in(`chat:${chatId}`).fetchSockets();
      const activeUserIds = sockets.map(s => s.user?.id).filter(Boolean);

      // Send active users list to the user who just joined
      socket.emit('chat:active_users', { userIds: activeUserIds });
    });

    socket.on('leave_chat', (chatId) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
      socket.to(`chat:${chatId}`).emit('chat:user_left', { userId: socket.user.id });
    });

    socket.on('disconnect', async () => {
      // eslint-disable-next-line no-console
      console.log('Socket disconnected', userId);

      if (userId) {
        try {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeenAt: new Date()
          });
        } catch (error) {
          console.error('Error updating online status (disconnect):', error);
        }
      }
    });
  });
}

export function getIO() {
  return ioInstance;
}
