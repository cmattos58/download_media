import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const requestedPort = Number.parseInt(process.env.PORT, 10);

export const config = {
  PORT: Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
    ? requestedPort
    : 3000,
  HOST: process.env.HOST || '0.0.0.0',
  ROOT_DIR,
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  DB_PATH: path.join(ROOT_DIR, 'data', 'downloads.db'),
  
  // Storage directories (also checks legacy paths for backward compatibility)
  STORAGE_VIDEO_DIR: path.join(ROOT_DIR, 'downloads', 'videos'),
  STORAGE_AUDIO_DIR: path.join(ROOT_DIR, 'downloads', 'audios'),
  LEGACY_VIDEO_DIR: path.join(ROOT_DIR, 'downloads'),
  LEGACY_AUDIO_DIR: path.join(ROOT_DIR, 'audios'),

  // Output filename template for yt-dlp
  OUTPUT_TEMPLATE: '%(title).200B [%(id)s].%(ext)s',

  // Defaults
  DEFAULT_CONCURRENCY: 2,
  DEFAULT_VIDEO_FORMAT: 'bestvideo+bestaudio/best',
  DEFAULT_VIDEO_MERGE: 'mp4',
  DEFAULT_AUDIO_FORMAT: 'mp3',
  DEFAULT_AUDIO_QUALITY: '192K',

  // Binaries
  YTDLP_BIN: process.env.YTDLP_PATH || 'yt-dlp',
  FFMPEG_BIN: process.env.FFMPEG_PATH || 'ffmpeg'
};
