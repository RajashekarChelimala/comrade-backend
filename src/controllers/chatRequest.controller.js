import { ChatRequest } from '../models/ChatRequest.js';
import { User } from '../models/User.js';
import { Chat } from '../models/Chat.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import { generateChatKey } from '../utils/encryption.js';

const MAX_DECLINES = 3;

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

export async function sendRequest(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_CHAT_REQUESTS) {
    return res.status(403).json({ message: 'Chat requests are temporarily disabled' });
  }

  const senderId = req.user.id;
  const { recipientId } = req.body;
  if (!recipientId) {
    return res.status(400).json({ message: 'recipientId is required' });
  }
  if (recipientId === senderId) {
    return res.status(400).json({ message: 'Cannot send request to yourself' });
  }

  const blocked = await isBlockedBetween(senderId, recipientId);
  if (blocked) {
    return res.status(403).json({ message: 'You cannot send a request to this user' });
  }

  let existing = await ChatRequest.findOne({ sender: senderId, recipient: recipientId });

  if (existing) {
    if (existing.status === 'PENDING') {
      return res.status(409).json({ message: 'Request already pending' });
    }
    if (existing.status === 'REJECTED' && existing.declineCount >= MAX_DECLINES) {
      return res.status(403).json({ message: 'You cannot send more requests to this user' });
    }
    existing.status = 'PENDING';
    existing.lastActionAt = new Date();
    await existing.save();
    return res.status(200).json({ request: existing });
  }

  const request = await ChatRequest.create({
    sender: senderId,
    recipient: recipientId,
    status: 'PENDING',
  });

  return res.status(201).json({ request });
}

export async function getIncomingRequests(req, res) {
  const userId = req.user.id;
  const requests = await ChatRequest.find({ recipient: userId, status: 'PENDING' })
    .populate('sender', 'name comradeHandle comradeId')
    .sort({ createdAt: -1 });
  return res.json({ requests });
}

export async function getOutgoingRequests(req, res) {
  const userId = req.user.id;
  const requests = await ChatRequest.find({ sender: userId })
    .populate('recipient', 'name comradeHandle comradeId')
    .sort({ createdAt: -1 });
  return res.json({ requests });
}

export async function acceptRequest(req, res) {
  const userId = req.user.id;
  const { id } = req.params;

  const request = await ChatRequest.findById(id);
  if (!request || request.recipient.toString() !== userId) {
    return res.status(404).json({ message: 'Request not found' });
  }
  if (request.status !== 'PENDING') {
    return res.status(400).json({ message: 'Request is not pending' });
  }

  const blocked = await isBlockedBetween(request.sender, request.recipient);
  if (blocked) {
    return res.status(403).json({ message: 'You cannot accept this request' });
  }

  const existingChat = await Chat.findOne({
    participants: { $all: [request.sender, request.recipient], $size: 2 },
  });

  let chat = existingChat;
  if (!chat) {
    const encryption = generateChatKey();
    const chatId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    chat = await Chat.create({
      chatId,
      participants: [request.sender, request.recipient],
      createdBy: request.sender,
      encryption,
    });
  }

  request.status = 'ACCEPTED';
  request.lastActionAt = new Date();
  await request.save();

  return res.json({ message: 'Request accepted', chatId: chat.chatId });
}

export async function rejectRequest(req, res) {
  const userId = req.user.id;
  const { id } = req.params;

  const request = await ChatRequest.findById(id);
  if (!request || request.recipient.toString() !== userId) {
    return res.status(404).json({ message: 'Request not found' });
  }
  if (request.status !== 'PENDING') {
    return res.status(400).json({ message: 'Request is not pending' });
  }

  request.status = 'REJECTED';
  request.declineCount += 1;
  request.lastActionAt = new Date();
  await request.save();

  let canSendMore = true;
  if (request.declineCount >= MAX_DECLINES) {
    canSendMore = false;
  }

  return res.json({ message: 'Request rejected', canSendMore });
}
