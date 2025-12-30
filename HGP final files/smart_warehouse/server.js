// FILE: server.js - COMPLETE UPDATED VERSION
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;

// ======== MIDDLEWARE ========
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ======== DATABASE CONFIG ========
const dbConfig = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "123456",
  database: "smart_warehouse",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// ======== ESP32 CONFIG ========
let ESP32_BASE_URL = null;
let isESP32Connected = false;

// Current sensor data
let currentSensorData = {
  ldr1: false,
  ldr2: false,
  rfid: null,
  conveyorState: "IDLE",
  armStatus: "READY",
  currentOperation: "",
  loadingZoneOccupied: false,
  storageStrategy: "NEAREST_EMPTY",
  cells: Array(3).fill().map(() => Array(4).fill(false)),
  lastUpdate: null
};

// Arm state
const armState = {
  status: "READY",
  mode: "manual",
  currentOperation: null,
  currentCell: null,
  currentProduct: null,
  storageStrategy: "NEAREST_EMPTY"
};

// ======== WEBSOCKET SERVER ========
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("WebSocket client connected");

  ws.send(JSON.stringify({
    type: "init",
    armState,
    sensorData: currentSensorData,
    esp32Connected: isESP32Connected,
    timestamp: new Date().toISOString()
  }));

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      handleClientMessage(ws, message);
    } catch (error) {
      console.error("Error parsing client message:", error);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("WebSocket client disconnected");
  });
});

function handleClientMessage(ws, message) {
  switch (message.type) {
    case "request_sensor_data":
    case "request_sensor_update":
      ws.send(JSON.stringify({
        type: "sensor_update",
        data: currentSensorData
      }));
      break;
    case "refresh_data":
      broadcastWarehouseData();
      break;
    case "set_strategy":
      setStorageStrategy(message.strategy);
      break;
    default:
      console.log("Unknown client message:", message);
  }
}

// ======== STORAGE STRATEGY ========
async function setStorageStrategy(strategy) {
  armState.storageStrategy = strategy;
  currentSensorData.storageStrategy = strategy;

  // Send to ESP32
  if (ESP32_BASE_URL && isESP32Connected) {
    try {
      const command = `STRATEGY ${strategy.toUpperCase().replace('_', ' ')}`;
      const url = `${ESP32_BASE_URL}/cmd?c=${encodeURIComponent(command)}`;
      await fetch(url, { timeout: 5000 });
    } catch (error) {
      console.error("Failed to send strategy to ESP32:", error);
    }
  }

  broadcast({
    type: "strategy_update",
    strategy,
    timestamp: new Date().toISOString()
  });
}

// ======== DATABASE INITIALIZATION ========
async function initializeDatabase() {
  try {
    console.log("Initializing database...");

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cells (
        id INT AUTO_INCREMENT PRIMARY KEY,
        row_num INT NOT NULL,
        col_num INT NOT NULL,
        label VARCHAR(50) NOT NULL,
        product_id INT NULL,
        quantity INT DEFAULT 0,
        status ENUM('EMPTY', 'OCCUPIED', 'RESERVED') DEFAULT 'EMPTY',
        ir_sensor_pin INT NULL,
        last_sensor_check TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (row_num, col_num)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        sku VARCHAR(100) NULL,
        rfid_uid VARCHAR(100) NULL,
        category VARCHAR(50) NULL,
        auto_assign BOOLEAN DEFAULT TRUE,
        storage_strategy ENUM('NEAREST_EMPTY', 'ROUND_ROBIN', 'RANDOM', 'AI_OPTIMIZED', 'FIXED') DEFAULT 'NEAREST_EMPTY',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS operations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        op_type ENUM(
          'HOME',
          'PICK_FROM_CONVEYOR',
          'PLACE_IN_CELL',
          'TAKE_FROM_CELL',
          'GOTO_COLUMN',
          'MANUAL_CMD',
          'MOVE_TO_LOADING',
          'RETURN_TO_LOADING',
          'AUTO_STOCK',
          'AUTO_RETRIEVE',
          'INVENTORY_CHECK',
          'LOADING_ZONE_OPERATION',
          'CONVEYOR_MANUAL'
        ) NOT NULL,
        product_id INT NULL,
        cell_id INT NULL,
        cmd VARCHAR(100) NOT NULL,
        status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'ERROR', 'CANCELLED') DEFAULT 'PENDING',
        error_message VARCHAR(255) NULL,
        execution_time_ms INT NULL,
        priority ENUM('LOW', 'MEDIUM', 'HIGH') DEFAULT 'MEDIUM',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS loading_zone (
        id INT PRIMARY KEY DEFAULT 1,
        product_id INT NULL,
        quantity INT DEFAULT 0,
        ultrasonic_distance INT NULL,
        servo_position INT DEFAULT 90,
        status ENUM('EMPTY', 'OCCUPIED', 'PROCESSING') DEFAULT 'EMPTY',
        last_checked TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conveyor_status (
        id INT PRIMARY KEY DEFAULT 1,
        has_product BOOLEAN DEFAULT FALSE,
        product_id INT NULL,
        product_rfid VARCHAR(100) NULL,
        mode ENUM('AUTO', 'MANUAL') DEFAULT 'AUTO',
        state ENUM('IDLE', 'MOVE_12CM', 'WAIT_RFID', 'MOVING_TO_LDR2', 'STOPPED', 'MANUAL_MODE') DEFAULT 'IDLE',
        last_detected_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_type ENUM('STOCK', 'RETRIEVE', 'MOVE', 'ORGANIZE', 'INVENTORY_CHECK', 'LOADING_ZONE_OP') NOT NULL,
        cell_id INT NULL,
        product_id INT NULL,
        product_rfid VARCHAR(100) NULL,
        quantity INT DEFAULT 1,
        priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
        status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
        storage_strategy ENUM('NEAREST_EMPTY', 'ROUND_ROBIN', 'RANDOM', 'AI_OPTIMIZED', 'FIXED') DEFAULT 'NEAREST_EMPTY',
        parameters JSON NULL,
        scheduled_at TIMESTAMP NULL,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        error_message VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Initialize cells (3 rows x 4 columns) with IR sensor pins
    const [cellsCount] = await pool.query("SELECT COUNT(*) as count FROM cells");
    if (cellsCount[0].count === 0) {
      const cells = [
        // Row 1
        [1, 1, 'R1C1', 53],
        [1, 2, 'R1C2', 31],
        [1, 3, 'R1C3', 23],
        [1, 4, 'R1C4', 30],
        // Row 2
        [2, 1, 'R2C1', 52],
        [2, 2, 'R2C2', 32],
        [2, 3, 'R2C3', 33],
        [2, 4, 'R2C4', 34],
        // Row 3
        [3, 1, 'R3C1', 35],
        [3, 2, 'R3C2', 25],
        [3, 3, 'R3C3', 40],
        [3, 4, 'R3C4', 22]
      ];

      await pool.query(
        "INSERT INTO cells (row_num, col_num, label, ir_sensor_pin) VALUES ?",
        [cells]
      );
      console.log("Seeded cells table with IR sensor pins");
    }

    // Initialize loading zone with ultrasonic and servo info
    const [loadingZoneCount] = await pool.query("SELECT COUNT(*) as count FROM loading_zone WHERE id = 1");
    if (loadingZoneCount[0].count === 0) {
      await pool.query(`
        INSERT INTO loading_zone (id, product_id, quantity, ultrasonic_distance, servo_position, status) 
        VALUES (1, NULL, 0, NULL, 90, 'EMPTY')
      `);
      console.log("Seeded loading_zone table");
    }

    // Initialize conveyor status
    const [conveyorCount] = await pool.query("SELECT COUNT(*) as count FROM conveyor_status WHERE id = 1");
    if (conveyorCount[0].count === 0) {
      await pool.query(`
        INSERT INTO conveyor_status (id, has_product, product_id, mode, state) 
        VALUES (1, FALSE, NULL, 'MANUAL', 'IDLE')
      `);
      console.log("Seeded conveyor_status table");
    }

    // Add storage strategy setting
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT PRIMARY KEY DEFAULT 1,
        storage_strategy ENUM('NEAREST_EMPTY', 'ROUND_ROBIN', 'RANDOM', 'AI_OPTIMIZED', 'FIXED') DEFAULT 'NEAREST_EMPTY',
        auto_mode BOOLEAN DEFAULT FALSE,
        conveyor_manual_control BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const [settingsCount] = await pool.query("SELECT COUNT(*) as count FROM system_settings WHERE id = 1");
    if (settingsCount[0].count === 0) {
      await pool.query(`
        INSERT INTO system_settings (id, storage_strategy, auto_mode, conveyor_manual_control) 
        VALUES (1, 'NEAREST_EMPTY', FALSE, FALSE)
      `);
      console.log("Seeded system_settings table");
    }

    console.log("✅ Database initialized successfully");

  } catch (err) {
    console.error("Error initializing DB:", err);
  }
}

// ======== ESP32 REGISTRATION ========
app.get("/api/esp32/register", (req, res) => {
  const { ip } = req.query;
  if (!ip) {
    return res.status(400).json({
      success: false,
      error: "Missing 'ip' query parameter"
    });
  }

  ESP32_BASE_URL = `http://${ip}`;
  isESP32Connected = true;
  console.log(`✅ ESP32 registered at ${ESP32_BASE_URL}`);

  broadcast({
    type: "esp32_status",
    connected: true,
    url: ESP32_BASE_URL
  });

  res.json({
    success: true,
    esp32_base_url: ESP32_BASE_URL,
    message: "ESP32 registered successfully"
  });
});

app.get("/api/esp32/status", (req, res) => {
  res.json({
    connected: isESP32Connected,
    url: ESP32_BASE_URL,
    last_sensor_update: currentSensorData.lastUpdate,
    storage_strategy: armState.storageStrategy
  });
});

// ======== HELPER: SEND COMMAND TO ESP32 ========
async function sendCommandToESP32(command) {
  if (!ESP32_BASE_URL) {
    throw new Error("ESP32 not registered. Use /api/esp32/register");
  }

  const url = `${ESP32_BASE_URL}/cmd?c=${encodeURIComponent(command)}`;
  console.log(`[Node → ESP32] ${command}`);

  try {
    const resp = await fetch(url, { timeout: 10000 });
    const text = await resp.text();

    if (!resp.ok) {
      throw new Error(`ESP32 HTTP ${resp.status}: ${text}`);
    }

    return { success: true, message: text };
  } catch (err) {
    console.error("Error sending command to ESP32:", err.message);
    isESP32Connected = false;
    throw err;
  }
}

// ======== SENSOR API - UPDATED ========
app.post("/api/sensors/update", async (req, res) => {
  try {
    const {
      ldr1,
      ldr2,
      rfid,
      conveyorState,
      armStatus,
      currentOperation,
      loadingZoneOccupied,
      storageStrategy,
      cells
    } = req.body;

    // Update sensor data
    currentSensorData = {
      ldr1: !!ldr1,
      ldr2: !!ldr2,
      rfid: rfid || null,
      conveyorState: conveyorState || "IDLE",
      armStatus: armStatus || "READY",
      currentOperation: currentOperation || "",
      loadingZoneOccupied: !!loadingZoneOccupied,
      storageStrategy: storageStrategy || "NEAREST_EMPTY",
      cells: cells || Array(3).fill().map(() => Array(4).fill(false)),
      lastUpdate: new Date().toISOString()
    };

    // Update arm state
    if (armStatus) {
      armState.status = armStatus;
    }

    if (currentOperation) {
      armState.currentOperation = currentOperation;
    }

    // Update storage strategy
    if (storageStrategy && storageStrategy !== armState.storageStrategy) {
      armState.storageStrategy = storageStrategy;
      await pool.query(
        "UPDATE system_settings SET storage_strategy = ? WHERE id = 1",
        [storageStrategy]
      );
    }

    // Broadcast updates
    broadcast({
      type: "sensor_update",
      data: currentSensorData
    });

    broadcast({
      type: "arm_status",
      armState
    });

    // Update conveyor status
    if (ldr1 || ldr2) {
      await pool.query(
        `UPDATE conveyor_status 
         SET has_product = TRUE, 
             state = ?,
             last_detected_at = NOW() 
         WHERE id = 1`,
        [conveyorState || "IDLE"]
      );

      // If RFID detected, update product association
      if (rfid) {
        const [products] = await pool.query(
          "SELECT * FROM products WHERE rfid_uid = ?",
          [rfid]
        );

        if (products.length > 0) {
          const product = products[0];
          await pool.query(
            `UPDATE conveyor_status 
             SET product_id = ?, 
                 product_rfid = ? 
             WHERE id = 1`,
            [product.id, rfid]
          );

          broadcast({
            type: "rfid_detected",
            tag: rfid,
            symbol: product.name ? product.name.charAt(0).toUpperCase() : "?",
            product: product,
            targetCell: null
          });
        }
      }
    } else {
      await pool.query(
        `UPDATE conveyor_status 
         SET has_product = FALSE, 
             state = ?,
             last_detected_at = NOW() 
         WHERE id = 1`,
        [conveyorState || "IDLE"]
      );
    }

    // Update loading zone status
    await pool.query(
      `UPDATE loading_zone 
       SET status = ?,
           last_checked = NOW(),
           updated_at = NOW()
       WHERE id = 1`,
      [loadingZoneOccupied ? 'OCCUPIED' : 'EMPTY']
    );

    // Update cell occupancy from IR sensors
    if (cells && Array.isArray(cells)) {
      for (let i = 0; i < cells.length; i++) {
        const rowCells = cells[i];
        if (Array.isArray(rowCells)) {
          for (let j = 0; j < rowCells.length; j++) {
            const occupied = rowCells[j];
            const row = i + 1;
            const col = j + 1;

            // Update cell in database
            await pool.query(
              `UPDATE cells 
               SET status = ?,
                   last_sensor_check = NOW(),
                   updated_at = NOW()
               WHERE row_num = ? AND col_num = ?`,
              [occupied ? 'OCCUPIED' : 'EMPTY', row, col]
            );
          }
        }
      }
    }

    // Get updated conveyor status
    const [conveyorRows] = await pool.query(`
      SELECT cs.*, p.name as product_name, p.sku
      FROM conveyor_status cs
      LEFT JOIN products p ON cs.product_id = p.id
      WHERE cs.id = 1
    `);

    broadcast({
      type: "conveyor_update",
      product: conveyorRows[0]
    });

    // Get updated loading zone status
    const [loadingZoneRows] = await pool.query(`
      SELECT lz.*, p.name as product_name, p.sku
      FROM loading_zone lz
      LEFT JOIN products p ON lz.product_id = p.id
      WHERE lz.id = 1
    `);

    broadcast({
      type: "loading_zone_update",
      data: loadingZoneRows[0]
    });

    // Update warehouse data
    broadcastWarehouseData();

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating sensors:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/sensors", async (req, res) => {
  res.json(currentSensorData);
});

// ======== STORAGE STRATEGY API ========
app.get("/api/storage-strategy", async (req, res) => {
  try {
    const [settings] = await pool.query(
      "SELECT storage_strategy FROM system_settings WHERE id = 1"
    );

    res.json({
      strategy: settings[0]?.storage_strategy || "NEAREST_EMPTY",
      available_strategies: [
        "NEAREST_EMPTY",
        "ROUND_ROBIN",
        "RANDOM",
        "AI_OPTIMIZED",
        "FIXED"
      ]
    });
  } catch (err) {
    console.error("Error getting storage strategy:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/storage-strategy", async (req, res) => {
  try {
    const { strategy } = req.body;

    const validStrategies = ["NEAREST_EMPTY", "ROUND_ROBIN", "RANDOM", "AI_OPTIMIZED", "FIXED"];

    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({
        error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`
      });
    }

    // Update database
    await pool.query(
      "UPDATE system_settings SET storage_strategy = ? WHERE id = 1",
      [strategy]
    );

    // Update local state
    armState.storageStrategy = strategy;
    currentSensorData.storageStrategy = strategy;

    // Send to ESP32 if connected
    if (ESP32_BASE_URL && isESP32Connected) {
      try {
        const command = `STRATEGY ${strategy.replace('_', ' ')}`;
        await sendCommandToESP32(command);
      } catch (err) {
        console.error("Failed to send strategy to ESP32:", err);
      }
    }

    broadcast({
      type: "strategy_update",
      strategy,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, strategy });
  } catch (err) {
    console.error("Error setting storage strategy:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======== CONVEYOR MANUAL CONTROL API ========
app.post("/api/conveyor/manual", async (req, res) => {
  try {
    const { action } = req.body;

    if (!ESP32_BASE_URL || !isESP32Connected) {
      return res.status(400).json({
        success: false,
        error: "ESP32 not connected"
      });
    }

    let command;
    switch (action) {
      case "move":
        command = "CONVEYOR_MOVE";
        break;
      case "stop":
        command = "CONVEYOR_STOP";
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid action. Use 'move' or 'stop'"
        });
    }

    const result = await sendCommandToESP32(command);

    // Update conveyor status
    await pool.query(
      `UPDATE conveyor_status 
       SET mode = 'MANUAL',
           state = ?,
           updated_at = NOW()
       WHERE id = 1`,
      [action === "move" ? "MANUAL_MODE" : "IDLE"]
    );

    res.json({
      success: true,
      action,
      message: `Conveyor ${action} command sent`
    });
  } catch (err) {
    console.error("Error controlling conveyor:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======== LOADING ZONE API - UPDATED ========
app.get("/api/loading-zone", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT lz.*, p.name AS product_name, p.sku, p.rfid_uid
      FROM loading_zone lz
      LEFT JOIN products p ON lz.product_id = p.id
      WHERE lz.id = 1
    `);

    const data = rows[0] || {
      id: 1,
      product_id: null,
      product_name: null,
      sku: null,
      rfid_uid: null,
      quantity: 0,
      ultrasonic_distance: null,
      servo_position: 90,
      status: 'EMPTY',
      last_checked: null,
      updated_at: new Date().toISOString()
    };

    res.json(data);
  } catch (err) {
    console.error("Error /api/loading-zone GET:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/loading-zone/control", async (req, res) => {
  try {
    const { action } = req.body;

    if (!ESP32_BASE_URL || !isESP32Connected) {
      return res.status(400).json({
        success: false,
        error: "ESP32 not connected"
      });
    }

    let command;
    switch (action) {
      case "open":
        command = "LOADING_OPEN";
        await pool.query(
          "UPDATE loading_zone SET servo_position = 180, updated_at = NOW() WHERE id = 1"
        );
        break;
      case "close":
        command = "LOADING_CLOSE";
        await pool.query(
          "UPDATE loading_zone SET servo_position = 90, updated_at = NOW() WHERE id = 1"
        );
        break;
      case "check":
        command = "CHECK_LOADING";
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid action. Use 'open', 'close', or 'check'"
        });
    }

    const result = await sendCommandToESP32(command);

    res.json({
      success: true,
      action,
      message: `Loading zone ${action} command sent`
    });
  } catch (err) {
    console.error("Error controlling loading zone:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======== CELLS API - UPDATED WITH IR SENSOR INFO ========
app.get("/api/cells", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.*,
        p.name AS product_name,
        p.sku,
        p.rfid_uid,
        CASE 
          WHEN c.product_id IS NOT NULL THEN 'OCCUPIED' 
          ELSE 'EMPTY' 
        END AS display_status,
        CASE
          WHEN c.ir_sensor_pin IS NOT NULL THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END AS sensor_status
      FROM cells c
      LEFT JOIN products p ON c.product_id = p.id
      ORDER BY c.row_num, c.col_num
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error /api/cells:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/cells/sensors", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        row_num,
        col_num,
        label,
        ir_sensor_pin,
        status,
        last_sensor_check
      FROM cells
      WHERE ir_sensor_pin IS NOT NULL
      ORDER BY row_num, col_num
    `);

    const sensorData = rows.map(cell => ({
      row: cell.row_num,
      col: cell.col_num,
      label: cell.label,
      pin: cell.ir_sensor_pin,
      status: cell.status,
      lastChecked: cell.last_sensor_check,
      occupied: cell.status === 'OCCUPIED'
    }));

    res.json(sensorData);
  } catch (err) {
    console.error("Error /api/cells/sensors:", err);
    res.status(500).json({ error: "Database error" });
  }
});
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, sku, rfid_uid, category, auto_assign, storage_strategy, created_at, updated_at
      FROM products
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error /api/products:", err);
    res.status(500).json({ error: "Database error" });
  }
});
app.get("/api/operations", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 200);

    const [rows] = await pool.query(`
      SELECT o.*,
             c.label AS cell_label,
             p.name  AS product_name
      FROM operations o
      LEFT JOIN cells c ON o.cell_id = c.id
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY o.id DESC
      LIMIT ?
    `, [limit]);

    res.json(rows);
  } catch (err) {
    console.error("Error /api/operations GET:", err);
    res.status(500).json({ error: "Database error" });
  }
});
app.get("/api/conveyor-status", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cs.*, p.name AS product_name, p.sku
      FROM conveyor_status cs
      LEFT JOIN products p ON cs.product_id = p.id
      WHERE cs.id = 1
      LIMIT 1
    `);

    res.json(rows[0] || { id: 1, has_product: false, product_id: null, mode: "MANUAL", state: "IDLE" });
  } catch (err) {
    console.error("Error /api/conveyor-status:", err);
    res.status(500).json({ error: "Database error" });
  }
});
app.get("/api/auto-tasks", async (req, res) => {
  try {
    const status = req.query.status || null;

    let sql = `
      SELECT t.*, c.label AS cell_label, p.name AS product_name
      FROM auto_tasks t
      LEFT JOIN cells c ON t.cell_id = c.id
      LEFT JOIN products p ON t.product_id = p.id
    `;
    const params = [];

    if (status) {
      sql += ` WHERE t.status = ? `;
      params.push(status);
    }

    sql += ` ORDER BY t.id DESC LIMIT 200 `;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error /api/auto-tasks GET:", err);
    res.status(500).json({ error: "Database error" });
  }
});


// ======== PRODUCTS API (MISSING) ========
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, sku, rfid_uid, category, auto_assign, storage_strategy, created_at, updated_at
      FROM products
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/products:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const { name, sku, rfid_uid, category, auto_assign, storage_strategy } = req.body;

    if (!name || String(name).trim() === "") {
      return res.status(400).json({ success: false, error: "Product name is required" });
    }

    const validStrategies = ["NEAREST_EMPTY", "ROUND_ROBIN", "RANDOM", "AI_OPTIMIZED", "FIXED"];
    const strategy = storage_strategy && validStrategies.includes(storage_strategy)
      ? storage_strategy
      : "NEAREST_EMPTY";

    const [result] = await pool.query(
      `INSERT INTO products (name, sku, rfid_uid, category, auto_assign, storage_strategy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        sku ? String(sku).trim() : null,
        rfid_uid ? String(rfid_uid).trim() : null,
        category ? String(category).trim() : null,
        auto_assign === undefined ? true : !!auto_assign,
        strategy
      ]
    );

    const [rows] = await pool.query(
      `SELECT id, name, sku, rfid_uid, category, auto_assign, storage_strategy, created_at, updated_at
       FROM products WHERE id = ?`,
      [result.insertId]
    );

    res.json({ success: true, product: rows[0] });
  } catch (err) {
    console.error("Error POST /api/products:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// ======== OPERATIONS GET API (MISSING) ========
app.get("/api/operations", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));

    const [rows] = await pool.query(
      `
      SELECT 
        o.*,
        c.label AS cell_label,
        p.name AS product_name
      FROM operations o
      LEFT JOIN cells c ON o.cell_id = c.id
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY o.id DESC
      LIMIT ?
      `,
      [limit]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/operations:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ======== CONVEYOR STATUS GET API (MISSING) ========
app.get("/api/conveyor-status", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cs.*, p.name AS product_name, p.sku, p.rfid_uid
      FROM conveyor_status cs
      LEFT JOIN products p ON cs.product_id = p.id
      WHERE cs.id = 1
    `);

    res.json(rows[0] || {
      id: 1,
      has_product: false,
      product_id: null,
      product_name: null,
      sku: null,
      rfid_uid: null,
      mode: "MANUAL",
      state: "IDLE",
      last_detected_at: null
    });
  } catch (err) {
    console.error("Error GET /api/conveyor-status:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ======== AUTO TASKS GET API (MISSING) ========
app.get("/api/auto-tasks", async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const valid = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
    const where = status && valid.includes(status) ? "WHERE t.status = ?" : "";
    const params = status && valid.includes(status) ? [status] : [];

    const [rows] = await pool.query(
      `
      SELECT 
        t.*,
        c.label AS cell_label,
        p.name AS product_name
      FROM auto_tasks t
      LEFT JOIN cells c ON t.cell_id = c.id
      LEFT JOIN products p ON t.product_id = p.id
      ${where}
      ORDER BY t.id DESC
      LIMIT 200
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/auto-tasks:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ======== CELLS ASSIGN PRODUCT API (MISSING) ========
app.post("/api/cells/:id/assign", async (req, res) => {
  try {
    const cellId = Number(req.params.id);
    const { product_id, quantity } = req.body;

    if (!cellId || !product_id) {
      return res.status(400).json({ success: false, error: "cell id and product_id are required" });
    }

    const qty = Math.max(1, Number(quantity || 1));

    // Ensure product exists
    const [prod] = await pool.query("SELECT id FROM products WHERE id = ?", [product_id]);
    if (prod.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    // Ensure cell exists
    const [cell] = await pool.query("SELECT id FROM cells WHERE id = ?", [cellId]);
    if (cell.length === 0) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }

    await pool.query(
      `
      UPDATE cells
      SET product_id = ?, quantity = ?, status = 'OCCUPIED', updated_at = NOW()
      WHERE id = ?
      `,
      [product_id, qty, cellId]
    );

    const [rows] = await pool.query(`
      SELECT 
        c.*,
        p.name AS product_name,
        p.sku,
        p.rfid_uid,
        CASE 
          WHEN c.product_id IS NOT NULL THEN 'OCCUPIED' 
          ELSE 'EMPTY' 
        END AS display_status,
        CASE
          WHEN c.ir_sensor_pin IS NOT NULL THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END AS sensor_status
      FROM cells c
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.id = ?
    `, [cellId]);

    const updatedCell = rows[0];

    broadcast({ type: "cell_update", cell: updatedCell });
    broadcastWarehouseData();

    res.json({ success: true, cell: updatedCell });
  } catch (err) {
    console.error("Error POST /api/cells/:id/assign:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ======== OPERATIONS API - UPDATED ========
app.post("/api/operations", async (req, res) => {
  const connection = await pool.getConnection();
  const startTime = Date.now();
  let operationId = null;

  try {
    const { op_type, cmd, product_id, cell_id, priority = 'MEDIUM' } = req.body;

    await connection.beginTransaction();

    // Check if this is a conveyor manual command
    if (cmd.includes("CONVEYOR") || cmd.includes("LOADING_")) {
      // Send directly to ESP32 without database transaction
      try {
        const result = await sendCommandToESP32(cmd);

        // Log operation
        await pool.query(
          `INSERT INTO operations (op_type, cmd, status, priority) 
           VALUES (?, ?, 'COMPLETED', ?)`,
          [op_type || 'MANUAL_CMD', cmd, priority]
        );

        return res.json({
          success: true,
          message: "Command sent to ESP32",
          esp32: result
        });
      } catch (err) {
        return res.json({
          success: false,
          error: err.message
        });
      }
    }

    // Regular operation processing
    const [result] = await connection.query(
      `INSERT INTO operations (op_type, cmd, product_id, cell_id, status, priority) 
       VALUES (?, ?, ?, ?, 'PENDING', ?)`,
      [op_type, cmd, product_id || null, cell_id || null, priority]
    );

    operationId = result.insertId;

    // Update to processing
    await connection.query(
      "UPDATE operations SET status = 'PROCESSING', started_at = NOW() WHERE id = ?",
      [operationId]
    );

    await connection.commit();

    // Broadcast operation update
    broadcast({
      type: "operation_update",
      operation: {
        id: operationId,
        status: "PROCESSING",
        op_type,
        cmd
      }
    });

    armState.currentOperation = operationId;

    // Send command to ESP32
    let esp32Resp;
    try {
      esp32Resp = await sendCommandToESP32(cmd);
    } catch (errEsp) {
      const execMs = Date.now() - startTime;
      await pool.query(
        `UPDATE operations 
         SET status = 'ERROR', 
             completed_at = NOW(), 
             execution_time_ms = ?, 
             error_message = ? 
         WHERE id = ?`,
        [execMs, errEsp.message, operationId]
      );

      broadcast({
        type: "operation_update",
        operation: { id: operationId, status: "ERROR" }
      });

      armState.currentOperation = null;

      return res.json({
        success: false,
        id: operationId,
        error: errEsp.message
      });
    }

    const execMs = Date.now() - startTime;

    // Update operation as completed
    await pool.query(
      `UPDATE operations 
       SET status = 'COMPLETED', 
           completed_at = NOW(), 
           execution_time_ms = ? 
       WHERE id = ?`,
      [execMs, operationId]
    );

    // Handle specific operation types
    if (op_type === 'PLACE_IN_CELL' && cell_id && product_id) {
      await pool.query(
        `UPDATE cells 
         SET product_id = ?, 
             quantity = 1,
             status = 'OCCUPIED',
             updated_at = NOW()
         WHERE id = ?`,
        [product_id, cell_id]
      );

      broadcast({
        type: "cell_update",
        cell: { id: cell_id, product_id, quantity: 1, status: 'OCCUPIED' }
      });
    }
    else if (op_type === 'TAKE_FROM_CELL' && cell_id) {
      await pool.query(
        `UPDATE cells 
         SET product_id = NULL,
             quantity = 0,
             status = 'EMPTY',
             updated_at = NOW()
         WHERE id = ?`,
        [cell_id]
      );

      broadcast({
        type: "cell_update",
        cell: { id: cell_id, product_id: null, quantity: 0, status: 'EMPTY' }
      });
    }
    else if (op_type === 'MOVE_TO_LOADING' && cell_id && product_id) {
      await pool.query(
        `UPDATE cells 
         SET product_id = NULL,
             quantity = 0,
             status = 'EMPTY',
             updated_at = NOW()
         WHERE id = ?`,
        [cell_id]
      );

      await pool.query(
        `INSERT INTO loading_zone (id, product_id, quantity, status, updated_at)
         VALUES (1, ?, 1, 'OCCUPIED', NOW())
         ON DUPLICATE KEY UPDATE product_id = ?, quantity = 1, status = 'OCCUPIED', updated_at = NOW()`,
        [product_id, product_id]
      );

      broadcast({
        type: "cell_update",
        cell: { id: cell_id, product_id: null, quantity: 0, status: 'EMPTY' }
      });

      // Update loading zone broadcast
      const [lzRows] = await pool.query(`
        SELECT lz.*, p.name as product_name, p.sku
        FROM loading_zone lz
        LEFT JOIN products p ON lz.product_id = p.id
        WHERE lz.id = 1
      `);

      broadcast({
        type: "loading_zone_update",
        data: lzRows[0]
      });
    }

    // Get updated operation data
    const [operationRows] = await pool.query(`
      SELECT o.*,
             c.label AS cell_label,
             p.name AS product_name
      FROM operations o
      LEFT JOIN cells c ON o.cell_id = c.id
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `, [operationId]);

    broadcast({
      type: "operation_update",
      operation: { id: operationId, status: "COMPLETED" }
    });

    // Broadcast warehouse data updates
    broadcastWarehouseData();

    armState.currentOperation = null;

    res.json({
      success: true,
      id: operationId,
      operation: operationRows[0],
      esp32: esp32Resp
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error /api/operations POST:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  } finally {
    connection.release();
  }
});

// ======== AUTO TASKS API - UPDATED ========
app.post("/api/auto-tasks", async (req, res) => {
  try {
    const {
      task_type,
      cell_id,
      product_id,
      product_rfid,
      quantity,
      priority,
      storage_strategy
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO auto_tasks (
        task_type, cell_id, product_id, product_rfid, 
        quantity, priority, status, storage_strategy
      )
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        task_type,
        cell_id || null,
        product_id || null,
        product_rfid || null,
        quantity || 1,
        priority || 'MEDIUM',
        storage_strategy || 'NEAREST_EMPTY'
      ]
    );

    // Get the created task
    const [taskRows] = await pool.query(`
      SELECT t.*, c.label as cell_label, p.name as product_name
      FROM auto_tasks t
      LEFT JOIN cells c ON t.cell_id = c.id
      LEFT JOIN products p ON t.product_id = p.id
      WHERE t.id = ?
    `, [result.insertId]);

    broadcast({
      type: "task_update",
      task: taskRows[0]
    });

    // If in auto mode, start processing tasks
    if (armState.mode === 'auto') {
      processNextAutoTask();
    }

    res.json({ success: true, task: taskRows[0] });
  } catch (err) {
    console.error("Error /api/auto-tasks POST:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ======== MODE API ========
app.post("/api/mode", async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !["manual", "auto"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }

    armState.mode = mode;

    // Update system settings
    await pool.query(
      "UPDATE system_settings SET auto_mode = ? WHERE id = 1",
      [mode === 'auto']
    );

    // Send mode command to ESP32
    try {
      await sendCommandToESP32(`MODE ${mode.toUpperCase()}`);

      if (mode === 'auto') {
        await sendCommandToESP32("AUTO START");
        // Start processing auto tasks
        setTimeout(processNextAutoTask, 1000);
      } else {
        await sendCommandToESP32("AUTO STOP");
        await sendCommandToESP32("MODE MANUAL");
      }
    } catch (errEsp) {
      console.error("Error sending mode to ESP32:", errEsp);
    }

    broadcast({
      type: "mode_update",
      mode,
      armState
    });

    res.json({ success: true, mode });
  } catch (err) {
    console.error("Error /api/mode:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======== STATUS API - UPDATED ========
app.get("/api/status", async (req, res) => {
  try {
    const [cellsTotal] = await pool.query("SELECT COUNT(*) AS total FROM cells");
    const [cellsOcc] = await pool.query("SELECT COUNT(*) AS occupied FROM cells WHERE status = 'OCCUPIED'");
    const [prodTotal] = await pool.query("SELECT COUNT(*) AS total FROM products");
    const [opsPending] = await pool.query("SELECT COUNT(*) AS pending FROM operations WHERE status = 'PENDING'");
    const [tasksPending] = await pool.query("SELECT COUNT(*) AS pending FROM auto_tasks WHERE status = 'PENDING'");
    const [loadingZone] = await pool.query("SELECT status FROM loading_zone WHERE id = 1");
    const [conveyor] = await pool.query("SELECT * FROM conveyor_status WHERE id = 1");
    const [settings] = await pool.query("SELECT * FROM system_settings WHERE id = 1");

    res.json({
      cells: {
        total: cellsTotal[0].total,
        occupied: cellsOcc[0].occupied,
        available: cellsTotal[0].total - cellsOcc[0].occupied,
        ir_sensors_active: 12
      },
      loading_zone: {
        status: loadingZone[0]?.status || 'EMPTY',
        ultrasonic: true,
        servo: true
      },
      conveyor: {
        has_product: conveyor[0]?.has_product || false,
        mode: conveyor[0]?.mode || 'MANUAL',
        state: conveyor[0]?.state || 'IDLE'
      },
      products: prodTotal[0].total,
      pending_operations: opsPending[0].pending,
      pending_tasks: tasksPending[0].pending,
      arm: armState,
      sensors: currentSensorData,
      esp32: {
        connected: isESP32Connected,
        url: ESP32_BASE_URL
      },
      system: {
        storage_strategy: settings[0]?.storage_strategy || 'NEAREST_EMPTY',
        auto_mode: settings[0]?.auto_mode || false,
        conveyor_manual_control: settings[0]?.conveyor_manual_control || false
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error /api/status:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ======== BROADCAST HELPERS ========
async function broadcastWarehouseData() {
  try {
    const [cells] = await pool.query(`
      SELECT 
        c.*,
        p.name AS product_name,
        p.sku,
        p.rfid_uid,
        CASE 
          WHEN c.product_id IS NOT NULL THEN 'OCCUPIED' 
          ELSE 'EMPTY' 
        END AS display_status
      FROM cells c
      LEFT JOIN products p ON c.product_id = p.id
      ORDER BY c.row_num, c.col_num
    `);

    const [loadingZone] = await pool.query(`
      SELECT lz.*, p.name as product_name, p.sku
      FROM loading_zone lz
      LEFT JOIN products p ON lz.product_id = p.id
      WHERE lz.id = 1
    `);

    const [conveyorStatus] = await pool.query(`
      SELECT cs.*, p.name as product_name, p.sku
      FROM conveyor_status cs
      LEFT JOIN products p ON cs.product_id = p.id
      WHERE cs.id = 1
    `);

    const [settings] = await pool.query("SELECT * FROM system_settings WHERE id = 1");

    broadcast({
      type: "warehouse_data",
      cells: cells,
      loadingZone: loadingZone[0] || { id: 1, product_id: null, quantity: 0, status: 'EMPTY' },
      conveyor: conveyorStatus[0] || { id: 1, has_product: false, mode: 'MANUAL', state: 'IDLE' },
      systemSettings: settings[0] || {},
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error broadcasting warehouse data:", err);
  }
}

async function processNextAutoTask() {
  try {
    // Get highest priority pending task
    const [tasks] = await pool.query(`
      SELECT t.*,
             c.label as cell_label,
             p.name as product_name,
             p.rfid_uid
      FROM auto_tasks t
      LEFT JOIN cells c ON t.cell_id = c.id
      LEFT JOIN products p ON t.product_id = p.id
      WHERE t.status = 'PENDING'
      ORDER BY 
        CASE t.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END,
        t.created_at
      LIMIT 1
    `);

    if (tasks.length === 0) return;

    const task = tasks[0];

    // Update task status
    await pool.query(
      "UPDATE auto_tasks SET status = 'PROCESSING', started_at = NOW() WHERE id = ?",
      [task.id]
    );

    broadcast({
      type: "task_update",
      task: { ...task, status: 'PROCESSING' }
    });

    // Execute task based on type
    let command = '';
    switch (task.task_type) {
      case 'STOCK':
        if (task.product_rfid) {
          command = `AUTO_STOCK:${task.product_rfid}`;
        } else if (task.product_id) {
          const [product] = await pool.query("SELECT * FROM products WHERE id = ?", [task.product_id]);
          if (product.length > 0 && product[0].rfid_uid) {
            command = `AUTO_STOCK:${product[0].rfid_uid}`;
          }
        }
        break;
      case 'RETRIEVE':
        if (task.cell_id) {
          const [cell] = await pool.query("SELECT * FROM cells WHERE id = ?", [task.cell_id]);
          if (cell.length > 0) {
            command = `TAKE ${cell[0].col_num} ${cell[0].row_num}`;
          }
        }
        break;
      case 'LOADING_ZONE_OP':
        command = task.parameters?.action || "CHECK_LOADING";
        break;
    }

    if (command) {
      try {
        await sendCommandToESP32(command);

        // Update task as completed
        await pool.query(
          "UPDATE auto_tasks SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?",
          [task.id]
        );

        broadcast({
          type: "task_update",
          task: { ...task, status: 'COMPLETED' }
        });

        // Process next task after delay
        setTimeout(processNextAutoTask, 2000);
      } catch (err) {
        // Update task as failed
        await pool.query(
          "UPDATE auto_tasks SET status = 'FAILED', error_message = ? WHERE id = ?",
          [err.message, task.id]
        );

        broadcast({
          type: "task_update",
          task: { ...task, status: 'FAILED', error_message: err.message }
        });
      }
    } else {
      // No command to execute, mark as completed
      await pool.query(
        "UPDATE auto_tasks SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?",
        [task.id]
      );

      broadcast({
        type: "task_update",
        task: { ...task, status: 'COMPLETED' }
      });

      // Process next task
      setTimeout(processNextAutoTask, 1000);
    }
  } catch (err) {
    console.error("Error processing auto task:", err);
  }
}

// ======== START SERVER ========
const server = app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`🚀 Server running on http://localhost:${PORT}`);

  // Start periodic broadcasts
  setInterval(broadcastWarehouseData, 3000);

  // Periodically check and update sensor data
  setInterval(async () => {
    if (isESP32Connected && ESP32_BASE_URL) {
      try {
        // Request sensor update from ESP32
        const url = `${ESP32_BASE_URL}/cmd?c=${encodeURIComponent('GET_STATUS')}`;
        await fetch(url, { timeout: 5000 });
      } catch (err) {
        console.error("Failed to request sensor update:", err);
      }
    }
  }, 5000);
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await pool.end();
  process.exit(0);
});
