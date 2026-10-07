import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';
import { sseHandler } from './routes/sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const app = express();

// Middlewares
// Compress responses, except SSE and media streaming (Range requests)
app.use(compression({
  filter: (req, res) => {
    if (req.path === '/api/events' || req.path.startsWith('/api/library/stream/')) return false;
    return compression.filter(req, res);
  }
}));
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

// Health check (Docker / monitoring)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// SSE endpoint
app.get('/api/events', sseHandler);

// API routes
app.use('/api', apiRouter);

// Serve static frontend assets
// Vendored libs are versioned (cache for a day); app code revalidates via ETag;
// the service worker must never be served stale.
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (filePath.includes(`${path.sep}vendor${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Fallback to index.html for SPA navigation. Using middleware keeps this
// compatible with both Express 4 and Express 5 (where '*' is not a valid route).
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint não encontrado' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Central error handler: always answer in JSON for the API
app.use((err, req, res, next) => {
  console.error('[ERRO]', err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor' : err.message });
});

export default app;
