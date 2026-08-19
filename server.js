const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = process.env.PORT || 3000;

// Прокси для веб-интерфейса xmrig-workers (порт 3001)
app.use('/workers', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: { '^/workers': '' },
}));

// Прокси для API XMRig (порт 3000) – можно использовать для своих скриптов
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}));

// Стартовая страница с описанием
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>XMRig Monitor</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h1>⛏️ XMRig Monitor</h1>
        <p>Майнер запущен и работает.</p>
        <p><a href="/workers" target="_blank">📊 Открыть xmrig-workers (веб-интерфейс)</a></p>
        <p><a href="/api" target="_blank">📡 Открыть API майнера</a></p>
        <p style="margin-top: 40px; color: #888; font-size: 0.9rem;">Данные обновляются в реальном времени.</p>
      </body>
    </html>
  `);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Proxy server running on port ${port}`);
});