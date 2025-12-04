import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listChats,
  getChat,
  getMessages,
  sendMessage,
  reactToMessage,
  removeReaction,
  saveMedia,
} from '../controllers/chat.controller.js';

export const chatRouter = express.Router();

chatRouter.use(requireAuth);

chatRouter.get('/', listChats);
chatRouter.get('/:chatId', getChat);
chatRouter.get('/:chatId/messages', getMessages);
chatRouter.post('/:chatId/messages', sendMessage);

chatRouter.post('/messages/:messageId/react', reactToMessage);
chatRouter.delete('/messages/:messageId/react', removeReaction);
chatRouter.post('/messages/:messageId/save-media', saveMedia);
