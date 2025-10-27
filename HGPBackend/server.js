import express from 'express';
import { pool } from './DBconnect.js';
const app = express();

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




app.listen(3000,()=>{console.log('Server is running on port 3000')});