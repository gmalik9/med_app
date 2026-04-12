import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initializeDatabase } from './db/schema';
import { seedDatabase } from './db/seed';
import { authenticate, checkSessionTimeout } from './middleware/auth';
import { auditLog } from './middleware/auditLog';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import noteRoutes from './routes/notes';
import vitalsRoutes from './routes/vitals';
import appointmentsRoutes from './routes/appointments';
import visitsRoutes from './routes/visits';
import templatesRoutes from './routes/templates';
import analyticsRoutes from './routes/analytics';

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
app.use(checkSessionTimeout);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Seed endpoint (for demo purposes)
app.post('/api/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.json({ status: 'ok', message: 'Database seeded successfully' });
  } catch (err) {
    console.error('Error seeding database:', err);
    res.status(500).json({ error: 'Failed to seed database' });
  }
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/patients', patientRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/vitals', vitalsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/visits', visitsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/analytics', analyticsRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    
    // Check if SEED_DATABASE env var is set
    if (process.env.SEED_DATABASE === 'true') {
      console.log('🌱 Auto-seeding database...');
      await seedDatabase();
    }
    
    app.listen(config.port, () => {
      console.log(`🏥 Medical notes app running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Database: Connected`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
