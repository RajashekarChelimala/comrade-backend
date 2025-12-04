import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  getReportedUsers,
  getUnblockRequests,
  approveUnblockRequest,
  rejectUnblockRequest,
} from '../controllers/admin.controller.js';

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/reported-users', getReportedUsers);
adminRouter.get('/unblock-requests', getUnblockRequests);
adminRouter.post('/unblock-requests/:id/approve', approveUnblockRequest);
adminRouter.post('/unblock-requests/:id/reject', rejectUnblockRequest);
