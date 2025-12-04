import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { encryptForChat, decryptForChat } from '../utils/encryption.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import { getIO } from '../socket/index.js';

async function isBlockedBetween(userId, otherId) {
  const [me, other] = await Promise.all([
    User.findById(userId).select('blockedUsers'),
    User.findById(otherId).select('blockedUsers'),
  ]);
  if (!me || !other) return true;
  const meBlocked = me.blockedUsers.some((id) => id.toString() === otherId.toString());
  const otherBlocked = other.blockedUsers.some((id) => id.toString() === userId.toString());
  return meBlocked || otherBlocked;
}

export async function listChats(req, res) {
  const userId = req.user.id;
  const chats = await Chat.find({ participants: userId })
    .sort({ lastMessageAt: -1 })
    .select('chatId participants lastMessageAt lastMessagePreview')
    .populate('participants', 'name comradeHandle comradeId');

  return res.json({ chats });
}

export async function getChat(req, res) {
  const { chatId } = req.params;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, participants: userId })
    .populate('participants', 'name comradeHandle comradeId');

  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  return res.json({ chat });
}

export async function getMessages(req, res) {
  const { chatId } = req.params;
  const { before, limit = 30 } = req.query;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, participants: userId });
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  const match = { chat: chat._id };
  if (before) {
    match.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(match)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('sender', 'name comradeHandle comradeId')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name comradeHandle comradeId' } });

  const result = messages
    .map((m) => {
      let content = null;
      if (m.encryptedContent && !m.isDeleted) {
        try {
          const decrypted = decryptForChat(chat, m.encryptedContent);
          content = decrypted;
        } catch (e) {
          content = null;
        }
      }

      let replyPreview = null;
      if (m.replyTo) {
        let replyContent = null;
        if (m.replyTo.encryptedContent && !m.replyTo.isDeleted) {
          try {
            const decryptedReply = decryptForChat(chat, m.replyTo.encryptedContent);
            replyContent = decryptedReply;
          } catch (e) {
            replyContent = null;
          }
        }

        replyPreview = {
          id: m.replyTo._id,
          sender: m.replyTo.sender,
          type: m.replyTo.type,
          content: m.replyTo.type === 'text' ? replyContent : null,
          mediaType: m.replyTo.mediaType,
        };
      }

      return {
        id: m._id,
        chatId: chat.chatId,
        sender: m.sender,
        type: m.type,
        content,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        isSaved: m.isSaved,
        expiresAt: m.expiresAt,
        isDeleted: m.isDeleted,
        reactions: m.reactions,
        createdAt: m.createdAt,
        replyTo: replyPreview,
      };
    })
    .reverse();

  return res.json({ messages: result });
}

export async function sendMessage(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_CHAT) {
    return res.status(403).json({ message: 'Chatting is temporarily disabled' });
  }

  const { chatId } = req.params;
  const userId = req.user.id;
  const { type, text, mediaUrl, mediaType, mediaPublicId, replyTo } = req.body;

  const chat = await Chat.findOne({ chatId, participants: userId });
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  const otherId = chat.participants.find((id) => id.toString() !== userId);
  const blocked = await isBlockedBetween(userId, otherId);
  if (blocked) {
    return res.status(403).json({ message: 'You cannot message this user' });
  }

  if (type === 'text' && !text) {
    return res.status(400).json({ message: 'Text is required for text messages' });
  }

  let encryptedContent = null;
  if (type === 'text') {
    encryptedContent = encryptForChat(chat, text);
  }

  let expiresAt = null;
  if (type === 'media' && mediaUrl) {
    const ttlHours = 24;
    expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  }

  // Optional reply target
  let replyToDoc = null;
  if (replyTo) {
    replyToDoc = await Message.findById(replyTo).populate('sender', 'name comradeHandle comradeId');
    if (!replyToDoc || replyToDoc.chat.toString() !== chat._id.toString()) {
      replyToDoc = null;
    }
  }

  const message = await Message.create({
    chat: chat._id,
    sender: userId,
    type,
    encryptedContent,
    mediaUrl,
    mediaType,
    mediaPublicId,
    expiresAt,
    replyTo: replyToDoc ? replyToDoc._id : undefined,
  });

  chat.lastMessageAt = message.createdAt;
  chat.lastMessagePreview = type === 'text' ? (text || '') : '[media]';
  await chat.save();

  const populated = await message.populate([
    { path: 'sender', select: 'name comradeHandle comradeId' },
    { path: 'replyTo', populate: { path: 'sender', select: 'name comradeHandle comradeId' } },
  ]);

  let replyPreview = null;
  if (populated.replyTo) {
    let replyContent = null;
    if (populated.replyTo.encryptedContent && !populated.replyTo.isDeleted) {
      try {
        const decryptedReply = decryptForChat(chat, populated.replyTo.encryptedContent);
        replyContent = decryptedReply;
      } catch (e) {
        replyContent = null;
      }
    }

    replyPreview = {
      id: populated.replyTo._id,
      sender: populated.replyTo.sender,
      type: populated.replyTo.type,
      content: populated.replyTo.type === 'text' ? replyContent : null,
      mediaType: populated.replyTo.mediaType,
    };
  }
  const io = getIO();
  if (io) {
    io.to(`chat:${chat.chatId}`).emit('chat:new_message', {
      chatId: chat.chatId,
      message: {
        id: populated._id,
        sender: populated.sender,
        type: populated.type,
        content: type === 'text' ? text : null,
        mediaUrl: populated.mediaUrl,
        mediaType: populated.mediaType,
        isSaved: populated.isSaved,
        expiresAt: populated.expiresAt,
        isDeleted: populated.isDeleted,
        reactions: populated.reactions,
        createdAt: populated.createdAt,
        replyTo: replyPreview,
      },
    });
  }

  return res.status(201).json({
    message: {
      id: populated._id,
      sender: populated.sender,
      type: populated.type,
      content: type === 'text' ? text : null,
      mediaUrl: populated.mediaUrl,
      mediaType: populated.mediaType,
      isSaved: populated.isSaved,
      expiresAt: populated.expiresAt,
      isDeleted: populated.isDeleted,
      reactions: populated.reactions,
      createdAt: populated.createdAt,
      replyTo: replyPreview,
    },
  });
}

export async function reactToMessage(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_REACTIONS) {
    return res.status(403).json({ message: 'Reactions are temporarily disabled' });
  }

  const { messageId } = req.params;
  const { type } = req.body;
  const userId = req.user.id;

  if (!type) {
    return res.status(400).json({ message: 'Reaction type is required' });
  }

  const message = await Message.findById(messageId).populate('chat');
  if (!message) {
    return res.status(404).json({ message: 'Message not found' });
  }

  const isParticipant = message.chat.participants.some((id) => id.toString() === userId);
  if (!isParticipant) {
    return res.status(403).json({ message: 'Not allowed' });
  }

  const existing = message.reactions.find((r) => r.user.toString() === userId);
  if (existing) {
    existing.type = type;
    existing.reactedAt = new Date();
  } else {
    message.reactions.push({ user: userId, type });
  }

  await message.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${message.chat.chatId}`).emit('chat:message_updated', {
      messageId: message._id,
      reactions: message.reactions,
    });
  }

  return res.json({ message: 'Reaction updated', reactions: message.reactions });
}

export async function removeReaction(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_REACTIONS) {
    return res.status(403).json({ message: 'Reactions are temporarily disabled' });
  }

  const { messageId } = req.params;
  const userId = req.user.id;

  const message = await Message.findById(messageId).populate('chat');
  if (!message) {
    return res.status(404).json({ message: 'Message not found' });
  }

  const isParticipant = message.chat.participants.some((id) => id.toString() === userId);
  if (!isParticipant) {
    return res.status(403).json({ message: 'Not allowed' });
  }

  message.reactions = message.reactions.filter((r) => r.user.toString() !== userId);
  await message.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${message.chat.chatId}`).emit('chat:message_updated', {
      messageId: message._id,
      reactions: message.reactions,
    });
  }

  return res.json({ message: 'Reaction removed', reactions: message.reactions });
}

export async function saveMedia(req, res) {
  const { messageId } = req.params;
  const userId = req.user.id;

  const message = await Message.findById(messageId).populate('chat');
  if (!message) {
    return res.status(404).json({ message: 'Message not found' });
  }

  const isParticipant = message.chat.participants.some((id) => id.toString() === userId);
  if (!isParticipant) {
    return res.status(403).json({ message: 'Not allowed' });
  }

  if (message.type !== 'media') {
    return res.status(400).json({ message: 'Not a media message' });
  }

  message.isSaved = true;
  message.expiresAt = null;
  await message.save();

  return res.json({ message: 'Media saved' });
}
