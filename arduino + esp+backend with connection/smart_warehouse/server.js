// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;

// ======== CONFIG ========

// ESP32 base URL will be set dynamically when ESP32 calls /api/esp32/register
let ESP32_BASE_URL = null;

// MySQL config
const dbConfig = {
  host: "127.0.0.1",
  port: 3000,
  user: "root",
  password: "123456",
  database: "smart_warehouse"
};

// ======== MIDDLEWARE ========
app.use(express.json());

// لو index.html في نفس فولدر server.js:
app.use(express.static(path.join(__dirname, "")));

// Simple login middleware (one admin, no sessions for simplicity)
async function authMiddleware(req, res, next) {
  // For now, we'll skip real auth and assume always admin.
  // You can later add JWT / session here.
  next();
}

// ======== DB HELPER ========
async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

// ======== HELPER: send command to ESP32 ========
async function sendCommandToESP32(cmd) {
  if (!ESP32_BASE_URL) {
    console.error("ESP32_BASE_URL is not set. ESP32 not registered yet.");
    return {
      ok: false,
      response: "ESP32 not registered. Call /api/esp32/register first."
    };
  }

  try {
    const url = `${ESP32_BASE_URL}/cmd?c=${encodeURIComponent(cmd)}`;
    console.log("Sending to ESP32:", url);
    const res = await fetch(url);
    const text = await res.text();
    return { ok: res.ok, response: text };
  } catch (err) {
    console.error("Error contacting ESP32:", err);
    return { ok: false, response: String(err) };
  }
}

// ======== ROUTES ========

// Root: always send index.html (frontend)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "", "index.html"));
});

// Simple health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- ESP32 REGISTER ROUTE ---
// ESP32 calls: GET http://<PC_IP>:5001/api/esp32/register?ip=<ESP32_IP>
app.get("/api/esp32/register", (req, res) => {
  const ip = req.query.ip;
  if (!ip) {
    return res.status(400).json({ error: "Missing 'ip' query param" });
  }

  ESP32_BASE_URL = `http://${ip}`;
  console.log("ESP32 registered with IP:", ESP32_BASE_URL);

  res.json({ ok: true, esp32_base_url: ESP32_BASE_URL });
});

// -------- CELLS + PRODUCTS --------

// Get all cells with product info
app.get("/api/cells", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query(
      `SELECT c.id as cell_id, c.row_num, c.col_num, c.label,
              cp.quantity,
              p.id as product_id, p.name as product_name, p.sku, p.rfid_uid
       FROM cells c
       LEFT JOIN cell_products cp ON cp.cell_id = c.id
       LEFT JOIN products p ON cp.product_id = p.id
       ORDER BY c.row_num, c.col_num`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/cells error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// Get all products
app.get("/api/products", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query("SELECT * FROM products ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// Add product
app.post("/api/products", authMiddleware, async (req, res) => {
  const { name, sku, rfid_uid } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  let conn;
  try {
    conn = await getConnection();
    const [result] = await conn.query(
      "INSERT INTO products (name, sku, rfid_uid) VALUES (?, ?, ?)",
      [name, sku || null, rfid_uid || null]
    );
    res.json({ id: result.insertId, name, sku, rfid_uid });
  } catch (err) {
    console.error("POST /api/products error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// Assign product to cell
app.post("/api/cells/:cellId/assign", authMiddleware, async (req, res) => {
  const { cellId } = req.params;
  const { product_id, quantity } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" });
  }

  let conn;
  try {
    conn = await getConnection();
    await conn.query(
      `INSERT INTO cell_products (cell_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE product_id = VALUES(product_id),
                                 quantity = VALUES(quantity)`,
      [cellId, product_id, quantity || 1]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/cells/:cellId/assign error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// Clear cell
app.post("/api/cells/:cellId/clear", authMiddleware, async (req, res) => {
  const { cellId } = req.params;
  let conn;
  try {
    conn = await getConnection();
    await conn.query("DELETE FROM cell_products WHERE cell_id = ?", [cellId]);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/cells/:cellId/clear error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// -------- OPERATIONS + ESP32 --------

// List operations (latest 50)
app.get("/api/operations", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query(
      `SELECT o.*, p.name AS product_name, c.label AS cell_label
       FROM operations o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN cells c ON o.cell_id = c.id
       ORDER BY o.id DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/operations error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// Create an operation + send to ESP32
// Example body:
// { "op_type": "PLACE_IN_CELL", "product_id": 1, "cell_id": 5, "cmd": "PLACE 2 3" }
app.post("/api/operations", authMiddleware, async (req, res) => {
  const { op_type, product_id, cell_id, cmd } = req.body;

  if (!op_type || !cmd) {
    return res.status(400).json({ error: "op_type and cmd are required" });
  }

  let conn;
  try {
    conn = await getConnection();

    // Insert pending operation
    const [result] = await conn.query(
      "INSERT INTO operations (op_type, product_id, cell_id, cmd, status) VALUES (?, ?, ?, ?, 'PENDING')",
      [op_type, product_id || null, cell_id || null, cmd]
    );
    const opId = result.insertId;

    // Send command to ESP32
    const { ok, response } = await sendCommandToESP32(cmd);

    if (ok) {
      await conn.query(
        "UPDATE operations SET status = 'DONE', completed_at = NOW() WHERE id = ?",
        [opId]
      );
    } else {
      await conn.query(
        "UPDATE operations SET status = 'ERROR', error_message = ? WHERE id = ?",
        [response, opId]
      );
    }

    res.json({ id: opId, ok, response });
  } catch (err) {
    console.error("POST /api/operations error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// Optional: Direct command endpoint just for testing ESP32 from frontend
// GET /api/cmd?c=HOME
app.get("/api/cmd", authMiddleware, async (req, res) => {
  const cmd = req.query.c;
  if (!cmd) {
    return res.status(400).json({ error: "Missing 'c' query param" });
  }

  const { ok, response } = await sendCommandToESP32(cmd);
  res.json({ ok, response });
});

// -------- 404 for APIs --------
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// ======== START SERVER ========
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
