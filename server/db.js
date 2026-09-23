import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(config.DB_PATH);

// Initialize schema
db.exec(`
  PRAGMA journal_mode = WAL;
  
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    thumbnail TEXT,
    media_type TEXT NOT NULL DEFAULT 'video',
    format TEXT,
    quality TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    progress REAL DEFAULT 0,
    speed TEXT DEFAULT '',
    eta TEXT DEFAULT '',
    total_size TEXT DEFAULT '',
    downloaded_bytes TEXT DEFAULT '',
    file_path TEXT,
    file_name TEXT,
    file_size INTEGER DEFAULT 0,
    error_message TEXT,
    logs TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Reset any jobs left in 'running' state on server restart back to 'queued' or 'cancelled'
db.exec(`
  UPDATE jobs 
  SET status = 'cancelled', error_message = 'Interrompido por reinicialização do servidor' 
  WHERE status = 'running';
`);

export const dbService = {
  createJob({ url, title = '', thumbnail = '', mediaType = 'video', format = '', quality = '' }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO jobs (id, url, title, thumbnail, media_type, format, quality, status, progress, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?)
    `);
    stmt.run(id, url, title, thumbnail, mediaType, format, quality, now);
    return this.getJob(id);
  },

  getJob(id) {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    return stmt.get(id);
  },

  getAllJobs(limit = 100) {
    const safeLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 100));
    const stmt = db.prepare('SELECT * FROM jobs ORDER BY datetime(created_at) DESC LIMIT ?');
    return stmt.all(safeLimit);
  },

  getQueuedJobs() {
    const stmt = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY datetime(created_at) ASC");
    return stmt.all();
  },

  updateJob(id, fields) {
    const allowedColumns = new Set([
      'title', 'thumbnail', 'media_type', 'format', 'quality', 'status', 'progress',
      'speed', 'eta', 'total_size', 'downloaded_bytes', 'file_path', 'file_name',
      'file_size', 'error_message', 'logs', 'started_at', 'completed_at'
    ]);
    const keys = Object.keys(fields).filter(key => allowedColumns.has(key));
    if (keys.length === 0) return this.getJob(id);

    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);

    const stmt = db.prepare(`UPDATE jobs SET ${setClauses} WHERE id = ?`);
    stmt.run(...values);
    return this.getJob(id);
  },

  appendJobLog(id, logLine) {
    const stmt = db.prepare(`
      UPDATE jobs 
      SET logs = substr(coalesce(logs, '') || ? || char(10), -50000)
      WHERE id = ?
    `);
    stmt.run(logLine, id);
  },

  deleteJob(id) {
    const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
    stmt.run(id);
  },

  clearCompleted() {
    const stmt = db.prepare("DELETE FROM jobs WHERE status IN ('completed', 'cancelled', 'failed')");
    stmt.run();
  },

  getSetting(key, defaultValue = null) {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : defaultValue;
  },

  setSetting(key, value) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, String(value));
  }
};
