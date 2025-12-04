import jwt from 'jsonwebtoken';

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

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('Socket connected', socket.user?.id);

    socket.on('join_chat', (chatId) => {
      if (!chatId) return;
      socket.join(`chat:${chatId}`);
    });

    socket.on('leave_chat', (chatId) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
    });

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('Socket disconnected', socket.user?.id);
    });
  });
}

export function getIO() {
  return ioInstance;
}
