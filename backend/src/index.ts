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
// Smart CORS origin handler that supports wildcard patterns
const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (like mobile apps, curl, etc)
  if (!origin) return callback(null, true);
  
  // Check each allowed origin pattern
  for (const allowedPattern of config.allowedOrigins) {
    // Handle wildcard patterns
    if (allowedPattern.includes('*')) {
      const regexPattern = '^' + allowedPattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexPattern);
      if (regex.test(origin)) {
        return callback(null, true);
      }
    } 
    // Exact match
    else if (origin === allowedPattern) {
      return callback(null, true);
    }
  }
  
  // Origin not allowed
  callback(new Error('Not allowed by CORS'), false);
};

app.use(
  cors({
    origin: corsOriginHandler,
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

// AI Note Formatting with Gemini
app.post('/api/format-note', authenticate, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Note text is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI formatting not configured" });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a medical scribe. The doctor has written the following clinical notes, which may include shorthand or incomplete phrasing.

Your task is to rewrite these notes into a clear, well-structured, and professional clinical document.

Requirements:

Preserve all original medical facts exactly as written — do not add, remove, or infer any information.
Do not invent or assume missing details.
Improve readability, grammar, and organization.
Use standard clinical terminology and formatting.
Expand shorthand where appropriate, but only when the meaning is clear.

Output instructions:

Return only the fully formatted clinical note.
Do not include explanations, comments, or extra text.

Clinical Notes:
${text}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API Error:', data.error);
      return res.status(500).json({ error: data.error.message || "AI formatting failed" });
    }

    const formattedText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({ text: formattedText });
  } catch (err: any) {
    console.error('Format note error:', err);
    res.status(500).json({ error: "Failed to format note" });
  }
});

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
    
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`🏥 Medical notes app running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Listening on all interfaces (0.0.0.0) - Render compatible`);
      console.log(`Database: Connected`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
