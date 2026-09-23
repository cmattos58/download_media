import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { dbService } from '../db.js';
import { queueManager } from '../queue.js';
import { Downloader } from '../downloader.js';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);
const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max for txt
const VIDEO_FORMATS = new Set(['mp4', 'mkv', 'webm']);
const AUDIO_FORMATS = new Set(['mp3', 'm4a', 'flac', 'wav', 'opus']);
const VIDEO_QUALITIES = new Set(['best', '2160', '1440', '1080', '720', '480']);
const AUDIO_QUALITIES = new Set(['320K', '256K', '192K', '128K']);

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function validateJobOptions(mediaType, format, quality) {
  if (mediaType !== 'video' && mediaType !== 'audio') {
    return 'Tipo de mídia inválido';
  }
  if (format && !(mediaType === 'audio' ? AUDIO_FORMATS : VIDEO_FORMATS).has(format)) {
    return 'Formato de mídia inválido';
  }
  if (quality && !(mediaType === 'audio' ? AUDIO_QUALITIES : VIDEO_QUALITIES).has(quality)) {
    return 'Qualidade de mídia inválida';
  }
  return null;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function resolveFileLocation(type, rawFilename) {
  if (type !== 'audio' && type !== 'video') return null;
  const safeName = path.basename(rawFilename);
  const possiblePaths = type === 'audio' 
    ? [path.join(config.STORAGE_AUDIO_DIR, safeName), path.join(config.LEGACY_AUDIO_DIR, safeName)]
    : [path.join(config.STORAGE_VIDEO_DIR, safeName), path.join(config.LEGACY_VIDEO_DIR, safeName)];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 1. Fetch info for a URL
router.get('/info', async (req, res) => {
  const { url } = req.query;
  if (typeof url !== 'string' || !isHttpUrl(url)) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório' });
  }

  try {
    const info = await Downloader.fetchInfo(url);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create job(s)
router.post('/jobs', (req, res) => {
  const { url, urls, mediaType = 'video', format, quality, title, thumbnail } = req.body;
  const optionError = validateJobOptions(mediaType, format, quality);
  if (optionError) return res.status(400).json({ error: optionError });

  if (urls && Array.isArray(urls)) {
    const validUrls = urls
      .map(u => String(u).trim())
      .filter(u => u && !u.startsWith('#') && isHttpUrl(u));

    if (validUrls.length === 0) {
      return res.status(400).json({ error: 'Nenhuma URL válida fornecida' });
    }

    const items = validUrls.map(u => ({
      url: u,
      mediaType,
      format,
      quality,
      title: '',
      thumbnail: ''
    }));

    const jobs = queueManager.enqueueBatch(items);
    return res.json({ success: true, count: jobs.length, jobs });
  }

  if (typeof url !== 'string' || !isHttpUrl(url.trim())) {
    return res.status(400).json({ error: 'URL HTTP(S) é obrigatória' });
  }

  const job = queueManager.enqueue({
    url: url.trim(),
    mediaType,
    format,
    quality,
    title: title || '',
    thumbnail: thumbnail || ''
  });

  res.json({ success: true, job });
});

// 3. Upload .txt file with URLs
router.post('/jobs/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo .txt não enviado' });
  }
  if (path.extname(req.file.originalname).toLowerCase() !== '.txt') {
    return res.status(400).json({ error: 'Envie um arquivo .txt com as URLs' });
  }

  const { mediaType = 'video', format, quality } = req.body;
  const optionError = validateJobOptions(mediaType, format, quality);
  if (optionError) return res.status(400).json({ error: optionError });
  const content = req.file.buffer.toString('utf-8');
  const lines = content.split(/\r?\n/);

  const urls = lines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && isHttpUrl(line));

  if (urls.length === 0) {
    return res.status(400).json({ error: 'Nenhuma URL válida encontrada no arquivo enviado' });
  }

  const items = urls.map(u => ({
    url: u,
    mediaType,
    format,
    quality
  }));

  const jobs = queueManager.enqueueBatch(items);
  res.json({ success: true, count: jobs.length, jobs });
});

// 4. Import from local videos.txt
router.post('/jobs/import-local', (req, res) => {
  const localFile = path.join(config.ROOT_DIR, 'videos.txt');
  if (!fs.existsSync(localFile)) {
    return res.status(404).json({ error: 'Arquivo videos.txt não encontrado na raiz do projeto' });
  }

  const { mediaType = 'video', format, quality } = req.body;
  const optionError = validateJobOptions(mediaType, format, quality);
  if (optionError) return res.status(400).json({ error: optionError });
  const content = fs.readFileSync(localFile, 'utf-8');
  const lines = content.split(/\r?\n/);

  const urls = lines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && isHttpUrl(line));

  if (urls.length === 0) {
    return res.status(400).json({ error: 'Nenhuma URL encontrada dentro do arquivo videos.txt' });
  }

  const items = urls.map(u => ({
    url: u,
    mediaType,
    format,
    quality
  }));

  const jobs = queueManager.enqueueBatch(items);
  res.json({ success: true, count: jobs.length, jobs });
});

// 5. List jobs
router.get('/jobs', (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(1000, Math.max(1, requestedLimit)) : 100;
  const jobs = dbService.getAllJobs(limit);
  res.json({ jobs, stats: queueManager.getStats() });
});

// 6. Get single job
router.get('/jobs/:id', (req, res) => {
  const job = dbService.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Download não encontrado' });
  }
  res.json(job);
});

// 7. Cancel job
router.post('/jobs/:id/cancel', (req, res) => {
  const job = dbService.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Download não encontrado' });
  }
  const updated = queueManager.cancel(req.params.id);
  if (!updated) {
    return res.status(409).json({ error: 'Apenas downloads em fila ou em andamento podem ser cancelados' });
  }
  res.json({ success: true, job: updated });
});

// 8. Retry job
router.post('/jobs/:id/retry', (req, res) => {
  const job = dbService.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Download não encontrado' });
  }
  const updated = queueManager.retry(req.params.id);
  if (!updated) {
    return res.status(409).json({ error: 'Apenas downloads com falha ou cancelados podem ser reiniciados' });
  }
  res.json({ success: true, job: updated });
});

// 9. Delete job from list
router.delete('/jobs/:id', (req, res) => {
  const job = dbService.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Download não encontrado' });
  if (job.status === 'queued' || job.status === 'running') {
    return res.status(409).json({ error: 'Cancele o download antes de removê-lo da lista' });
  }
  dbService.deleteJob(req.params.id);
  res.json({ success: true });
});

// 10. Clear completed jobs
router.post('/jobs/clear-completed', (req, res) => {
  dbService.clearCompleted();
  res.json({ success: true });
});

// 11. Queue pause/resume
router.post('/queue/pause', (req, res) => {
  queueManager.pause();
  res.json({ success: true, isPaused: true });
});

router.post('/queue/resume', (req, res) => {
  queueManager.resume();
  res.json({ success: true, isPaused: false });
});

// 12. Library - List downloaded media
router.get('/library', (req, res) => {
  const items = [];

  const scanFolder = (dirPath, mediaType) => {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(dirPath, entry.name);
      // Skip hidden, partial or log files
      if (entry.name.startsWith('.') || entry.name.endsWith('.part') || entry.name.endsWith('.ytdl') || entry.name.endsWith('.log')) {
        continue;
      }

      try {
        const stat = fs.statSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase().replace('.', '');
        items.push({
          name: entry.name,
          type: mediaType,
          extension: ext,
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          createdAt: stat.birthtime || stat.mtime,
          modifiedAt: stat.mtime,
          downloadUrl: `/api/library/download/${mediaType}/${encodeURIComponent(entry.name)}`,
          streamUrl: `/api/library/stream/${mediaType}/${encodeURIComponent(entry.name)}`
        });
      } catch (_) {}
    }
  };

  scanFolder(config.STORAGE_VIDEO_DIR, 'video');
  scanFolder(config.LEGACY_VIDEO_DIR, 'video');
  scanFolder(config.STORAGE_AUDIO_DIR, 'audio');
  scanFolder(config.LEGACY_AUDIO_DIR, 'audio');

  // De-duplicate by name in case file exists in both paths
  const uniqueItems = Array.from(new Map(items.map(item => [`${item.type}:${item.name}`, item])).values());
  uniqueItems.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

  res.json(uniqueItems);
});

// 13. Library - Stream media (HTTP 206 Byte-Range for in-browser playback)
router.get('/library/stream/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const filePath = resolveFileLocation(type, filename);

  if (!filePath) {
    return res.status(404).send('Arquivo não encontrado');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.opus': 'audio/opus',
    '.ogg': 'audio/ogg'
  };
  const contentType = mimeTypes[ext] || (type === 'audio' ? 'audio/mpeg' : 'video/mp4');

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.set('Content-Range', `bytes */${fileSize}`);
      return res.sendStatus(416);
    }

    let start;
    let end;
    if (match[1] === '') {
      const suffixLength = Number.parseInt(match[2], 10);
      if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
        res.set('Content-Range', `bytes */${fileSize}`);
        return res.sendStatus(416);
      }
      start = Math.max(0, fileSize - suffixLength);
      end = fileSize - 1;
    } else {
      start = Number.parseInt(match[1], 10);
      end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= fileSize || end < start) {
      res.set('Content-Range', `bytes */${fileSize}`);
      return res.sendStatus(416);
    }
    end = Math.min(end, fileSize - 1);
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 14. Library - Direct download attachment
router.get('/library/download/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const filePath = resolveFileLocation(type, filename);

  if (!filePath) {
    return res.status(404).send('Arquivo não encontrado');
  }

  res.download(filePath, path.basename(filename));
});

// 15. Library - Delete file
router.delete('/library/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const filePath = resolveFileLocation(type, filename);

  if (!filePath) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Arquivo removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao remover arquivo: ' + err.message });
  }
});

// 16. System status
router.get('/system', async (req, res) => {
  let ytdlpVersion = 'Desconhecido';
  let ffmpegVersion = 'Desconhecido';

  try {
    const { stdout } = await execFileAsync(config.YTDLP_BIN, ['--version']);
    ytdlpVersion = stdout.trim();
  } catch (_) {}

  try {
    const { stdout } = await execFileAsync(config.FFMPEG_BIN, ['-version']);
    const match = stdout.match(/ffmpeg version ([^\s]+)/);
    ffmpegVersion = match ? match[1] : 'Instalado';
  } catch (_) {}

  const hasVideosTxt = fs.existsSync(path.join(config.ROOT_DIR, 'videos.txt'));

  res.json({
    ytdlpVersion,
    ffmpegVersion,
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    uptimeSeconds: Math.floor(process.uptime()),
    hasVideosTxt,
    concurrency: queueManager.concurrency,
    freeMemory: formatBytes(os.freemem()),
    totalMemory: formatBytes(os.totalmem()),
    storageDirs: {
      video: config.STORAGE_VIDEO_DIR,
      audio: config.STORAGE_AUDIO_DIR
    }
  });
});

// 17. Update yt-dlp
router.post('/system/update-ytdlp', async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync(config.YTDLP_BIN, ['-U']);
    res.json({ success: true, output: (stdout || stderr).trim() });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao atualizar yt-dlp: ' + (err.stderr || err.message) });
  }
});

// 18. Settings
router.get('/settings', (req, res) => {
  res.json({
    concurrency: queueManager.concurrency,
    defaultVideoFormat: dbService.getSetting('defaultVideoFormat', config.DEFAULT_VIDEO_MERGE),
    defaultAudioFormat: dbService.getSetting('defaultAudioFormat', config.DEFAULT_AUDIO_FORMAT),
    defaultAudioQuality: dbService.getSetting('defaultAudioQuality', config.DEFAULT_AUDIO_QUALITY)
  });
});

router.post('/settings', (req, res) => {
  const { concurrency, defaultVideoFormat, defaultAudioFormat, defaultAudioQuality } = req.body;

  if (concurrency !== undefined) {
    queueManager.setConcurrency(concurrency);
  }
  if (defaultVideoFormat) {
    if (!VIDEO_FORMATS.has(defaultVideoFormat)) return res.status(400).json({ error: 'Formato de vídeo inválido' });
    dbService.setSetting('defaultVideoFormat', defaultVideoFormat);
  }
  if (defaultAudioFormat) {
    if (!AUDIO_FORMATS.has(defaultAudioFormat)) return res.status(400).json({ error: 'Formato de áudio inválido' });
    dbService.setSetting('defaultAudioFormat', defaultAudioFormat);
  }
  if (defaultAudioQuality) {
    if (!AUDIO_QUALITIES.has(defaultAudioQuality)) return res.status(400).json({ error: 'Qualidade de áudio inválida' });
    dbService.setSetting('defaultAudioQuality', defaultAudioQuality);
  }

  res.json({ success: true });
});

export default router;
