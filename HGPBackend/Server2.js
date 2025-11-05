// server.js
const WebSocket = require('ws');

const PORT = 3000;
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws, req) => {
  console.log('ESP32 connected from', req.socket.remoteAddress);

  ws.on('message', (msg) => {
    const text = msg.toString();
    console.log('[Arduino via ESP32] ', text);
  });

  ws.on('close', () => console.log('ESP32 disconnected'));
});

// Simple CLI: type in Node console and press Enter to send to ESP32/Arduino
process.stdin.setEncoding('utf8');
process.stdin.on('data', (line) => {
  const text = line.trim();
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  }
  if (text) console.log('[Sent to Arduino] ', text);
});

console.log('WebSocket server listening on ws://0.0.0.0:' + PORT);
