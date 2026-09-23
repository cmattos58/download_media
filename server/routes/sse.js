import { queueManager } from '../queue.js';

const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevent Nginx reverse proxy buffering
  });

  res.write(': connected\n\n');
  clients.add(res);

  // Send initial stats
  res.write(`event: stats\ndata: ${JSON.stringify(queueManager.getStats())}\n\n`);

  req.on('close', () => {
    clients.delete(res);
  });
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (_) {
      clients.delete(client);
    }
  }
}

// Attach queueManager events to SSE broadcast
queueManager.on('job:created', job => broadcast('job:created', job));
queueManager.on('job:updated', job => {
  broadcast('job:updated', job);
  broadcast('stats', queueManager.getStats());
});
queueManager.on('job:progress', progress => broadcast('job:progress', progress));
queueManager.on('job:log', logData => broadcast('job:log', logData));
queueManager.on('job:started', job => {
  broadcast('job:started', job);
  broadcast('stats', queueManager.getStats());
});
queueManager.on('job:completed', job => {
  broadcast('job:completed', job);
  broadcast('stats', queueManager.getStats());
});
queueManager.on('job:failed', job => {
  broadcast('job:failed', job);
  broadcast('stats', queueManager.getStats());
});
queueManager.on('job:cancelled', job => {
  broadcast('job:cancelled', job);
  broadcast('stats', queueManager.getStats());
});
queueManager.on('library:changed', () => broadcast('library:changed', {}));
queueManager.on('queue:state', state => broadcast('queue:state', state));

// Keep-alive heartbeat every 15 seconds
setInterval(() => {
  for (const client of clients) {
    try {
      client.write(': heartbeat\n\n');
    } catch (_) {
      clients.delete(client);
    }
  }
}, 15000);
