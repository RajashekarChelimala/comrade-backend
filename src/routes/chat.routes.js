import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createChat,
  listChats,
  getChat,
  getMessages,
  sendMessage,
  editMessage,
  reactToMessage,
  removeReaction,
  saveMedia,
  markChatAsRead,
  saveAsMemory,
  getMemories,
  convertToTask,
  getTasks,
  updateTaskStatus,
  voteInPoll,
  pinMessage,
  unpinMessage,
  updateChatSettings,
  createGroupChat,
  deleteMessage,
  deleteMemory,
  deleteTask,
} from '../controllers/chat.controller.js';

export const chatRouter = express.Router();

chatRouter.use(requireAuth);

chatRouter.post('/:chatId/read', markChatAsRead);

chatRouter.post('/', createChat);
chatRouter.post('/group', createGroupChat);
chatRouter.get('/', listChats);
chatRouter.get('/:chatId', getChat);
chatRouter.patch('/:chatId/settings', updateChatSettings);
chatRouter.get('/:chatId/messages', getMessages);
chatRouter.post('/:chatId/messages', sendMessage);
chatRouter.patch('/messages/:messageId', editMessage);
chatRouter.delete('/messages/:messageId', deleteMessage);

chatRouter.post('/messages/:messageId/react', reactToMessage);
chatRouter.delete('/messages/:messageId/react', removeReaction);
chatRouter.post('/messages/:messageId/save-media', saveMedia);

chatRouter.post('/:chatId/memories', saveAsMemory);
chatRouter.get('/:chatId/memories', getMemories);
chatRouter.delete('/:chatId/memories/:memoryId', deleteMemory);

chatRouter.post('/:chatId/tasks', convertToTask);
chatRouter.get('/:chatId/tasks', getTasks);
chatRouter.patch('/:chatId/tasks/:taskId', updateTaskStatus);
chatRouter.delete('/:chatId/tasks/:taskId', deleteTask);

chatRouter.post('/messages/:messageId/vote', voteInPoll);
chatRouter.post('/messages/:messageId/pin', pinMessage);
chatRouter.delete('/messages/:messageId/pin', unpinMessage);
