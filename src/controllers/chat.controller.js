import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { Memory } from '../models/Memory.js';
import { Task } from '../models/Task.js';
import { encryptForChat, decryptForChat } from '../utils/encryption.js';
import { generateChatKey } from '../utils/encryption.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import { getIO } from '../socket/index.js';
import { v4 as uuidv4 } from 'uuid';

export async function createChat(req, res) {
  const { recipientId } = req.body;
  const userId = req.user.id;

  if (!recipientId) return res.status(400).json({ message: 'Recipient ID required' });

  // Check if chat exists
  let chat = await Chat.findOne({
    isGroup: false,
    'participants.user': { $all: [userId, recipientId] },
    participants: { $size: 2 }
  });

  if (!chat) {
    const encryption = generateChatKey();
    chat = await Chat.create({
      chatId: uuidv4(),
      participants: [
        { user: userId, role: 'admin' },
        { user: recipientId, role: 'admin' },
      ],
      isGroup: false,
      createdBy: userId,
      encryption,
    });
  }

  // Ensure fully populated
  await chat.populate('participants.user', 'name comradeId isOnline lastSeenAt mood customStatus');

  return res.json({ chat });
}

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
  const chats = await Chat.find({ 'participants.user': userId })
    .sort({ lastMessageAt: -1 })
    .select('chatId participants lastMessageAt lastMessagePreview isGroup name avatar settings')
    .populate('participants.user', 'name comradeId isOnline lastSeenAt mood');

  const chatsWithCounts = await Promise.all(chats.map(async (chat) => {
    const unreadCount = await Message.countDocuments({
      chat: chat._id,
      sender: { $ne: userId },
      'readBy.user': { $ne: userId },
      isScheduled: { $ne: true }
    });
    return { ...chat.toObject(), unreadCount };
  }));

  return res.json({ chats: chatsWithCounts });
}

export async function getChat(req, res) {
  const { chatId } = req.params;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId })
    .populate('participants.user', 'name comradeId isOnline lastSeenAt mood customStatus')
    .populate({
      path: 'pinnedMessages',
      populate: { path: 'sender', select: 'name comradeId' }
    });

  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  // Add counts for badges
  const [memoryCount, pendingTaskCount] = await Promise.all([
    Memory.countDocuments({ chat: chat._id }),
    Task.countDocuments({ chat: chat._id, status: { $ne: 'done' } })
  ]);

  return res.json({ 
    chat: { 
      ...chat.toObject(), 
      memoryCount, 
      pendingTaskCount 
    } 
  });
}

export async function getMessages(req, res) {
  const { chatId } = req.params;
  const { before, limit = 30, aroundMessageId } = req.query;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  let match = { chat: chat._id };

  if (aroundMessageId) {
    // Jump to context mode
    const target = await Message.findById(aroundMessageId);
    if (!target) return res.status(404).json({ message: 'Target message not found' });

    // Fetch messages BEFORE the target (including target)
    const beforeMsgs = await Message.find({
      chat: chat._id,
      createdAt: { $lte: target.createdAt },
      $or: [{ isScheduled: { $ne: true } }, { sender: userId }]
    }).sort({ createdAt: -1 }).limit(15);

    // Fetch messages AFTER the target
    const afterMsgs = await Message.find({
      chat: chat._id,
      createdAt: { $gt: target.createdAt },
      $or: [{ isScheduled: { $ne: true } }, { sender: userId }]
    }).sort({ createdAt: 1 }).limit(15);

    const messages = [...afterMsgs, ...beforeMsgs].sort((a, b) => a.createdAt - b.createdAt);
    
    const result = transformMessages(messages, chat, userId);
    return res.json({ messages: result, isContextLoaded: true });
  }

  // Normal pagination mode
  match = { 
    chat: chat._id,
    $or: [
      { isScheduled: { $ne: true } },
      { sender: userId }
    ]
  };
  if (before) {
    match.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(match)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('sender', 'name comradeId')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name comradeId' } });

  const result = transformMessages(messages, chat, userId);
  return res.json({ messages: result.reverse() });
}

function transformMessages(messages, chat, userId) {
  return messages.map((m) => {
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
      // Ensure replyTo is an object with sender before trying to build preview
      const replyData = m.replyTo;
      let replyContent = null;
      if (replyData.encryptedContent && !replyData.isDeleted) {
        try {
          const decryptedReply = decryptForChat(chat, replyData.encryptedContent);
          replyContent = decryptedReply;
        } catch (e) {
          replyContent = null;
        }
      }

      replyPreview = {
        id: replyData._id,
        sender: replyData.sender,
        type: replyData.type,
        content: replyData.type === 'text' ? replyContent : null,
        mediaType: replyData.mediaType,
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
      fileName: m.fileName,
      fileSize: m.fileSize,
      isSaved: m.isSaved,
      expiresAt: m.expiresAt,
      isDeleted: m.isDeleted,
      reactions: m.reactions,
      readBy: m.readBy,
      createdAt: m.createdAt,
      replyTo: replyPreview,
      pollData: m.pollData,
      gameData: m.gameData,
      isScheduled: m.isScheduled,
      scheduledFor: m.scheduledFor,
      isSurprise: m.isSurprise,
      unlockAt: m.unlockAt,
      editHistory: m.editHistory,
    };
  });
}

export async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    if (!messageId) return res.status(400).json({ message: 'Message ID required' });

    const message = await Message.findById(messageId).populate('chat');
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const isSender = message.sender.toString() === userId;
    if (!isSender) return res.status(403).json({ message: 'Only sender can delete their message' });

    message.isDeleted = true;
    message.encryptedContent = ''; 
    message.mediaUrl = null;
    message.pollData = null;
    message.gameData = null;
    await message.save();

    const io = getIO();
    if (io) {
      const chatID = message.chat?.chatId;
      if (chatID) {
        io.to(`chat:${chatID}`).emit('chat:message_updated', {
          messageId: message._id,
          isDeleted: true
        });
      }
    }

    return res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error('Delete Message Error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

export async function sendMessage(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_CHAT) {
    return res.status(403).json({ message: 'Chatting is temporarily disabled' });
  }

  const { chatId } = req.params;
  const userId = req.user.id;
  const {
    type, text, mediaUrl, mediaType, mediaPublicId, fileName, fileSize,
    replyTo, tempId, pollData, gameData, isScheduled, scheduledFor,
    isSurprise, unlockAt
  } = req.body;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  if (!chat.isGroup) {
    const otherId = chat.participants.find((p) => p.user.toString() !== userId)?.user;
    if (otherId) {
      const blocked = await isBlockedBetween(userId, otherId);
      if (blocked) {
        return res.status(403).json({ message: 'You cannot message this user' });
      }
    }
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
    replyToDoc = await Message.findById(replyTo).populate('sender', 'name comradeId');
    if (!replyToDoc || replyToDoc.chat.toString() !== chat._id.toString()) {
      replyToDoc = null;
    }
  }

  const messageData = {
    chat: chat._id,
    sender: userId,
    type,
    encryptedContent,
    mediaUrl,
    mediaType,
    mediaPublicId,
    fileName,
    fileSize,
    expiresAt,
    replyTo: replyToDoc ? replyToDoc._id : undefined,
    pollData,
    gameData,
    isScheduled,
    scheduledFor,
    isSurprise,
    unlockAt,
  };

  const message = await Message.create(messageData);

  if (!isScheduled) {
    chat.lastMessageAt = message.createdAt;
    chat.lastMessagePreview = type === 'text' ? (text || '') : `[${type}]`;
    await chat.save();
  }

  const populated = await message.populate([
    { path: 'sender', select: 'name comradeId' },
    { path: 'replyTo', populate: { path: 'sender', select: 'name comradeId' } },
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
  if (io && !isScheduled) {
    io.to(`chat:${chat.chatId}`).emit('chat:new_message', {
      chatId: chat.chatId,
      tempId,
      message: {
        id: populated._id,
        tempId,
        sender: populated.sender,
        type: populated.type,
        content: type === 'text' ? text : null,
        mediaUrl: populated.mediaUrl,
        mediaType: populated.mediaType,
        fileName: populated.fileName,
        fileSize: populated.fileSize,
        isSaved: populated.isSaved,
        expiresAt: populated.expiresAt,
        isDeleted: populated.isDeleted,
        reactions: populated.reactions,
        readBy: populated.readBy,
        createdAt: populated.createdAt,
        replyTo: replyPreview,
        pollData: populated.pollData,
        gameData: populated.gameData,
        isSurprise: populated.isSurprise,
        unlockAt: populated.unlockAt,
      },
    });
  }

  return res.status(201).json({
    message: {
      id: populated._id,
      tempId,
      sender: populated.sender,
      type: populated.type,
      content: type === 'text' ? text : null,
      mediaUrl: populated.mediaUrl,
      mediaType: populated.mediaType,
      fileName: populated.fileName,
      fileSize: populated.fileSize,
      isSaved: populated.isSaved,
      expiresAt: populated.expiresAt,
      isDeleted: populated.isDeleted,
      reactions: populated.reactions,
      readBy: populated.readBy,
      createdAt: populated.createdAt,
      replyTo: replyPreview,
      pollData: populated.pollData,
      gameData: populated.gameData,
      isScheduled: populated.isScheduled,
      scheduledFor: populated.scheduledFor,
      isSurprise: populated.isSurprise,
      unlockAt: populated.unlockAt,
    },
  });
}

export async function markChatAsRead(req, res) {
  const { chatId } = req.params;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  // Find unread messages from others
  const unreadMessages = await Message.find({
    chat: chat._id,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId }
  });

  if (unreadMessages.length === 0) {
    return res.json({ message: 'No unread messages', count: 0 });
  }

  const unreadIds = unreadMessages.map(m => m._id);

  await Message.updateMany(
    { _id: { $in: unreadIds } },
    { $push: { readBy: { user: userId, readAt: new Date() } } }
  );

  const io = getIO();
  if (io) {
    io.to(`chat:${chat.chatId}`).emit('chat:messages_read', {
      chatId: chat.chatId,
      messageIds: unreadIds,
      readByUserId: userId,
      readAt: new Date()
    });
  }

  return res.json({ message: 'Messages marked as read', count: unreadIds.length });
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

  const isParticipant = message.chat.participants.some((p) => p.user.toString() === userId);
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

  const isParticipant = message.chat.participants.some((p) => p.user.toString() === userId);
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

  const isParticipant = message.chat.participants.some((p) => p.user.toString() === userId);
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

export async function createGroupChat(req, res) {
  const { name, participantIds, avatar } = req.body;
  const userId = req.user.id;

  if (!name || !participantIds || !participantIds.length) {
    return res.status(400).json({ message: 'Name and participants required' });
  }

  const encryption = generateChatKey();
  const chat = await Chat.create({
    chatId: uuidv4(),
    name,
    avatar,
    participants: [
      { user: userId, role: 'admin' },
      ...participantIds.map(id => ({ user: id, role: 'member' }))
    ],
    isGroup: true,
    createdBy: userId,
    encryption,
  });

  await chat.populate('participants.user', 'name comradeId isOnline mood');

  return res.status(201).json({ chat });
}

export async function saveAsMemory(req, res) {
  const { chatId } = req.params;
  const { messageId, tags, notes } = req.body;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  const memory = await Memory.create({
    chat: chat._id,
    savedBy: userId,
    message: messageId,
    tags,
    notes
  });

  return res.status(201).json({ memory });
}

export async function getMemories(req, res) {
  const { chatId } = req.params;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  const memories = await Memory.find({ chat: chat._id })
    .populate({
      path: 'message',
      populate: { path: 'sender', select: 'name comradeId' }
    })
    .sort({ createdAt: -1 });

  const result = memories.map(m => {
    const doc = m.toObject();
    if (doc.message && doc.message.type === 'text' && doc.message.encryptedContent) {
      doc.message.content = decryptForChat(chat, doc.message.encryptedContent);
    }
    return doc;
  });

  return res.json({ memories: result });
}

export async function deleteMemory(req, res) {
  const { memoryId } = req.params;
  const userId = req.user.id;

  const memory = await Memory.findById(memoryId).populate('chat');
  if (!memory) return res.status(404).json({ message: 'Memory not found' });

  const isParticipant = memory.chat.participants.some(p => String(p.user._id || p.user) === userId);
  if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

  if (memory.savedBy.toString() !== userId) {
    return res.status(403).json({ message: 'Only the creator can delete this memory' });
  }

  await Memory.findByIdAndDelete(memoryId);
  return res.json({ message: 'Memory removed' });
}

export async function convertToTask(req, res) {
  const { chatId } = req.params;
  const { messageId, title, description, assignedTo, dueDate } = req.body;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  const task = await Task.create({
    chat: chat._id,
    createdFromMessage: messageId,
    createdBy: userId,
    assignedTo,
    title,
    description,
    dueDate
  });

  const io = getIO();
  if (io) {
    io.to(`chat:${chatId}`).emit('chat:task_created', { chatId, task });
  }

  return res.status(201).json({ task });
}

export async function getTasks(req, res) {
  const { chatId } = req.params;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  const tasks = await Task.find({ chat: chat._id })
    .populate('assignedTo', 'name comradeId')
    .populate('chat')
    .sort({ createdAt: -1 });

  return res.json({ tasks });
}

export async function updateTaskStatus(req, res) {
  const { taskId } = req.params;
  const { status } = req.body;
  const userId = req.user.id;

  const task = await Task.findById(taskId).populate('chat');
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const isParticipant = task.chat.participants.some(p => String(p.user._id || p.user) === userId);
  if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

  task.status = status;
  await task.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${task.chat.chatId}`).emit('chat:task_updated', { taskId, status });
  }

  return res.json({ task });
}

export async function deleteTask(req, res) {
  const { taskId } = req.params;
  const userId = req.user.id;

  const task = await Task.findById(taskId).populate('chat');
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const isParticipant = task.chat.participants.some(p => String(p.user._id || p.user) === userId);
  if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

  if (task.createdBy.toString() !== userId) {
    return res.status(403).json({ message: 'Only the creator can delete this task' });
  }

  await Task.findByIdAndDelete(taskId);

  const io = getIO();
  if (io) {
    io.to(`chat:${task.chat.chatId}`).emit('chat:task_deleted', { taskId });
  }

  return res.json({ message: 'Task deleted' });
}

export async function voteInPoll(req, res) {
  const { messageId } = req.params;
  const { optionIndex } = req.body;
  const userId = req.user.id;

  const message = await Message.findById(messageId).populate('chat');
  if (!message || message.type !== 'poll') return res.status(404).json({ message: 'Poll not found' });

  const isParticipant = message.chat.participants.some(p => p.user.toString() === userId);
  if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

  // Remove previous vote if any
  message.pollData.options.forEach(opt => {
    opt.votes = opt.votes.filter(v => v.toString() !== userId);
  });

  // Add new vote
  if (optionIndex !== null && message.pollData.options[optionIndex]) {
    message.pollData.options[optionIndex].votes.push(userId);
  }

  await message.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${message.chat.chatId}`).emit('chat:message_updated', {
      messageId: message._id,
      pollData: message.pollData,
    });
  }

  return res.json({ pollData: message.pollData });
}

export async function pinMessage(req, res) {
  const { messageId } = req.params;
  const userId = req.user.id;

  const message = await Message.findById(messageId).populate('chat');
  if (!message) return res.status(404).json({ message: 'Message not found' });

  const chat = message.chat;
  const userRole = chat.participants.find(p => p.user.toString() === userId)?.role;
  if (!['admin', 'moderator'].includes(userRole)) {
    return res.status(403).json({ message: 'Only admins/moderators can pin' });
  }

  if (!chat.pinnedMessages.includes(message._id)) {
    chat.pinnedMessages.push(message._id);
    await chat.save();

    const io = getIO();
    if (io) {
      io.to(`chat:${chat.chatId}`).emit('chat:pinned_updated', { pinnedMessages: chat.pinnedMessages });
    }
  }

  return res.json({ pinnedMessages: chat.pinnedMessages });
}

export async function unpinMessage(req, res) {
  const { messageId } = req.params;
  const userId = req.user.id;

  const chat = await Chat.findOne({ pinnedMessages: messageId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  const userRole = chat.participants.find(p => p.user.toString() === userId)?.role;
  if (!['admin', 'moderator'].includes(userRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  chat.pinnedMessages = chat.pinnedMessages.filter(id => id.toString() !== messageId);
  await chat.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${chat.chatId}`).emit('chat:pinned_updated', { pinnedMessages: chat.pinnedMessages });
  }

  return res.json({ pinnedMessages: chat.pinnedMessages });
}

export async function updateChatSettings(req, res) {
  const { chatId } = req.params;
  const { themeColor, backgroundImage, chatLockPin } = req.body;
  const userId = req.user.id;

  const chat = await Chat.findOne({ chatId, 'participants.user': userId });
  if (!chat) return res.status(404).json({ message: 'Chat not found' });

  if (themeColor) chat.settings.themeColor = themeColor;
  if (backgroundImage) chat.settings.backgroundImage = backgroundImage;
  if (chatLockPin) chat.settings.chatLockPin = chatLockPin; // In real app, hash this

  await chat.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${chat.chatId}`).emit('chat:settings_updated', { settings: chat.settings });
  }

  return res.json({ settings: chat.settings });
}

export async function editMessage(req, res) {
  const { messageId } = req.params;
  const { text, content } = req.body;
  const updateText = text || content;
  const userId = req.user.id;

  const message = await Message.findById(messageId).populate('chat');
  if (!message) return res.status(404).json({ message: 'Message not found' });

  if (message.sender.toString() !== userId) return res.status(403).json({ message: 'Forbidden' });

  // Store history
  message.editHistory.push({
    content: message.encryptedContent,
    editedAt: new Date(),
  });

  // Encrypt new text
  const encrypted = encryptForChat(message.chat, updateText);
  message.encryptedContent = encrypted;
  await message.save();

  const io = getIO();
  if (io) {
    io.to(`chat:${message.chat.chatId}`).emit('chat:message_updated', {
      messageId: message._id,
      content: updateText,
      editHistory: message.editHistory,
    });
  }

  return res.json({ message: 'Message updated' });
}
