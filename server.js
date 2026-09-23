import os from 'node:os';
import app from './server/app.js';
import { config } from './server/config.js';

function getLocalIp() {
  let nets;
  try {
    nets = os.networkInterfaces();
  } catch (_) {
    return 'localhost';
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const server = app.listen(config.PORT, config.HOST, () => {
  const localIp = getLocalIp();
  console.log(`
╔══════════════════════════════════════════════════════════╗
║               MediaFetch Web Downloader                  ║
║        Sistema Web de Download e Extração de Mídia       ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Local:      http://localhost:${config.PORT}                      ║
║  Na Rede:    http://${localIp}:${config.PORT}                      ║
║                                                          ║
║  Pasta de Vídeos:  ${config.STORAGE_VIDEO_DIR}
║  Pasta de Áudios:  ${config.STORAGE_AUDIO_DIR}
║                                                          ║
║  Pressione Ctrl+C para encerrar o servidor               ║
╚══════════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Encerrando servidor gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nEncerrando servidor...');
  server.close(() => {
    process.exit(0);
  });
});
