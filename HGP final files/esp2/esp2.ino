// ESP32 Bridge for Smart Warehouse - UPDATED VERSION
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid     = "Hmood iphone";
const char* password = "mohammad123";

const char* serverHost = "172.20.10.3";   
const uint16_t serverPort = 5001;

HardwareSerial ArduinoSerial(2);  
WebServer server(80);

struct SensorData {
  bool ldr1 = false;
  bool ldr2 = false;
  String rfid = "";
  String conveyorState = "IDLE";
  String armStatus = "READY";
  String currentRfidSymbol = "";
  String targetCell = "";
  unsigned long lastUpdate = 0;
  String currentOperation = "";
  bool cellOccupied[3][4] = {{false}}; // Updated for 3x4 grid
  bool loadingZoneOccupied = false;
  String storageStrategy = "NEAREST_EMPTY";
};

SensorData sensorData;

// ========== REGISTER ESP32 WITH NODE ==========
void registerWithServer() {
  if (WiFi.status() != WL_CONNECTED) return;

  IPAddress ip = WiFi.localIP();
  String ipStr = ip.toString();

  String url = "http://" + String(serverHost) + ":" + String(serverPort) +
               "/api/esp32/register?ip=" + ipStr;

  Serial.print("Registering ESP32 at: ");
  Serial.println(url);

  HTTPClient http;
  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    Serial.println("Successfully registered with server");
  } else {
    Serial.print("Registration failed, code: ");
    Serial.println(httpCode);
  }
  http.end();
}

// ========== SEND SENSOR DATA ==========
void sendSensorDataToServer() {
  if (WiFi.status() != WL_CONNECTED) return;

  String url = "http://" + String(serverHost) + ":" + String(serverPort) +
               "/api/sensors/update";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<500> doc;
  doc["ldr1"] = sensorData.ldr1;
  doc["ldr2"] = sensorData.ldr2;
  doc["rfid"] = sensorData.rfid;
  doc["conveyorState"] = sensorData.conveyorState;
  doc["armStatus"] = sensorData.armStatus;
  doc["currentOperation"] = sensorData.currentOperation;
  doc["loadingZoneOccupied"] = sensorData.loadingZoneOccupied;
  doc["storageStrategy"] = sensorData.storageStrategy;

  // Add cell status
  JsonArray cells = doc.createNestedArray("cells");
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      JsonObject cell = cells.createNestedObject();
      cell["row"] = row + 1;
      cell["col"] = col + 1;
      cell["occupied"] = sensorData.cellOccupied[row][col];
    }
  }

  String jsonString;
  serializeJson(doc, jsonString);

  int httpCode = http.POST(jsonString);
  
  if (httpCode == 200) {
    Serial.println("Sensor data sent successfully");
  } else {
    Serial.print("Failed to send sensor data, code: ");
    Serial.println(httpCode);
  }
  
  http.end();
}

// ========== UPDATE CELL STATUS ==========
void updateCellStatus(int row, int col, bool occupied) {
  if (row >= 1 && row <= 3 && col >= 1 && col <= 4) {
    sensorData.cellOccupied[row-1][col-1] = occupied;
    
    // Send update to server
    if (WiFi.status() == WL_CONNECTED) {
      // Calculate cell ID (1-12)
      int cellId = (row-1) * 4 + col;
      
      String url = "http://" + String(serverHost) + ":" + String(serverPort) +
                   "/api/cells/" + String(cellId) + "/assign";
      
      HTTPClient http;
      http.begin(url);
      http.addHeader("Content-Type", "application/json");
      
      StaticJsonDocument<128> doc;
      if (occupied) {
        doc["product_id"] = 1; // Default product ID
        doc["quantity"] = 1;
      } else {
        doc["product_id"] = nullptr;
        doc["quantity"] = 0;
      }
      
      String jsonString;
      serializeJson(doc, jsonString);
      http.POST(jsonString);
      http.end();
    }
  }
}

// ========== UPDATE LOADING ZONE ==========
void updateLoadingZoneStatus(bool occupied) {
  sensorData.loadingZoneOccupied = occupied;
  
  if (WiFi.status() == WL_CONNECTED) {
    String url = "http://" + String(serverHost) + ":" + String(serverPort) +
                 "/api/loading-zone";
    
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<128> doc;
    if (occupied) {
      doc["product_id"] = 1; // Default product ID
      doc["quantity"] = 1;
    } else {
      doc["product_id"] = nullptr;
      doc["quantity"] = 0;
    }
    
    String jsonString;
    serializeJson(doc, jsonString);
    http.POST(jsonString);
    http.end();
  }
}

// ========== PARSE ARDUINO MESSAGES ==========
void parseArduinoMessage(String message) {
  message.trim();
  if (message.length() == 0) return;

  Serial.print("From Arduino: ");
  Serial.println(message);

  // SENSOR DATA UPDATE
  if (message.startsWith("SENSOR:")) {
    message = message.substring(7);
    int c1 = message.indexOf(',');
    int c2 = message.indexOf(',', c1 + 1);
    int c3 = message.indexOf(',', c2 + 1);

    if (c1 > 0 && c2 > 0 && c3 > 0) {
      String sLdr1 = message.substring(0, c1);
      String sLdr2 = message.substring(c1 + 1, c2);
      String sRfid = message.substring(c2 + 1, c3);
      String sConv = message.substring(c3 + 1);

      sensorData.ldr1 = (sLdr1 == "1");
      sensorData.ldr2 = (sLdr2 == "1");
      sensorData.rfid = sRfid;

      int convVal = sConv.toInt();
      switch (convVal) {
        case 0: sensorData.conveyorState = "IDLE"; break;
        case 1: sensorData.conveyorState = "MOVE_12CM"; break;
        case 2: sensorData.conveyorState = "WAIT_RFID"; break;
        case 3: sensorData.conveyorState = "MOVING_TO_LDR2"; break;
        case 4: sensorData.conveyorState = "STOPPED"; break;
        case 5: sensorData.conveyorState = "MANUAL_MODE"; break;
        default: sensorData.conveyorState = "UNKNOWN";
      }

      sensorData.lastUpdate = millis();
      sendSensorDataToServer();
    }
  }
  
  // CELL STATUS UPDATE
  else if (message.startsWith("CELL_STATUS:")) {
    message = message.substring(12);
    int c1 = message.indexOf(':');
    int c2 = message.indexOf(':', c1 + 1);
    
    if (c1 > 0 && c2 > 0) {
      int row = message.substring(0, c1).toInt();
      int col = message.substring(c1 + 1, c2).toInt();
      bool occupied = (message.substring(c2 + 1) == "1");
      
      updateCellStatus(row, col, occupied);
      sensorData.lastUpdate = millis();
    }
  }
  
  // LOADING ZONE UPDATE
  else if (message.startsWith("LOADING_ZONE:")) {
    String status = message.substring(13);
    bool occupied = (status == "OCCUPIED");
    
    updateLoadingZoneStatus(occupied);
    sensorData.lastUpdate = millis();
  }
  
  // RFID DETECTION
  else if (message.startsWith("RFID:")) {
    message = message.substring(5);
    int colonPos = message.indexOf(':');
    if (colonPos > 0) {
      sensorData.rfid = message.substring(0, colonPos);
      sensorData.currentRfidSymbol = message.substring(colonPos + 1);
      sensorData.lastUpdate = millis();
      sendSensorDataToServer();
    }
  }
  
  // CELL UPDATE (ARM PLACED/PICKED FROM CELL)
  else if (message.startsWith("CELL:")) {
    message = message.substring(5);
    int c1 = message.indexOf(':');
    int c2 = message.indexOf(':', c1 + 1);
    int c3 = message.indexOf(':', c2 + 1);
    
    if (c1 > 0 && c2 > 0 && c3 > 0) {
      String col = message.substring(0, c1);
      String row = message.substring(c1 + 1, c2);
      String action = message.substring(c2 + 1, c3);
      String status = message.substring(c3 + 1);
      
      sensorData.targetCell = "C" + col + "R" + row;
      
      // Update cell occupancy
      if (action == "PLACED") {
        updateCellStatus(row.toInt(), col.toInt(), true);
      } else if (action == "TAKEN") {
        updateCellStatus(row.toInt(), col.toInt(), false);
      } else if (action == "SENSOR_UPDATE") {
        bool occupied = (status == "OCCUPIED");
        updateCellStatus(row.toInt(), col.toInt(), occupied);
      }
      
      sensorData.lastUpdate = millis();
    }
  }
  
  // STATUS UPDATE
  else if (message.startsWith("STATUS:")) {
    sensorData.armStatus = message.substring(7);
    sensorData.lastUpdate = millis();
    
    // Extract operation from status if available
    if (sensorData.armStatus.indexOf("PLACE") >= 0) {
      sensorData.currentOperation = "Placing";
    } else if (sensorData.armStatus.indexOf("PICK") >= 0) {
      sensorData.currentOperation = "Picking";
    } else if (sensorData.armStatus.indexOf("HOME") >= 0) {
      sensorData.currentOperation = "Homing";
    } else if (sensorData.armStatus.indexOf("MOVE") >= 0) {
      sensorData.currentOperation = "Moving";
    } else if (sensorData.armStatus.indexOf("READY") >= 0) {
      sensorData.currentOperation = "Ready";
    } else {
      sensorData.currentOperation = sensorData.armStatus;
    }
  }
  
  // MODE UPDATE
  else if (message.startsWith("MODE:")) {
    String mode = message.substring(5);
    Serial.print("Mode changed to: ");
    Serial.println(mode);
    sensorData.lastUpdate = millis();
  }
  
  // STRATEGY UPDATE
  else if (message.startsWith("STRATEGY:")) {
    sensorData.storageStrategy = message.substring(9);
    Serial.print("Storage strategy: ");
    Serial.println(sensorData.storageStrategy);
    sensorData.lastUpdate = millis();
  }
  
  // STATE UPDATE
  else if (message.startsWith("STATE:")) {
    String state = message.substring(6);
    Serial.print("State: ");
    Serial.println(state);
    sensorData.lastUpdate = millis();
  }
  
  // ARDUINO READY
  else if (message == "ARDUINO:READY") {
    sensorData.armStatus = "READY";
    sensorData.currentOperation = "System Ready";
    sensorData.lastUpdate = millis();
    Serial.println("Arduino is ready");
  }
  
  // COMMAND PROCESSING
  else if (message.startsWith("CMD_RECEIVED:")) {
    String cmd = message.substring(12);
    Serial.print("Arduino processing command: ");
    Serial.println(cmd);
    sensorData.currentOperation = "Processing: " + cmd;
  }
  
  // TASK ADDED
  else if (message.startsWith("TASK_ADDED:")) {
    String task = message.substring(11);
    Serial.print("Task added: ");
    Serial.println(task);
    sensorData.currentOperation = "Task added: " + task;
  }
}

// ========== HTTP HANDLERS ==========
void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>ESP32 Warehouse Bridge</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>";
  html += "body { font-family: Arial, sans-serif; margin: 20px; background: #f0f0f0; }";
  html += ".container { max-width: 1000px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }";
  html += "h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }";
  html += ".status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }";
  html += ".status-item { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }";
  html += ".status-label { font-weight: bold; color: #666; display: block; margin-bottom: 5px; }";
  html += ".status-value { font-size: 1.1em; color: #333; }";
  html += ".active { color: green; font-weight: bold; }";
  html += ".inactive { color: #666; }";
  html += ".cell-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 20px 0; }";
  html += ".cell { padding: 10px; text-align: center; border-radius: 3px; font-size: 0.9em; }";
  html += ".cell-occupied { background: #d4edda; border: 1px solid #c3e6cb; }";
  html += ".cell-empty { background: #f8f9fa; border: 1px solid #e9ecef; }";
  html += ".loading-zone { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }";
  html += ".strategy-info { background: #e7f3ff; border: 1px solid #b3d7ff; padding: 15px; border-radius: 5px; margin: 20px 0; }";
  html += "</style></head><body>";
  html += "<div class='container'>";
  html += "<h1>ESP32 Smart Warehouse Bridge</h1>";
  html += "<p><strong>IP Address:</strong> " + WiFi.localIP().toString() + "</p>";
  html += "<p><strong>Server:</strong> " + String(serverHost) + ":" + String(serverPort) + "</p>";
  
  html += "<div class='strategy-info'>";
  html += "<h3>Current Storage Strategy</h3>";
  html += "<p><strong>" + sensorData.storageStrategy + "</strong></p>";
  html += "</div>";
  
  html += "<div class='status-grid'>";
  
  html += "<div class='status-item'><span class='status-label'>LDR1 (Entry)</span>";
  html += "<span class='status-value " + String(sensorData.ldr1 ? "active" : "inactive") + "'>";
  html += sensorData.ldr1 ? "ACTIVE" : "INACTIVE";
  html += "</span></div>";

  html += "<div class='status-item'><span class='status-label'>LDR2 (Exit)</span>";
  html += "<span class='status-value " + String(sensorData.ldr2 ? "active" : "inactive") + "'>";
  html += sensorData.ldr2 ? "ACTIVE" : "INACTIVE";
  html += "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Conveyor State</span>";
  html += "<span class='status-value'>" + sensorData.conveyorState + "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Arm Status</span>";
  html += "<span class='status-value'>" + sensorData.armStatus + "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Current Operation</span>";
  html += "<span class='status-value'>" + sensorData.currentOperation + "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Current RFID</span>";
  html += "<span class='status-value'>" + (sensorData.rfid.length() > 0 ? sensorData.rfid : "None") + "</span></div>";

  html += "<div class='status-item'><span class='status-label'>RFID Symbol</span>";
  html += "<span class='status-value'>" + sensorData.currentRfidSymbol + "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Target Cell</span>";
  html += "<span class='status-value'>" + (sensorData.targetCell.length() > 0 ? sensorData.targetCell : "None") + "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Loading Zone</span>";
  html += "<span class='status-value " + String(sensorData.loadingZoneOccupied ? "active" : "inactive") + "'>";
  html += sensorData.loadingZoneOccupied ? "OCCUPIED" : "EMPTY";
  html += "</span></div>";

  html += "<div class='status-item'><span class='status-label'>Last Update</span>";
  html += "<span class='status-value'>" + String((millis() - sensorData.lastUpdate) / 1000) + " seconds ago</span></div>";

  html += "</div>";
  
  // Loading Zone Status
  html += "<div class='loading-zone'>";
  html += "<h3>Loading Zone Status</h3>";
  html += "<p><strong>Status:</strong> " + String(sensorData.loadingZoneOccupied ? "OCCUPIED" : "EMPTY") + "</p>";
  html += "<p><strong>Ultrasonic Sensor:</strong> Connected (TX1/RX1)</p>";
  html += "<p><strong>Servo:</strong> Pin 44</p>";
  html += "</div>";
  
  // Cell Status Grid
  html += "<h3>Cell Occupancy Status (IR Sensors)</h3>";
  html += "<div class='cell-grid'>";
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      bool occupied = sensorData.cellOccupied[row][col];
      html += "<div class='cell " + String(occupied ? "cell-occupied" : "cell-empty") + "'>";
      html += "R" + String(row + 1) + "C" + String(col + 1);
      html += "<br><small>" + String(occupied ? "OCCUPIED" : "EMPTY") + "</small>";
      html += "<br><small>Pin: " + String(getIRPin(row, col)) + "</small>";
      html += "</div>";
    }
  }
  html += "</div>";
  
  html += "<h3>Commands</h3>";
  html += "<p>Use /cmd?c=COMMAND to send commands to Arduino.</p>";
  html += "<p><strong>Available Commands:</strong></p>";
  html += "<ul>";
  html += "<li>HOME - Home the arm</li>";
  html += "<li>PICK - Pick from conveyor</li>";
  html += "<li>GOTO 2 - Go to column 2</li>";
  html += "<li>PLACE 2 3 - Place at column 2, row 3</li>";
  html += "<li>TAKE 2 3 - Pick from column 2, row 3</li>";
  html += "<li>LOADING_PLACE - Place to loading zone</li>";
  html += "<li>LOADING_TAKE - Take from loading zone</li>";
  html += "<li>LOADING_RETURN - Return from loading zone</li>";
  html += "<li>LOADING_OPEN - Open loading zone servo</li>";
  html += "<li>LOADING_CLOSE - Close loading zone servo</li>";
  html += "<li>CHECK_LOADING - Check loading zone status</li>";
  html += "<li>CONVEYOR_MOVE - Move conveyor (manual mode)</li>";
  html += "<li>CONVEYOR_STOP - Stop conveyor</li>";
  html += "<li>MODE AUTO - Switch to auto mode</li>";
  html += "<li>MODE MANUAL - Switch to manual mode</li>";
  html += "<li>AUTO_STOCK:RFID_TAG - Auto stock product</li>";
  html += "<li>STRATEGY NEAREST - Use nearest empty strategy</li>";
  html += "<li>STRATEGY ROUND_ROBIN - Use round-robin strategy</li>";
  html += "<li>STRATEGY RANDOM - Use random strategy</li>";
  html += "<li>STRATEGY AI - Use AI optimized strategy</li>";
  html += "<li>STRATEGY FIXED - Use fixed mapping strategy</li>";
  html += "<li>GET_IR_STATUS - Get IR sensor status</li>";
  html += "<li>GET_LOADING_STATUS - Get loading zone status</li>";
  html += "<li>TEST_CONVEYOR - Test conveyor</li>";
  html += "<li>TEST_IR_SENSORS - Test IR sensors</li>";
  html += "<li>TEST_ULTRASONIC - Test ultrasonic sensor</li>";
  html += "</ul>";
  html += "</div></body></html>";

  server.send(200, "text/html", html);
}

int getIRPin(int row, int col) {
  // Return the actual pin number for the IR sensor
  const int pins[3][4] = {
    {53, 31, 23, 30},
    {52, 32, 33, 34},
    {35, 25, 40, 22}
  };
  return pins[row][col];
}

void handleCmd() {
  if (!server.hasArg("c")) {
    server.send(400, "text/plain", "Missing 'c' query parameter");
    return;
  }

  String cmd = server.arg("c");
  cmd.trim();

  Serial.print("Sending to Arduino: ");
  Serial.println(cmd);
  
  ArduinoSerial.print(cmd);
  ArduinoSerial.print("\n");

  server.send(200, "text/plain", "Sent to Arduino: " + cmd);
}

void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

// ========== SETUP / LOOP ==========
void setup() {
  Serial.begin(115200);
  delay(200);

  ArduinoSerial.begin(115200, SERIAL_8N1, 16, 17);
  Serial.println("ESP32 Bridge starting...");

  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());

  registerWithServer();

  server.on("/", handleRoot);
  server.on("/cmd", handleCmd);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("HTTP server started on port 80.");

  // Initialize cell status
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      sensorData.cellOccupied[row][col] = false;
    }
  }
  
  sensorData.loadingZoneOccupied = false;
  sensorData.lastUpdate = millis();
  Serial.println("ESP32 Bridge Ready!");
}

void loop() {
  server.handleClient();

  // Read from Arduino
  if (ArduinoSerial.available()) {
    String line = ArduinoSerial.readStringUntil('\n');
    parseArduinoMessage(line);
  }

  // Periodically send sensor data (every 1 second)
  static unsigned long lastSensorSend = 0;
  if (millis() - lastSensorSend > 1000) {
    sendSensorDataToServer();
    lastSensorSend = millis();
  }

  // Re-register if disconnected (every 30 seconds)
  static unsigned long lastRegister = 0;
  if (millis() - lastRegister > 30000) {
    if (WiFi.status() == WL_CONNECTED) {
      registerWithServer();
    }
    lastRegister = millis();
  }
}