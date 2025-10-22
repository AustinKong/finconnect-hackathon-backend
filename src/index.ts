import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import walletRouter from './routes/wallet';
import posRouter from './routes/pos';
import missionsRouter from './routes/missions';
import analyticsRouter from './routes/analytics';
import yieldRouter from './routes/yield';
import { clerkAuthMiddleware } from './middleware/clerkAuth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication middleware (must be after body parsers)
app.use(clerkAuthMiddleware);

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/wallet', walletRouter);
app.use('/pos', posRouter);
app.use('/missions', missionsRouter);
app.use('/analytics', analyticsRouter);
app.use('/yield', yieldRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`🚀 GlobeTrotter+ Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});

export default app;
