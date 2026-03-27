import express from 'express';
import { register, login, refresh, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

authRouter.post('/register', register);

authRouter.post('/login', login);

authRouter.post('/refresh', refresh);

authRouter.get('/me', requireAuth, me);

