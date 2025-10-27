/*
  Smart Warehouse ESP32 IoT Controller
  This code connects ESP32 to the Smart Warehouse web interface
  
  Features:
  - WiFi Connection with WebSocket server
  - Servo motor control for robot arm/gripper
  - Sensor readings (temperature, humidity, distance, weight)
  - Motor control for robot movement
  - LED indicators for status
  - Buzzer for alerts
  
  Hardware Required:
  - ESP32 Dev Board
  - DHT22 (Temperature & Humidity)
  - HC-SR04 (Ultrasonic Distance)
  - HX711 with Load Cell (Weight)
  - Servo Motors (2x for arm and gripper)
  - DC Motors with Motor Driver (L298N)
  - LEDs and Resistors
  - Buzzer
  - PIR Motion Sensor
  - LDR (Light Sensor)
*/

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include "HX711.h"

// WiFi credentials - CHANGE THESE TO YOUR NETWORK
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Pin Definitions
#define DHT_PIN 4
#define DHT_TYPE DHT22
#define TRIG_PIN 5
#define ECHO_PIN 18
#define SCALE_DOUT_PIN 19
#define SCALE_SCK_PIN 21
#define SERVO_ARM_PIN 12
#define SERVO_GRIPPER_PIN 13
#define MOTOR1_PIN1 25
#define MOTOR1_PIN2 26
#define MOTOR2_PIN1 27
#define MOTOR2_PIN2 14
#define LED_STATUS_PIN 2
#define LED_WIFI_PIN 15
#define LED_OPERATION_PIN 16
#define BUZZER_PIN 17
#define PIR_PIN 22
#define LDR_PIN 34 // Analog pin for light sensor

// Create objects
DHT dht(DHT_PIN, DHT_TYPE);
HX711 scale;
Servo servoArm;
Servo servoGripper;
WebSocketsServer webSocket = WebSocketsServer(81);

// Variables
struct SensorData {
  float temperature;
  float humidity;
  float weight;
  float distance;
  bool motion;
  int light;
};

struct RobotState {
  int armPosition;
  int gripperPosition;
  String status;
  int battery; // Simulated battery level
  struct {
    int x, y, z;
  } position;
};

SensorData sensors;
RobotState robot;
unsigned long lastSensorRead = 0;
unsigned long lastStatusSend = 0;
bool emergencyStop = false;
bool wifiConnected = false;

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_STATUS_PIN, OUTPUT);
  pinMode(LED_WIFI_PIN, OUTPUT);
  pinMode(LED_OPERATION_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(MOTOR1_PIN1, OUTPUT);
  pinMode(MOTOR1_PIN2, OUTPUT);
  pinMode(MOTOR2_PIN1, OUTPUT);
  pinMode(MOTOR2_PIN2, OUTPUT);
  
  // Initialize components
  dht.begin();
  scale.begin(SCALE_DOUT_PIN, SCALE_SCK_PIN);
  servoArm.attach(SERVO_ARM_PIN);
  servoGripper.attach(SERVO_GRIPPER_PIN);
  
  // Set initial positions
  robot.armPosition = 90;
  robot.gripperPosition = 0; // 0 = open, 180 = closed
  robot.status = "idle";
  robot.battery = 100;
  robot.position.x = 0;
  robot.position.y = 0;
  robot.position.z = 0;
  
  servoArm.write(robot.armPosition);
  servoGripper.write(robot.gripperPosition);
  
  // Calibrate scale (you may need to adjust this)
  scale.set_scale(2280.f); // This value is obtained by calibrating the scale with known weights
  scale.tare(); // Reset the scale to 0
  
  Serial.println("🤖 Smart Warehouse ESP32 Starting...");
  
  // Connect to WiFi
  connectToWiFi();
  
  // Start WebSocket server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  
  Serial.println("✅ System initialized successfully!");
  digitalWrite(LED_STATUS_PIN, HIGH);
  playStartupSound();
}

void loop() {
  webSocket.loop();
  
  // Read sensors every 2 seconds
  if (millis() - lastSensorRead > 2000) {
    readSensors();
    lastSensorRead = millis();
  }
  
  // Send status every 5 seconds
  if (millis() - lastStatusSend > 5000 && wifiConnected) {
    sendSensorData();
    sendRobotStatus();
    lastStatusSend = millis();
  }
  
  // Simulate battery drain
  if (millis() % 60000 == 0) { // Every minute
    if (robot.battery > 0) robot.battery--;
  }
  
  // Check for low battery
  if (robot.battery < 20) {
    blinkLED(LED_STATUS_PIN, 3);
  }
  
  delay(100);
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_WIFI_PIN, !digitalRead(LED_WIFI_PIN)); // Blink during connection
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.print("✅ WiFi Connected! IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_WIFI_PIN, HIGH);
    playConnectionSound();
  } else {
    Serial.println();
    Serial.println("❌ WiFi Connection Failed!");
    digitalWrite(LED_WIFI_PIN, LOW);
  }
}

void readSensors() {
  // Read DHT22
  sensors.temperature = dht.readTemperature();
  sensors.humidity = dht.readHumidity();
  
  // Read ultrasonic distance
  sensors.distance = readDistance();
  
  // Read weight from load cell
  sensors.weight = scale.get_units(10); // Average of 10 readings
  if (sensors.weight < 0) sensors.weight = 0;
  
  // Read motion sensor
  sensors.motion = digitalRead(PIR_PIN);
  
  // Read light sensor
  sensors.light = analogRead(LDR_PIN);
  sensors.light = map(sensors.light, 0, 4095, 0, 1000); // Convert to lux (approximate)
  
  // Check for sensor errors
  if (isnan(sensors.temperature) || isnan(sensors.humidity)) {
    sensors.temperature = 25.0; // Default values
    sensors.humidity = 50.0;
    Serial.println("⚠️ DHT sensor error!");
  }
}

float readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.034 / 2; // Convert to cm
  
  return (distance > 400) ? 400 : distance; // Max 4 meters
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("Client %u disconnected\n", num);
      break;
      
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("Client %u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      
      // Send welcome message
      sendMessage(num, "confirmation", "ESP32 connected successfully");
      
      // Send initial sensor data
      sendSensorData(num);
      sendRobotStatus(num);
      break;
    }
      
    case WStype_TEXT: {
      Serial.printf("Received from client %u: %s\n", num, payload);
      
      // Parse JSON command
      StaticJsonDocument<200> doc;
      deserializeJson(doc, payload);
      
      String command = doc["command"];
      handleCommand(num, command, doc);
      break;
    }
      
    default:
      break;
  }
}

void handleCommand(uint8_t client, String command, JsonDocument& doc) {
  if (emergencyStop && command != "emergency_stop") {
    sendMessage(client, "error", "Emergency stop active! Reset required.");
    return;
  }
  
  Serial.println("Executing command: " + command);
  
  if (command == "get_sensors") {
    sendSensorData(client);
    
  } else if (command == "get_robot_status") {
    sendRobotStatus(client);
    
  } else if (command == "move_robot") {
    String direction = doc["direction"];
    int speed = doc["speed"] | 50;
    moveRobot(direction, speed);
    sendMessage(client, "confirmation", "Robot moving " + direction);
    
  } else if (command == "gripper") {
    String action = doc["action"];
    controlGripper(action);
    sendMessage(client, "confirmation", "Gripper " + action);
    
  } else if (command == "emergency_stop") {
    emergencyStop = true;
    stopAllMotors();
    robot.status = "emergency_stop";
    sendMessage(client, "confirmation", "Emergency stop activated");
    playAlertSound();
    
  } else if (command == "reset_emergency") {
    emergencyStop = false;
    robot.status = "idle";
    sendMessage(client, "confirmation", "Emergency stop reset");
    
  } else if (command == "store_product") {
    JsonObject product = doc["product"];
    storeProduct(client, product);
    
  } else if (command == "retrieve_product") {
    String productId = doc["productId"];
    int quantity = doc["quantity"];
    retrieveProduct(client, productId, quantity);
    
  } else if (command == "scan_product") {
    scanProduct(client);
    
  } else if (command == "go_home") {
    goHome(client);
    
  } else if (command == "calibrate") {
    calibrateSystem(client);
    
  } else {
    sendMessage(client, "error", "Unknown command: " + command);
  }
}

void moveRobot(String direction, int speed) {
  if (emergencyStop) return;
  
  robot.status = "moving";
  digitalWrite(LED_OPERATION_PIN, HIGH);
  
  // Convert speed (0-100) to motor speed (0-255)
  int motorSpeed = map(speed, 0, 100, 0, 255);
  
  if (direction == "forward") {
    digitalWrite(MOTOR1_PIN1, HIGH);
    digitalWrite(MOTOR1_PIN2, LOW);
    digitalWrite(MOTOR2_PIN1, HIGH);
    digitalWrite(MOTOR2_PIN2, LOW);
    robot.position.y++;
    
  } else if (direction == "backward") {
    digitalWrite(MOTOR1_PIN1, LOW);
    digitalWrite(MOTOR1_PIN2, HIGH);
    digitalWrite(MOTOR2_PIN1, LOW);
    digitalWrite(MOTOR2_PIN2, HIGH);
    robot.position.y--;
    
  } else if (direction == "left") {
    digitalWrite(MOTOR1_PIN1, LOW);
    digitalWrite(MOTOR1_PIN2, HIGH);
    digitalWrite(MOTOR2_PIN1, HIGH);
    digitalWrite(MOTOR2_PIN2, LOW);
    robot.position.x--;
    
  } else if (direction == "right") {
    digitalWrite(MOTOR1_PIN1, HIGH);
    digitalWrite(MOTOR1_PIN2, LOW);
    digitalWrite(MOTOR2_PIN1, LOW);
    digitalWrite(MOTOR2_PIN2, HIGH);
    robot.position.x++;
  }
  
  // Move for a short duration
  delay(500);
  stopAllMotors();
  
  robot.status = "idle";
  digitalWrite(LED_OPERATION_PIN, LOW);
}

void controlGripper(String action) {
  robot.status = "gripper_operation";
  
  if (action == "open") {
    robot.gripperPosition = 0;
    servoGripper.write(0);
  } else if (action == "close") {
    robot.gripperPosition = 180;
    servoGripper.write(180);
  }
  
  delay(1000); // Wait for servo to reach position
  robot.status = "idle";
}

void stopAllMotors() {
  digitalWrite(MOTOR1_PIN1, LOW);
  digitalWrite(MOTOR1_PIN2, LOW);
  digitalWrite(MOTOR2_PIN1, LOW);
  digitalWrite(MOTOR2_PIN2, LOW);
}

void storeProduct(uint8_t client, JsonObject product) {
  robot.status = "storing";
  sendMessage(client, "confirmation", "Starting storage operation...");
  
  // Simulate storage sequence
  // 1. Move to pickup location
  moveRobot("forward", 50);
  delay(1000);
  
  // 2. Lower arm
  for (int pos = 90; pos >= 45; pos--) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  // 3. Close gripper to pick up product
  controlGripper("close");
  delay(1000);
  
  // 4. Raise arm
  for (int pos = 45; pos <= 90; pos++) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  // 5. Move to storage location
  String location = "A-" + String(random(1, 11)) + "-" + String(random(1, 6));
  moveRobot("right", 50);
  delay(500);
  moveRobot("forward", 50);
  delay(500);
  
  // 6. Lower arm and release product
  for (int pos = 90; pos >= 45; pos--) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  controlGripper("open");
  delay(1000);
  
  // 7. Raise arm and return
  for (int pos = 45; pos <= 90; pos++) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  goHome(client);
  
  robot.status = "idle";
  
  // Send completion message
  StaticJsonDocument<300> response;
  response["type"] = "operation_complete";
  response["operation"]["type"] = "store";
  response["operation"]["productId"] = product["productId"];
  response["operation"]["quantity"] = product["quantity"];
  response["operation"]["location"] = location;
  response["operation"]["status"] = "completed";
  response["operation"]["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(client, responseStr);
  
  playSuccessSound();
}

void retrieveProduct(uint8_t client, String productId, int quantity) {
  robot.status = "retrieving";
  sendMessage(client, "confirmation", "Starting retrieval operation...");
  
  // Simulate retrieval sequence
  // Similar to storage but in reverse
  
  // Move to storage location (simulated)
  moveRobot("forward", 50);
  delay(500);
  moveRobot("right", 50);
  delay(500);
  
  // Lower arm
  for (int pos = 90; pos >= 45; pos--) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  // Close gripper to pick up product
  controlGripper("close");
  delay(1000);
  
  // Raise arm
  for (int pos = 45; pos <= 90; pos++) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  // Move to delivery location
  moveRobot("left", 50);
  delay(500);
  moveRobot("backward", 50);
  delay(500);
  
  // Lower and release
  for (int pos = 90; pos >= 45; pos--) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  controlGripper("open");
  delay(1000);
  
  // Return to home
  for (int pos = 45; pos <= 90; pos++) {
    robot.armPosition = pos;
    servoArm.write(pos);
    delay(50);
  }
  
  goHome(client);
  
  robot.status = "idle";
  
  // Send completion message
  StaticJsonDocument<300> response;
  response["type"] = "operation_complete";
  response["operation"]["type"] = "retrieve";
  response["operation"]["productId"] = productId;
  response["operation"]["quantity"] = quantity;
  response["operation"]["status"] = "completed";
  response["operation"]["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(client, responseStr);
  
  playSuccessSound();
}

void scanProduct(uint8_t client) {
  robot.status = "scanning";
  sendMessage(client, "confirmation", "Scanning product...");
  
  // Simulate barcode scanning with servo movement
  for (int i = 0; i < 3; i++) {
    servoArm.write(70);
    delay(200);
    servoArm.write(110);
    delay(200);
  }
  servoArm.write(90);
  
  robot.status = "idle";
  
  // Generate random product ID
  String scannedId = "P" + String(random(100, 999));
  sendMessage(client, "confirmation", "Scanned product ID: " + scannedId);
}

void goHome(uint8_t client) {
  robot.status = "returning_home";
  
  // Move to center position
  while (robot.position.x != 0 || robot.position.y != 0) {
    if (robot.position.x > 0) {
      moveRobot("left", 50);
    } else if (robot.position.x < 0) {
      moveRobot("right", 50);
    }
    
    if (robot.position.y > 0) {
      moveRobot("backward", 50);
    } else if (robot.position.y < 0) {
      moveRobot("forward", 50);
    }
    
    delay(100);
  }
  
  // Reset arm and gripper to default positions
  robot.armPosition = 90;
  robot.gripperPosition = 0;
  servoArm.write(90);
  servoGripper.write(0);
  
  robot.status = "idle";
  sendMessage(client, "confirmation", "Robot returned to home position");
}

void calibrateSystem(uint8_t client) {
  robot.status = "calibrating";
  sendMessage(client, "confirmation", "Starting system calibration...");
  
  // Calibrate scale
  scale.tare();
  
  // Test servo movements
  for (int pos = 0; pos <= 180; pos += 30) {
    servoArm.write(pos);
    servoGripper.write(pos);
    delay(500);
  }
  
  // Return to default positions
  servoArm.write(90);
  servoGripper.write(0);
  
  robot.status = "idle";
  sendMessage(client, "confirmation", "System calibration complete");
}

void sendSensorData(uint8_t client = 255) {
  StaticJsonDocument<200> doc;
  doc["type"] = "sensor_data";
  doc["sensors"]["temperature"] = sensors.temperature;
  doc["sensors"]["humidity"] = sensors.humidity;
  doc["sensors"]["weight"] = sensors.weight;
  doc["sensors"]["distance"] = sensors.distance;
  doc["sensors"]["motion"] = sensors.motion;
  doc["sensors"]["light"] = sensors.light;
  
  String json;
  serializeJson(doc, json);
  
  if (client == 255) {
    webSocket.broadcastTXT(json);
  } else {
    webSocket.sendTXT(client, json);
  }
}

void sendRobotStatus(uint8_t client = 255) {
  StaticJsonDocument<200> doc;
  doc["type"] = "robot_status";
  doc["robot"]["armPosition"] = robot.armPosition;
  doc["robot"]["gripperPosition"] = robot.gripperPosition;
  doc["robot"]["status"] = robot.status;
  doc["robot"]["battery"] = robot.battery;
  doc["robot"]["position"]["x"] = robot.position.x;
  doc["robot"]["position"]["y"] = robot.position.y;
  doc["robot"]["position"]["z"] = robot.position.z;
  
  String json;
  serializeJson(doc, json);
  
  if (client == 255) {
    webSocket.broadcastTXT(json);
  } else {
    webSocket.sendTXT(client, json);
  }
}

void sendMessage(uint8_t client, String type, String message) {
  StaticJsonDocument<100> doc;
  doc["type"] = type;
  doc["message"] = message;
  
  String json;
  serializeJson(doc, json);
  webSocket.sendTXT(client, json);
}

// Sound functions
void playStartupSound() {
  tone(BUZZER_PIN, 1000, 100);
  delay(150);
  tone(BUZZER_PIN, 1500, 100);
  delay(150);
  tone(BUZZER_PIN, 2000, 100);
}

void playConnectionSound() {
  tone(BUZZER_PIN, 2000, 200);
  delay(250);
  tone(BUZZER_PIN, 2500, 200);
}

void playSuccessSound() {
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 1500, 100);
    delay(150);
  }
}

void playAlertSound() {
  for (int i = 0; i < 5; i++) {
    tone(BUZZER_PIN, 800, 200);
    delay(250);
    tone(BUZZER_PIN, 400, 200);
    delay(250);
  }
}

void blinkLED(int pin, int count) {
  for (int i = 0; i < count; i++) {
    digitalWrite(pin, HIGH);
    delay(100);
    digitalWrite(pin, LOW);
    delay(100);
  }
}