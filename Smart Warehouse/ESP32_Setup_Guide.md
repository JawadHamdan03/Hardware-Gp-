# ESP32 Smart Warehouse Setup Guide

## 🔌 Hardware Requirements

### Essential Components:

- **ESP32 Development Board** (ESP32-WROOM-32 recommended)
- **DHT22** - Temperature & Humidity Sensor
- **HC-SR04** - Ultrasonic Distance Sensor
- **HX711 Load Cell Amplifier** + Load Cell (5kg or 10kg)
- **2x Servo Motors** (SG90 or MG996R)
- **L298N Motor Driver** + 4x DC Motors
- **PIR Motion Sensor** (HC-SR501)
- **LDR (Light Dependent Resistor)** + 10kΩ resistor
- **3x LEDs** (Status, WiFi, Operation indicators)
- **Buzzer** (Active or Passive)
- **Resistors** (220Ω for LEDs)
- **Breadboard and Jumper Wires**
- **12V Power Supply** (for motors)

## 📋 Pin Connections

### ESP32 Pin Assignment:

```
// Sensors
DHT22 Data Pin     → GPIO 4
HC-SR04 Trig      → GPIO 5
HC-SR04 Echo      → GPIO 18
HX711 DOUT        → GPIO 19
HX711 SCK         → GPIO 21
PIR Motion        → GPIO 22
LDR Analog        → GPIO 34 (ADC1_CH6)

// Actuators
Servo Arm         → GPIO 12
Servo Gripper     → GPIO 13
Motor 1 IN1       → GPIO 25
Motor 1 IN2       → GPIO 26
Motor 2 IN1       → GPIO 27
Motor 2 IN2       → GPIO 14

// Indicators
Status LED        → GPIO 2
WiFi LED          → GPIO 15
Operation LED     → GPIO 16
Buzzer           → GPIO 17

// Power
VCC              → 3.3V
GND              → GND
```

## 🔧 Arduino IDE Setup

### 1. Install ESP32 Board Package:

```
1. Open Arduino IDE
2. Go to File → Preferences
3. Add this URL to Additional Board Manager URLs:
   https://dl.espressif.com/dl/package_esp32_index.json
4. Go to Tools → Board → Boards Manager
5. Search for "ESP32" and install "ESP32 by Espressif Systems"
```

### 2. Install Required Libraries:

```
Go to Sketch → Include Library → Manage Libraries and install:

- WebSockets by Markus Sattler (for WebSocket communication)
- ArduinoJson by Benoit Blanchon (for JSON parsing)
- DHT sensor library by Adafruit (for temperature/humidity)
- HX711 Arduino Library by Bogdan Necula (for weight sensor)
- ESP32Servo by Kevin Harrington (for servo control)
```

### 3. Board Configuration:

```
Tools → Board → ESP32 Arduino → "ESP32 Dev Module"
Tools → CPU Frequency → "240MHz (WiFi/BT)"
Tools → Flash Frequency → "80MHz"
Tools → Flash Mode → "QIO"
Tools → Flash Size → "4MB (32Mb)"
Tools → Partition Scheme → "Default 4MB with spiffs"
Tools → Upload Speed → "921600"
```

## 🌐 Network Configuration

### 1. Update WiFi Credentials:

```cpp
// In esp32_warehouse.ino file, line 32-33:
const char* ssid = "YOUR_WIFI_NETWORK_NAME";
const char* password = "YOUR_WIFI_PASSWORD";
```

### 2. Find ESP32 IP Address:

```
1. Upload the code to ESP32
2. Open Serial Monitor (Tools → Serial Monitor)
3. Set baud rate to 115200
4. Look for: "WiFi Connected! IP: 192.168.x.x"
5. Note this IP address
```

### 3. Configure Website:

```javascript
// In the website, when prompted for ESP IP:
// Enter the IP address from step 2 above
// Example: 192.168.1.100
```

## 🔩 Assembly Instructions

### 1. Basic Connections:

```
1. Connect ESP32 to breadboard
2. Connect power rails (3.3V and GND)
3. Connect all sensors according to pin diagram
4. Connect LEDs with 220Ω resistors
5. Connect buzzer (positive to GPIO, negative to GND)
```

### 2. Motor Driver Setup:

```
L298N Connections:
- VCC → 12V Power Supply
- GND → Common Ground
- IN1 → ESP32 GPIO 25
- IN2 → ESP32 GPIO 26
- IN3 → ESP32 GPIO 27
- IN4 → ESP32 GPIO 14
- OUT1, OUT2 → Motor 1 (Left wheel)
- OUT3, OUT4 → Motor 2 (Right wheel)
```

### 3. Servo Motor Setup:

```
Servo 1 (Arm):
- Red → 5V (external power recommended for heavy loads)
- Brown/Black → GND
- Orange/Yellow → ESP32 GPIO 12

Servo 2 (Gripper):
- Red → 5V
- Brown/Black → GND
- Orange/Yellow → ESP32 GPIO 13
```

### 4. Weight Sensor Setup:

```
HX711 Load Cell Amplifier:
- VDD → 3.3V
- VCC → 5V (if available)
- GND → GND
- DT → ESP32 GPIO 19
- SCK → ESP32 GPIO 21

Load Cell (4-wire):
- Red → E+
- Black → E-
- White → A-
- Green → A+
```

## 🚀 Installation & Testing

### 1. Upload Code:

```
1. Connect ESP32 to computer via USB
2. Select correct COM port (Tools → Port)
3. Click Upload button
4. Wait for "Done uploading" message
```

### 2. Initial Testing:

```
1. Open Serial Monitor (Ctrl+Shift+M)
2. Set baud rate to 115200
3. Press ESP32 reset button
4. Verify startup messages:
   ✅ "Smart Warehouse ESP32 Starting..."
   ✅ "WiFi Connected! IP: xxx.xxx.xxx.xxx"
   ✅ "System initialized successfully!"
```

### 3. Sensor Calibration:

```
Weight Sensor Calibration:
1. Remove all weight from load cell
2. Send "calibrate" command from website
3. Place known weight (e.g., 1kg) on load cell
4. Adjust scale factor in code if needed:
   scale.set_scale(2280.f); // Adjust this value
```

### 4. Network Testing:

```
1. Open website in browser
2. Click "إعدادات الاتصال" (Connection Settings)
3. Enter ESP32 IP address
4. Click "إعادة الاتصال" (Reconnect)
5. Look for "✅ تم الاتصال بـ ESP32 بنجاح" message
```

## 🛠️ Troubleshooting

### Common Issues:

**1. WiFi Connection Failed:**

```
- Check WiFi credentials in code
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Try moving closer to router
- Check if network allows IoT devices
```

**2. WebSocket Connection Failed:**

```
- Verify ESP32 IP address
- Check firewall settings
- Ensure both devices on same network
- Try different port (change 81 to 80 or 8080)
```

**3. Sensors Not Reading:**

```
- Check wiring connections
- Verify power supply (3.3V/5V)
- Test individual sensors with simple code
- Check pull-up resistors if needed
```

**4. Motors Not Moving:**

```
- Check motor driver power (12V)
- Verify motor driver connections
- Test with simple motor control code
- Check if emergency stop is active
```

**5. Servos Not Responding:**

```
- Ensure adequate power supply (5V, 2A+)
- Check servo signal wires
- Test servo range (0-180 degrees)
- Verify servo library installation
```

## 📊 System Features

### Real-time Monitoring:

- ✅ Temperature & Humidity (DHT22)
- ✅ Weight Detection (Load Cell + HX711)
- ✅ Distance Measurement (HC-SR04)
- ✅ Motion Detection (PIR)
- ✅ Light Level (LDR)

### Robot Control:

- ✅ 4-wheel movement (forward/backward/left/right)
- ✅ Robotic arm positioning
- ✅ Gripper open/close control
- ✅ Emergency stop function
- ✅ Position tracking

### IoT Communication:

- ✅ WebSocket real-time communication
- ✅ JSON command protocol
- ✅ Automatic reconnection
- ✅ Status indicators
- ✅ Error handling

### Smart Operations:

- ✅ Automated product storage
- ✅ Product retrieval sequences
- ✅ Barcode scanning simulation
- ✅ Weight verification
- ✅ Location tracking

## 🔄 Protocol Commands

The website can send these commands to ESP32:

```json
// Move robot
{"command": "move_robot", "direction": "forward", "speed": 50}

// Control gripper
{"command": "gripper", "action": "open"}

// Store product
{"command": "store_product", "product": {...}}

// Retrieve product
{"command": "retrieve_product", "productId": "P001", "quantity": 1}

// Get sensor data
{"command": "get_sensors"}

// Emergency stop
{"command": "emergency_stop"}

// System commands
{"command": "go_home"}
{"command": "calibrate"}
{"command": "scan_product"}
```

## 📈 Next Steps

### Enhancements You Can Add:

1. **Camera Module** - Add ESP32-CAM for live video feed
2. **RFID Reader** - For automatic product identification
3. **Additional Sensors** - Gas, pressure, vibration sensors
4. **Mobile App** - Control via smartphone
5. **Database Integration** - Store data in cloud database
6. **Machine Learning** - Predictive maintenance
7. **Voice Control** - Add speech recognition
8. **Multi-Robot Support** - Control multiple robots

---

## 📞 Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Verify all hardware connections
3. Test individual components separately
4. Check Serial Monitor for error messages
5. Ensure all libraries are installed correctly

**Happy Building! 🤖✨**
