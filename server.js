const express = require('express');
const { spawn } = require('child_process');
const pino = require('pino');

// ============== ЛОГГЕР ==============
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ============== КОНФИГУРАЦИЯ ==============
const config = {
  wallet: process.env.WALLET_ADDRESS,
  pool: process.env.POOL_URL || 'gulf.moneroocean.stream:10004',
  threads: parseInt(process.env.THREADS || '2'),
  rigName: process.env.RIG_NAME || `rig-${Math.random().toString(36).substring(7)}`,
  port: parseInt(process.env.PORT || '3000'),
};

if (!config.wallet) {
  logger.error('❌ WALLET_ADDRESS environment variable is required');
  process.exit(1);
}

// ============== HTTP СЕРВЕР ==============
const app = express();

// Health check для платформы
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    miner: minerStatus,
  });
});

// Главная страница с мониторингом
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>⛏️ XMRig Monitor</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
        .card { background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .stat { display: flex; justify-content: space-between; border-bottom: 1px solid #e9ecef; padding: 8px 0; }
        .stat:last-child { border-bottom: none; }
        .value { font-weight: bold; color: #0d6efd; }
        .online { color: #198754; }
        .offline { color: #dc3545; }
        #hashrate { font-size: 1.5em; }
      </style>
    </head>
    <body>
      <h1>⛏️ XMRig Cluster Monitor</h1>
      <div class="card">
        <div class="stat"><span>🟢 Status</span><span id="status" class="online">Loading...</span></div>
        <div class="stat"><span>⚡ Hashrate</span><span id="hashrate">Loading...</span></div>
        <div class="stat"><span>✅ Accepted Shares</span><span id="accepted">Loading...</span></div>
        <div class="stat"><span>❌ Rejected Shares</span><span id="rejected">Loading...</span></div>
        <div class="stat"><span>⏱ Uptime</span><span id="uptime">Loading...</span></div>
        <div class="stat"><span>🆔 Rig</span><span>${config.rigName}</span></div>
      </div>
      <p><small>Data updates every 5 seconds</small></p>
      <script>
        async function fetchStats() {
          try {
            const res = await fetch('/api/summary');
            const data = await res.json();
            document.getElementById('status').textContent = data.miner_running ? '🟢 Mining' : '🔴 Offline';
            document.getElementById('status').className = data.miner_running ? 'online' : 'offline';
            if (data.hashrate) {
              document.getElementById('hashrate').textContent = (data.hashrate / 1000).toFixed(2) + ' KH/s';
            }
            if (data.accepted !== undefined) {
              document.getElementById('accepted').textContent = data.accepted;
            }
            if (data.rejected !== undefined) {
              document.getElementById('rejected').textContent = data.rejected;
            }
            if (data.uptime) {
              const seconds = data.uptime;
              const hours = Math.floor(seconds / 3600);
              const minutes = Math.floor((seconds % 3600) / 60);
              const secs = Math.floor(seconds % 60);
              document.getElementById('uptime').textContent = \`\${hours}h \${minutes}m \${secs}s\`;
            }
          } catch (e) {
            console.error('Stats fetch error:', e);
          }
        }
        fetchStats();
        setInterval(fetchStats, 5000);
      </script>
    </body>
    </html>
  `);
});

// ============== API ДЛЯ СТАТИСТИКИ ==============
let minerStatus = {
  running: false,
  pid: null,
  hashrate: 0,
  accepted: 0,
  rejected: 0,
  uptime: 0,
};

app.get('/api/summary', (req, res) => {
  res.json({
    miner_running: minerStatus.running,
    hashrate: minerStatus.hashrate,
    accepted: minerStatus.accepted,
    rejected: minerStatus.rejected,
    uptime: minerStatus.uptime,
    pid: minerStatus.pid,
  });
});

// ============== ЗАПУСК МАЙНЕРА ==============
let minerProcess = null;

function startMiner() {
  logger.info({ config }, '🚀 Starting miner');

  minerProcess = spawn('/entrypoint.sh', [
    '-o', config.pool,
    '-u', config.wallet,
    '-p', 'x',
    '-k',
    '-t', String(config.threads),
    '--rig-id', config.rigName,
  ], {
    detached: false, // чтобы можно было перехватывать сигналы
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  minerStatus.running = true;
  minerStatus.pid = minerProcess.pid;
  minerStatus.uptime = 0;

  // Перехватываем stdout майнера
  minerProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    logger.info({ output }, 'Miner stdout');

    // Парсим хешрейт из лога (пример: "speed 10s/60s/15m 1259.7 1258.7 n/a H/s")
    const hashMatch = output.match(/speed\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+H\/s/);
    if (hashMatch) {
      minerStatus.hashrate = parseFloat(hashMatch[1]) || 0;
    }

    // Парсим принятые шары
    const acceptedMatch = output.match(/accepted\s+\((\d+)\/(\d+)\)/);
    if (acceptedMatch) {
      minerStatus.accepted = parseInt(acceptedMatch[1]) || 0;
      minerStatus.rejected = parseInt(acceptedMatch[2]) || 0;
    }
  });

  minerProcess.stderr.on('data', (data) => {
    logger.error({ output: data.toString().trim() }, 'Miner stderr');
  });

  minerProcess.on('error', (err) => {
    logger.error({ err }, '❌ Miner process error');
    minerStatus.running = false;
    restartMiner();
  });

  minerProcess.on('exit', (code, signal) => {
    logger.warn({ code, signal }, '⛔ Miner process exited');
    minerStatus.running = false;
    restartMiner();
  });

  // Обновляем uptime
  const uptimeInterval = setInterval(() => {
    if (minerStatus.running) {
      minerStatus.uptime += 1;
    }
  }, 1000);

  // Сохраняем интервал для очистки
  minerProcess._uptimeInterval = uptimeInterval;
}

function restartMiner() {
  logger.warn('🔄 Restarting miner in 3 seconds...');
  setTimeout(() => {
    if (minerProcess) {
      minerProcess.kill('SIGTERM');
      clearInterval(minerProcess._uptimeInterval);
    }
    startMiner();
  }, 3000);
}

// Корректное завершение
process.on('SIGTERM', () => {
  logger.warn('Received SIGTERM, shutting down...');
  if (minerProcess) {
    minerProcess.kill('SIGTERM');
    clearInterval(minerProcess._uptimeInterval);
  }
  process.exit(0);
});

// ============== СТАРТ СЕРВЕРА ==============
app.listen(config.port, '0.0.0.0', () => {
  logger.info({ port: config.port, rig: config.rigName }, '✅ HTTP server ready');
  startMiner();
});
