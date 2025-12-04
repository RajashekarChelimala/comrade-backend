import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  sendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptRequest,
  rejectRequest,
} from '../controllers/chatRequest.controller.js';

export const requestRouter = express.Router();

requestRouter.use(requireAuth);

requestRouter.post('/', sendRequest);
requestRouter.get('/incoming', getIncomingRequests);
requestRouter.get('/outgoing', getOutgoingRequests);
requestRouter.post('/:id/accept', acceptRequest);
requestRouter.post('/:id/reject', rejectRequest);
