import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';
import { sseHandler } from './routes/sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Disable x-powered-by
app.disable('x-powered-by');

// CORS for local development flexibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// SSE endpoint
app.get('/api/events', sseHandler);

// API routes
app.use('/api', apiRouter);

// Serve static frontend assets
app.use(express.static(PUBLIC_DIR));

// Fallback to index.html for SPA navigation. Using middleware keeps this
// compatible with both Express 4 and Express 5 (where '*' is not a valid route).
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint não encontrado' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

export default app;
