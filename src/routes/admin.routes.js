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
  getPendingUsers,
  approveUser,
  rejectUser,
  deleteUser,
  createUser,
} from '../controllers/admin.controller.js';

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', getAllUsers);
adminRouter.get('/flags', getFlags);
adminRouter.patch('/flags/:key', updateFlag);

adminRouter.get('/pending-users', getPendingUsers);
adminRouter.post('/users/:id/approve', approveUser);
adminRouter.post('/users/:id/reject', rejectUser);
adminRouter.delete('/users/:id', deleteUser);
adminRouter.post('/users', createUser);

adminRouter.get('/reported-users', getReportedUsers);
adminRouter.get('/unblock-requests', getUnblockRequests);
adminRouter.post('/unblock-requests/:id/approve', approveUnblockRequest);
adminRouter.post('/unblock-requests/:id/reject', rejectUnblockRequest);
