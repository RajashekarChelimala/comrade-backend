import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getMe,
  updateMe,
  searchUsers,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  reportUser,
  createUnblockRequest,
} from '../controllers/user.controller.js';

export const userRouter = express.Router();

userRouter.use(requireAuth);

userRouter.get('/me', getMe);
userRouter.patch('/me', updateMe);
userRouter.get('/search', searchUsers);

userRouter.post('/:id/block', blockUser);
userRouter.post('/:id/unblock', unblockUser);
userRouter.post('/:id/mute', muteUser);
userRouter.post('/:id/unmute', unmuteUser);
userRouter.post('/:id/report', reportUser);

userRouter.post('/me/unblock-requests', createUnblockRequest);
