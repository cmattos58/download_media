import { EventEmitter } from 'node:events';
import { dbService } from './db.js';
import { Downloader } from './downloader.js';
import { config } from './config.js';

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.activeWorkers = new Map(); // jobId -> { controller, startedAt }
    this.isPaused = false;
    this.concurrency = parseInt(dbService.getSetting('concurrency', config.DEFAULT_CONCURRENCY), 10);
  }

  setConcurrency(value) {
    this.concurrency = Math.max(1, Math.min(10, parseInt(value, 10) || 2));
    dbService.setSetting('concurrency', this.concurrency);
    this.tick();
  }

  pause() {
    this.isPaused = true;
    this.emit('queue:state', { isPaused: true });
  }

  resume() {
    this.isPaused = false;
    this.emit('queue:state', { isPaused: false });
    this.tick();
  }

  enqueue(jobData) {
    const job = dbService.createJob(this.applyDefaults(jobData));
    this.emit('job:created', job);

    // If metadata (title/thumbnail) is missing, fetch asynchronously to enrich UI
    if (!job.title) {
      Downloader.fetchInfo(job.url)
        .then(info => {
          const updated = dbService.updateJob(job.id, {
            title: info.title,
            thumbnail: info.thumbnail
          });
          this.emit('job:updated', updated);
        })
        .catch(() => {
          // Non-blocking: if info fetch fails, download will still proceed
        });
    }

    this.tick();
    return job;
  }

  enqueueBatch(items) {
    const createdJobs = [];
    for (const item of items) {
      const job = dbService.createJob(this.applyDefaults(item));
      createdJobs.push(job);
      this.emit('job:created', job);
      if (!job.title) {
        Downloader.fetchInfo(job.url)
          .then(info => {
            const updated = dbService.updateJob(job.id, {
              title: info.title,
              thumbnail: info.thumbnail
            });
            this.emit('job:updated', updated);
          })
          .catch(() => {});
      }
    }
    this.tick();
    return createdJobs;
  }

  applyDefaults(jobData) {
    const mediaType = jobData.mediaType === 'audio' ? 'audio' : 'video';
    const format = jobData.format || dbService.getSetting(
      mediaType === 'audio' ? 'defaultAudioFormat' : 'defaultVideoFormat',
      mediaType === 'audio' ? config.DEFAULT_AUDIO_FORMAT : config.DEFAULT_VIDEO_MERGE
    );
    const quality = jobData.quality || (mediaType === 'audio'
      ? dbService.getSetting('defaultAudioQuality', config.DEFAULT_AUDIO_QUALITY)
      : 'best');

    return { ...jobData, mediaType, format, quality };
  }

  cancel(jobId) {
    const job = dbService.getJob(jobId);
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return null;

    const active = this.activeWorkers.get(jobId);
    if (active) {
      active.controller.cancel();
      this.activeWorkers.delete(jobId);
    }

    const updated = dbService.updateJob(jobId, {
      status: 'cancelled',
      error_message: 'Cancelado pelo usuário',
      completed_at: new Date().toISOString()
    });

    this.emit('job:updated', updated);
    this.emit('job:cancelled', updated);
    this.tick();
    return updated;
  }

  retry(jobId) {
    const job = dbService.getJob(jobId);
    if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return null;

    const updated = dbService.updateJob(jobId, {
      status: 'queued',
      progress: 0,
      speed: '',
      eta: '',
      error_message: null,
      logs: '',
      started_at: null,
      completed_at: null
    });

    this.emit('job:updated', updated);
    this.tick();
    return updated;
  }

  async tick() {
    if (this.isPaused) return;
    if (this.activeWorkers.size >= this.concurrency) return;

    const queuedJobs = dbService.getQueuedJobs();
    if (!queuedJobs || queuedJobs.length === 0) return;

    const slotsAvailable = this.concurrency - this.activeWorkers.size;
    const toStart = queuedJobs.slice(0, slotsAvailable);

    for (const job of toStart) {
      this.processJob(job);
    }
  }

  async processJob(job) {
    const jobId = job.id;
    const startedAt = new Date().toISOString();

    dbService.updateJob(jobId, {
      status: 'running',
      started_at: startedAt
    });

    const currentJob = dbService.getJob(jobId);
    this.emit('job:updated', currentJob);
    this.emit('job:started', currentJob);

    let lastProgressUpdate = 0;

    const controller = Downloader.runJob(job, {
      onProgress: (progressData) => {
        const now = Date.now();
        // Throttle DB updates to 200ms to avoid locking SQLite WAL under high throughput
        if (now - lastProgressUpdate > 200 || progressData.progress === 100) {
          lastProgressUpdate = now;
          dbService.updateJob(jobId, {
            progress: progressData.progress,
            speed: progressData.speed,
            eta: progressData.eta,
            total_size: progressData.totalSize,
            downloaded_bytes: progressData.downloadedBytes
          });
        }

        this.emit('job:progress', {
          jobId,
          ...progressData
        });
      },

      onLog: (logLine) => {
        dbService.appendJobLog(jobId, logLine);
        this.emit('job:log', { jobId, log: logLine });
      },

      onFileName: (filePath, fileName) => {
        dbService.updateJob(jobId, {
          file_path: filePath,
          file_name: fileName
        });
      }
    });

    this.activeWorkers.set(jobId, {
      controller,
      startedAt
    });

    try {
      const result = await controller.promise;
      this.activeWorkers.delete(jobId);

      const completed = dbService.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        file_path: result.filePath,
        file_name: result.fileName,
        file_size: result.fileSize
      });

      this.emit('job:updated', completed);
      this.emit('job:completed', completed);
      this.emit('library:changed');
    } catch (err) {
      this.activeWorkers.delete(jobId);
      const isCancelled = err.message && err.message.includes('cancelado');
      const status = isCancelled ? 'cancelled' : 'failed';

      const failed = dbService.updateJob(jobId, {
        status,
        completed_at: new Date().toISOString(),
        error_message: err.message || 'Erro desconhecido durante o download'
      });

      this.emit('job:updated', failed);
      this.emit(isCancelled ? 'job:cancelled' : 'job:failed', failed);
    } finally {
      this.tick();
    }
  }

  getStats() {
    const jobs = dbService.getAllJobs(1000);
    return {
      activeCount: this.activeWorkers.size,
      concurrency: this.concurrency,
      isPaused: this.isPaused,
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length
    };
  }
}

export const queueManager = new JobQueue();
