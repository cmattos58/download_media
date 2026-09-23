import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

export class Downloader {
  /**
   * Fetches metadata for a given URL without downloading.
   */
  static async fetchInfo(url) {
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-single-json',
        '--no-playlist',
        '--skip-download',
        '--no-warnings',
        url
      ];

      const child = spawn(config.YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdoutData = '';
      let stderrData = '';
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const succeed = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        fail(new Error('Tempo limite excedido ao buscar informações da mídia (15s)'));
      }, 15000);

      child.stdout.on('data', chunk => {
        stdoutData += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderrData += chunk.toString();
      });

      child.on('close', code => {
        clearTimeout(timeout);
        if (settled) return;
        if (code !== 0) {
          return fail(new Error(stderrData.trim() || `yt-dlp saiu com erro código ${code}`));
        }

        try {
          const info = JSON.parse(stdoutData);
          succeed({
            id: info.id,
            title: info.title || 'Sem título',
            thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : null),
            duration: info.duration || 0,
            durationString: Downloader.formatDuration(info.duration || 0),
            uploader: info.uploader || info.channel || 'Desconhecido',
            extractor: info.extractor_key || info.extractor || 'Web',
            webpage_url: info.webpage_url || url,
            description: (info.description || '').slice(0, 300)
          });
        } catch (err) {
          fail(new Error('Falha ao processar metadados da mídia: ' + err.message));
        }
      });

      child.on('error', err => {
        clearTimeout(timeout);
        fail(err);
      });
    });
  }

  /**
   * Formats seconds into HH:MM:SS or MM:SS
   */
  static formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Starts downloading a job and emits progress/logs via callbacks.
   */
  static runJob(job, callbacks = {}) {
    const { onProgress, onLog, onFileName } = callbacks;

    // Ensure output directories exist
    fs.mkdirSync(config.STORAGE_VIDEO_DIR, { recursive: true });
    fs.mkdirSync(config.STORAGE_AUDIO_DIR, { recursive: true });

    const isAudio = job.media_type === 'audio';
    const outputDir = isAudio ? config.STORAGE_AUDIO_DIR : config.STORAGE_VIDEO_DIR;
    const outputPath = path.join(outputDir, config.OUTPUT_TEMPLATE);

    const args = [
      '--continue',
      '--no-overwrites',
      '--newline',
      '--progress-template',
      'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._total_bytes_estimate_str)s|%(progress._downloaded_bytes_str)s',
      '--print', 'after_move:filepath',
      '-o', outputPath
    ];

    if (isAudio) {
      const audioFormat = job.format || config.DEFAULT_AUDIO_FORMAT;
      const audioQuality = job.quality || config.DEFAULT_AUDIO_QUALITY;
      args.push(
        '-f', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', audioFormat,
        '--audio-quality', audioQuality
      );
    } else {
      const mergeFormat = job.format || config.DEFAULT_VIDEO_MERGE;
      let formatSelector = 'bestvideo+bestaudio/best';
      
      if (job.quality && job.quality !== 'best') {
        const height = parseInt(job.quality.replace(/\D/g, ''), 10);
        if (height) {
          formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
        }
      }

      args.push(
        '-f', formatSelector,
        '--merge-output-format', mergeFormat
      );
    }

    args.push(job.url);

    const child = spawn(config.YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let detectedFilePath = null;
    let detectedFileName = null;
    const buffers = { stdout: '', stderr: '' };
    let lastError = '';

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (onLog) {
        onLog(trimmed);
      }

      if (path.isAbsolute(trimmed) && path.dirname(trimmed) === outputDir) {
        detectedFilePath = trimmed;
        detectedFileName = path.basename(trimmed);
        if (onFileName) onFileName(detectedFilePath, detectedFileName);
        return;
      }

      // Check progress template output
      if (trimmed.startsWith('download:')) {
        const payload = trimmed.slice(9);
        const [percentStr, speedStr, etaStr, totalSizeStr, downloadedBytesStr] = payload.split('|');
        const percentNum = parseFloat((percentStr || '').replace('%', '').trim()) || 0;

        if (onProgress) {
          onProgress({
            progress: percentNum,
            speed: (speedStr || '').trim(),
            eta: (etaStr || '').trim(),
            totalSize: (totalSizeStr || '').trim(),
            downloadedBytes: (downloadedBytesStr || '').trim()
          });
        }
        return;
      }

      // Detect file name / destination from standard logs
      // Patterns:
      // [download] Destination: /path/to/file.mp4
      // [Merger] Merging formats into "/path/to/file.mp4"
      // [ExtractAudio] Destination: /path/to/file.mp3
      // [download] /path/to/file.mp4 has already been downloaded
      const destMatch = trimmed.match(/(?:Destination:\s+|Merging formats into\s+"?|\[download\]\s+)(.+?\.(?:mp4|mkv|webm|mp3|m4a|flac|wav|opus|ogg|aac))"?/i);
      if (destMatch && destMatch[1]) {
        const rawPath = destMatch[1].trim().replace(/^"/, '').replace(/"$/, '');
        const resolved = path.isAbsolute(rawPath) ? rawPath : path.join(outputDir, path.basename(rawPath));
        detectedFilePath = resolved;
        detectedFileName = path.basename(resolved);
        if (onFileName) {
          onFileName(detectedFilePath, detectedFileName);
        }
      }
    };

    const processData = (stream, chunk) => {
      buffers[stream] += chunk.toString();
      const lines = buffers[stream].split('\n');
      buffers[stream] = lines.pop(); // keep remainder
      for (const line of lines) {
        if (stream === 'stderr') lastError = line.trim() || lastError;
        handleLine(line);
      }
    };

    child.stdout.on('data', chunk => processData('stdout', chunk));
    child.stderr.on('data', chunk => processData('stderr', chunk));

    const promise = new Promise((resolve, reject) => {
      child.on('close', (code, signal) => {
        for (const [stream, buffer] of Object.entries(buffers)) {
          if (buffer.trim()) {
            if (stream === 'stderr') lastError = buffer.trim() || lastError;
            handleLine(buffer);
          }
        }

        if (signal === 'SIGTERM' || signal === 'SIGINT') {
          return reject(new Error('Download cancelado pelo usuário'));
        }

        if (code === 0) {
          // Verify file size if path detected
          let fileSize = 0;
          if (detectedFilePath && fs.existsSync(detectedFilePath)) {
            try {
              fileSize = fs.statSync(detectedFilePath).size;
            } catch (_) {}
          }

          resolve({
            filePath: detectedFilePath,
            fileName: detectedFileName,
            fileSize
          });
        } else {
          reject(new Error(lastError || `Falha no download (código de saída: ${code})`));
        }
      });

      child.on('error', err => {
        reject(err);
      });
    });

    return {
      process: child,
      promise,
      cancel: () => {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
      }
    };
  }
}
