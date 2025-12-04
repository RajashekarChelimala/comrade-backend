import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { featureFlagsRouter } from './routes/config.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { requestRouter } from './routes/request.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { mediaRouter } from './routes/media.routes.js';
import { csrfProtection } from './middleware/csrf.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',')
  : [process.env.FRONTEND_URL || '*'];

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(csrfProtection);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'comrade-backend' });
});

app.use('/config', featureFlagsRouter);

app.use('/auth', authRouter);

app.use('/users', userRouter);
app.use('/admin', adminRouter);

app.use('/requests', requestRouter);

app.use('/chats', chatRouter);

app.use('/media', mediaRouter);

// TODO: mount any additional routes here

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

export default app;
