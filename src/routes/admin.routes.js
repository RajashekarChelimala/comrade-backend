import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  getReportedUsers,
  getUnblockRequests,
  approveUnblockRequest,
  rejectUnblockRequest,
  getAllUsers,
  getFlags,
  updateFlag,
} from '../controllers/admin.controller.js';

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', getAllUsers);
adminRouter.get('/flags', getFlags);
adminRouter.patch('/flags/:key', updateFlag);

adminRouter.get('/reported-users', getReportedUsers);
adminRouter.get('/unblock-requests', getUnblockRequests);
adminRouter.post('/unblock-requests/:id/approve', approveUnblockRequest);
adminRouter.post('/unblock-requests/:id/reject', rejectUnblockRequest);
