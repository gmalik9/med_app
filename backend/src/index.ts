import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initializeDatabase } from './db/schema';
import { authenticate } from './middleware/auth';
import { auditLog } from './middleware/auditLog';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import noteRoutes from './routes/notes';

const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
  })
);
app.use(auditLog);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/patients', patientRoutes);
app.use('/api/notes', noteRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(config.port, () => {
      console.log(`🏥 Medical notes app running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
