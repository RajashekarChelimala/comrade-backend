import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadMedia, uploadMiddleware } from '../controllers/media.controller.js';

export const mediaRouter = express.Router();

mediaRouter.use(requireAuth);

mediaRouter.post('/upload', uploadMiddleware, uploadMedia);
