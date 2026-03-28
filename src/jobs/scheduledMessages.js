import cron from 'node-cron';
import { Message } from '../models/Message.js';
import { Chat } from '../models/Chat.js';
import { getIO } from '../socket/index.js';
import { decryptForChat } from '../utils/encryption.js';

export function scheduleScheduledMessagesJob() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
      const pendingMessages = await Message.find({
        isScheduled: true,
        scheduledFor: { $lte: now },
      }).populate('chat').populate('sender', 'name comradeId');

      if (!pendingMessages.length) return;

      const io = getIO();

      for (const msg of pendingMessages) {
        try {
          msg.isScheduled = false;
          await msg.save();

          const chat = await Chat.findById(msg.chat._id);
          if (chat) {
            let content = null;
            if (msg.type === 'text' && msg.encryptedContent) {
              try {
                content = decryptForChat(chat, msg.encryptedContent);
              } catch (e) {
                content = '[Encrypted]';
              }
            }

            chat.lastMessageAt = msg.createdAt;
            chat.lastMessagePreview = msg.type === 'text' ? (content || '') : `[${msg.type}]`;
            await chat.save();

            if (io) {
              io.to(`chat:${chat.chatId}`).emit('chat:new_message', {
                chatId: chat.chatId,
                message: {
                  id: msg._id,
                  sender: msg.sender,
                  type: msg.type,
                  content,
                  mediaUrl: msg.mediaUrl,
                  mediaType: msg.mediaType,
                  fileName: msg.fileName,
                  fileSize: msg.fileSize,
                  isSaved: msg.isSaved,
                  expiresAt: msg.expiresAt,
                  isDeleted: msg.isDeleted,
                  reactions: msg.reactions,
                  readBy: msg.readBy,
                  createdAt: msg.createdAt,
                  pollData: msg.pollData,
                  gameData: msg.gameData,
                  isSurprise: msg.isSurprise,
                  unlockAt: msg.unlockAt,
                },
              });
            }
          }
        } catch (err) {
          console.error('Error processing scheduled message:', err);
        }
      }
    } catch (err) {
      console.error('Error in scheduled messages job:', err);
    }
  });
}
