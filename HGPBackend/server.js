// app.js (your current file)
import express from 'express';
import net from 'net';
import { pool } from './DBconnect.js';

const app = express();

const ESP32_IP = '192.168.1.80';  // <-- put your ESP32 IP here
const ESP32_PORT = 3333;

// helper: send one line to ESP32 and close
function sendToESP32(line) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ESP32_IP, port: ESP32_PORT }, () => {
      socket.write(line.endsWith('\n') ? line : line + '\n');
      // small delay to ensure flush before close
      setTimeout(() => socket.end(), 50);
    });
    socket.on('error', reject);
    socket.on('end', resolve);
    socket.on('close', resolve);
  });
}

// --- your existing endpoints ---
app.get('/products', async (req, res) => {
  try {
    const rows = await pool.query('select * from cells');
    res.json(rows[0]);
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.get('/products/:RFID', async (req, res) => {
  try {
    const [rows] = await pool.query('select * from cells where RFID = ?', [req.params.RFID]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// --- NEW: hit this to send a row to Arduino via ESP32 ---
app.post('/notify/:RFID', async (req, res) => {
  try {
    const [rows] = await pool.query('select * from cells where RFID = ?', [req.params.RFID]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'RFID not found' });

    // keep it simple: send JSON as a single line
    const line = JSON.stringify(row);
    await sendToESP32(line);  // sends to Arduino via ESP32

    res.json({ ok: true, sent: row });
  } catch (err) {
    console.error('Notify error:', err);
    res.status(500).json({ error: 'Notify failed' });
  }
});

// optional: send arbitrary text
app.use(express.text({ type: '*/*' }));
app.post('/notify/raw', async (req, res) => {
  try {
    const payload = (req.body ?? '').toString();
    await sendToESP32(payload);
    res.json({ ok: true, sent: payload });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Raw notify failed' });
  }
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
  console.log('Try:   curl -X POST http://localhost:3000/notify/asdasda');
  console.log('Or:    curl -X POST http://localhost:3000/notify/raw -d "LED_ON"');
});