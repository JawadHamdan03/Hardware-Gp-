// SMART WAREHOUSE ARM ROBOT - COMPLETE VERSION WITH IR SENSORS & ULTRASONIC
#include <Servo.h>
#include <PN532_HSU.h>
#include <PN532.h>
#include <AccelStepper.h>
#include <LiquidCrystal_I2C.h>
#include <NewPing.h>

// LCD setup
LiquidCrystal_I2C lcd(0x27, 16, 2);

void lcdStatus(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void lcdStatus(const String &l1, const String &l2) {
  lcdStatus(l1.c_str(), l2.c_str());
}


// ESP32 Communication
#define ESP_SERIAL Serial2
const long ESP_BAUD = 115200;

// Arm Stepper Configuration
const int ARM_DIR_PIN = 2;
const int ARM_STEP_PIN = 3;
const int ARM_ENABLE_PIN = 4;
const int LIMIT_SWITCH_PIN = 10;

const int STEPS_PER_CM = 50;
const float COL_ABS_CM[4] = {8, 22, 36, 50};
const int NUM_COLUMNS = 4;
const int NUM_ROWS = 3;

const int TRAP_DELAY_START_US = 1200;
const int TRAP_DELAY_MIN_US   = 400;
const float TRAP_RAMP_FRACTION = 0.3;
const bool DIR_AWAY_FROM_HOME = HIGH;
const bool DIR_TOWARD_HOME    = LOW;
const int BACKOFF_STEPS       = 50;

long currentStepPos = 0;

// Servo Configuration
Servo s1, s2, s3, s4, s5, s6, loadingServo;
const int S1_PIN = 11, S2_PIN = 12, S3_PIN = 13;
const int S4_PIN = 50, S5_PIN = 51, S6_PIN = 24;
const int LOADING_SERVO_PIN = 44;

int s1Default = 100;
int s2Default = 90;
int s3Default = 90;
int s4Default = 110;
int s5Default = 10;
int s6Default = 65;
int loadingServoDefault = 90;

int s1Pos = s1Default;
int s2Pos = s2Default;
int s3Pos = s3Default;
int s4Pos = s4Default;
int s5Pos = s5Default;
int s6Pos = s6Default;
int loadingServoPos = loadingServoDefault;

const float SERVO_SPEED_DPS_DEFAULT = 60.0f;

// ============================
//       IR SENSOR PINS
// ============================
const int R1C1_PIN = 53;  // Row 1, Column 1
const int R1C2_PIN = 31;  // Row 1, Column 2
const int R1C3_PIN = 23;  // Row 1, Column 3
const int R1C4_PIN = 30;  // Row 1, Column 4

const int R2C1_PIN = 52;  // Row 2, Column 1
const int R2C2_PIN = 32;  // Row 2, Column 2
const int R2C3_PIN = 33;  // Row 2, Column 3
const int R2C4_PIN = 34;  // Row 2, Column 4

const int R3C1_PIN = 35;  // Row 3, Column 1
const int R3C2_PIN = 25;  // Row 3, Column 2
const int R3C3_PIN = 40;  // Row 3, Column 3
const int R3C4_PIN = 22;  // Row 3, Column 4

// IR Sensor Array
const int IR_PINS[3][4] = {
  {R1C1_PIN, R1C2_PIN, R1C3_PIN, R1C4_PIN},
  {R2C1_PIN, R2C2_PIN, R2C3_PIN, R2C4_PIN},
  {R3C1_PIN, R3C2_PIN, R3C3_PIN, R3C4_PIN}
};

bool cellOccupied[3][4] = {{false}};   // True if IR sensor detects object
bool lastCellStatus[3][4] = {{false}}; // For detecting changes

// ============================
//       ULTRASONIC SENSOR
// ============================
#define TRIGGER_PIN 14
#define ECHO_PIN 15
#define MAX_DISTANCE 20
NewPing sonar(TRIGGER_PIN, ECHO_PIN, MAX_DISTANCE);
bool loadingZoneOccupied = false;
const int LOADING_ZONE_DISTANCE_THRESHOLD = 12; // cm

// ============================
//       CONVEYOR SETTINGS
// ============================
#define CONV_DIR_PIN   5
#define CONV_STEP_PIN  6
#define CONV_EN_PIN    7
const bool CONV_EN_ACTIVE_LOW = true;

#define LDR1_PIN  9
#define LDR2_PIN  8
const bool LDR_ACTIVE_LOW = true;

const float CONV_STEPPER_MAX_SPEED = 2500.0;
const float CONV_STEPPER_ACCEL = 1000.0;
const float CONV_STEPPER_DECEL = 800.0;
const long STEPS_PER_12CM = 2500;
const int MICROSTEPS = 4;
const uint8_t LDR_SAMPLES   = 5;
const uint8_t LDR_SAMPLE_MS = 2;

// ============================
//           RFID
// ============================
PN532_HSU pn532hsu(Serial1);
PN532 nfc(pn532hsu);

// ============================
//       CONVEYOR STEPPER
// ============================
AccelStepper conveyorStepper(AccelStepper::DRIVER, CONV_STEP_PIN, CONV_DIR_PIN);

// ============================
//       SYSTEM STATES
// ============================
enum RunState {
  IDLE,
  MOVE_12CM,
  WAIT_RFID,
  MOVING_TO_LDR2,
  STOPPED,
  MANUAL_MODE
};

RunState convState = IDLE;
RunState prevConvState = IDLE;

enum ArmMode {
  MODE_MANUAL,
  MODE_AUTO
};

ArmMode currentMode = MODE_MANUAL;
bool autoModeRunning = false;

// ============================
//       RFID DATABASE
// ============================
const int NUM_TAGS = 6;
const char TAG_SYMBOLS[NUM_TAGS] = {'A', 'B', 'C', 'D', 'E', 'F'};
const char* TAG_IDS[NUM_TAGS] = {
  "12.80.110.3",
  "178.139.221.208",
  "204.187.101.3",
  "12.86.101.3",
  "66.208.30.83",
  "252.53.92.3"
};

// Storage Strategy Configuration
enum StorageStrategy {
  STRATEGY_NEAREST_EMPTY,
  STRATEGY_ROUND_ROBIN,
  STRATEGY_RANDOM,
  STRATEGY_AI_OPTIMIZED,
  STRATEGY_FIXED
};

StorageStrategy currentStorageStrategy = STRATEGY_NEAREST_EMPTY;
int nextCellIndex = 0;
int fixedStorageMap[3][4] = {
  {1, 2, 3, 4},
  {5, 6, 7, 8},
  {9, 10, 11, 12}
};

int targetCol = -1;
int targetRow = -1;
char lastSymbol = '?';
String lastTag = "";
String currentRFID = "";

// ============================
//   AUTO TASK QUEUE
// ============================
struct AutoTask {
  String command;
  String rfid;
  int col;
  int row;
  bool pending;
};

AutoTask autoTasks[10];
int autoTaskCount = 0;
int currentTaskIndex = -1;

// ============================
//   FORWARD DECLARATIONS
// ============================
bool readLDRStable(uint8_t pin);
void enableConveyorMotor(bool enable);
void returnToDefaultPosition();
int findTagIndex(const String &tag);
bool getCellFromStrategy(int &col, int &row);
void updateCellOccupancyFromSensors();
int readUltrasonicDistance();
bool checkLoadingZoneOccupied();
String readCommand(Stream &s);
void handleCommand(String cmd); // مهم: كان ناقص

// ============================
//   COMMUNICATION FUNCTIONS
// ============================
void sendToESP32(String message) {
  ESP_SERIAL.println(message);
  Serial.print("To ESP32: ");
  Serial.println(message);
}

void sendStatusUpdate(String status) {
  String msg = "STATUS:";
  msg += status;
  sendToESP32(msg);
}

void sendRFIDUpdate(String tag, String symbol) {
  String msg = "RFID:";
  msg += tag;
  msg += ":";
  msg += symbol;
  sendToESP32(msg);
}

void sendCellUpdate(int col, int row, String action, String status = "") {
  String msg = "CELL:";
  msg += col;
  msg += ":";
  msg += row;
  msg += ":";
  msg += action;
  msg += ":";
  msg += status;
  sendToESP32(msg);
}

void sendLoadingZoneUpdate(bool occupied) {
  String msg = "LOADING_ZONE:";
  msg += occupied ? "OCCUPIED" : "EMPTY";
  sendToESP32(msg);
}

void sendCellStatusUpdate(int row, int col, bool occupied) {
  String msg = "CELL_STATUS:";
  msg += row;
  msg += ":";
  msg += col;
  msg += ":";
  msg += occupied ? "1" : "0";
  sendToESP32(msg);
}

void sendAllCellStatus() {
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      sendCellStatusUpdate(row + 1, col + 1, cellOccupied[row][col]);
    }
  }
}

bool readLDRRaw(uint8_t pin) {
  int raw = digitalRead(pin);
  return LDR_ACTIVE_LOW ? (raw == LOW) : (raw == HIGH);
}

bool readLDRStable(uint8_t pin) {
  uint8_t hits = 0;
  for (uint8_t i = 0; i < LDR_SAMPLES; i++) {
    if (readLDRRaw(pin)) hits++;
    delay(LDR_SAMPLE_MS);
  }
  return (hits >= (LDR_SAMPLES / 2 + 1));
}

void sendSensorUpdate() {
  bool ldr1 = readLDRStable(LDR1_PIN);
  bool ldr2 = readLDRStable(LDR2_PIN);

  String sensorData = "SENSOR:";
  sensorData += ldr1 ? "1" : "0";
  sensorData += ",";
  sensorData += ldr2 ? "1" : "0";
  sensorData += ",";
  sensorData += currentRFID;
  sensorData += ",";
  sensorData += String((int)convState);

  sendToESP32(sensorData);
}

// ============================
//   CONVEYOR MOTOR CONTROL
// ============================
void enableConveyorMotor(bool enable) {
  if (CONV_EN_ACTIVE_LOW) digitalWrite(CONV_EN_PIN, enable ? LOW : HIGH);
  else digitalWrite(CONV_EN_PIN, enable ? HIGH : LOW);
  delay(20);
}

void setupConveyorStepper() {
  pinMode(CONV_EN_PIN, OUTPUT);
  enableConveyorMotor(false);

  conveyorStepper.setMaxSpeed(CONV_STEPPER_MAX_SPEED);
  conveyorStepper.setAcceleration(CONV_STEPPER_ACCEL);
  conveyorStepper.setCurrentPosition(0);

  enableConveyorMotor(true);
  delay(100);
  digitalWrite(CONV_DIR_PIN, LOW);
  enableConveyorMotor(false);
}

void moveConveyor12cmSmooth() {
  Serial.println("Moving conveyor 12cm...");
  lcdStatus("CONVEYOR", "Moving 12cm");
  sendStatusUpdate("MOVING_12CM");

  enableConveyorMotor(true);
  delay(150);

  conveyorStepper.setCurrentPosition(0);
  conveyorStepper.move(STEPS_PER_12CM);

  unsigned long startTime = millis();
  while (conveyorStepper.distanceToGo() != 0) {
    conveyorStepper.run();

    if (readLDRStable(LDR2_PIN)) {
      Serial.println("LDR2 triggered early!");
      conveyorStepper.stop();
      break;
    }

    if (millis() - startTime > 15000) {
      Serial.println("Conveyor move timeout!");
      break;
    }

    delayMicroseconds(500);
  }

  conveyorStepper.stop();
  delay(200);
  enableConveyorMotor(false);

  Serial.println("12cm movement complete");
  sendStatusUpdate("12CM_COMPLETE");
}

void moveConveyorToLDR2Smooth() {
  Serial.println("Moving to LDR2...");
  lcdStatus("CONVEYOR", "Moving to LDR2");
  sendStatusUpdate("MOVING_TO_LDR2");

  enableConveyorMotor(true);
  delay(150);

  conveyorStepper.setSpeed(400.0);

  unsigned long startTime = millis();
  while (!readLDRStable(LDR2_PIN)) {
    conveyorStepper.runSpeed();

    if (millis() - startTime > 20000) {
      Serial.println("LDR2 timeout!");
      break;
    }

    delayMicroseconds(800);
  }

  conveyorStepper.stop();
  delay(200);
  enableConveyorMotor(false);

  Serial.println("LDR2 detected");
  sendStatusUpdate("LDR2_DETECTED");
}

// ============================
//       ARM FUNCTIONS
// ============================
inline void stepPulse(int delayUs) {
  digitalWrite(ARM_STEP_PIN, HIGH);
  delayMicroseconds(delayUs);
  digitalWrite(ARM_STEP_PIN, LOW);
  delayMicroseconds(delayUs);
}

inline bool isHomeHit() {
  return (digitalRead(LIMIT_SWITCH_PIN) == LOW);
}

inline int lerpDelay(int startUs, int minUs, long i, long rampSteps) {
  long num = (long)(startUs - minUs) * i;
  long result = startUs - (num / rampSteps);
  return (result < minUs ? minUs : result);
}

int findTagIndex(const String &tag) {
  for (int i = 0; i < NUM_TAGS; i++) {
    if (tag == TAG_IDS[i]) return i;
  }
  return -1;
}

void moveStepsTrapezoid(long totalSteps, bool dir) {
  if (totalSteps <= 0) return;

  digitalWrite(ARM_DIR_PIN, dir);

  long rampSteps = totalSteps * TRAP_RAMP_FRACTION;
  if (rampSteps < 50) rampSteps = 50;
  if (2 * rampSteps > totalSteps) rampSteps = totalSteps / 2;
  long cruiseSteps = totalSteps - 2 * rampSteps;

  for (long i = 0; i < rampSteps; i++) {
    stepPulse(lerpDelay(TRAP_DELAY_START_US, TRAP_DELAY_MIN_US, i, rampSteps));
  }
  for (long i = 0; i < cruiseSteps; i++) {
    stepPulse(TRAP_DELAY_MIN_US);
  }
  for (long i = rampSteps; i > 0; i--) {
    stepPulse(lerpDelay(TRAP_DELAY_START_US, TRAP_DELAY_MIN_US, i - 1, rampSteps));
  }

  if (dir == DIR_AWAY_FROM_HOME) currentStepPos += totalSteps;
  else currentStepPos -= totalSteps;
}

void homeArm() {
  Serial.println("Homing arm...");
  lcdStatus("CMD: HOME", "Homing arm...");
  sendStatusUpdate("HOMING");

  returnToDefaultPosition();

  digitalWrite(ARM_DIR_PIN, DIR_TOWARD_HOME);
  long safetyCounter = 0;
  while (!isHomeHit()) {
    stepPulse(1200);
    safetyCounter++;
    if (safetyCounter > 200000) {
      Serial.println("Homing safety timeout!");
      break;
    }
  }

  digitalWrite(ARM_DIR_PIN, DIR_AWAY_FROM_HOME);
  for (int i = 0; i < BACKOFF_STEPS; i++) stepPulse(1400);

  digitalWrite(ARM_DIR_PIN, DIR_TOWARD_HOME);
  while (!isHomeHit()) stepPulse(1600);

  digitalWrite(ARM_DIR_PIN, DIR_AWAY_FROM_HOME);
  for (int i = 0; i < 15; i++) stepPulse(1600);

  currentStepPos = 0;
  Serial.println("Arm homed.");
  lcdStatus("CMD: HOME", "Arm homed");
  sendStatusUpdate("HOME_COMPLETE");
}

void goToColumn(int col) {
  if (col < 1) col = 1;
  if (col > NUM_COLUMNS) col = NUM_COLUMNS;

  long targetSteps = (long)(COL_ABS_CM[col - 1] * STEPS_PER_CM);
  long moveSteps   = targetSteps - currentStepPos;
  bool dir         = (moveSteps >= 0) ? DIR_AWAY_FROM_HOME : DIR_TOWARD_HOME;

  Serial.print("Moving to column ");
  Serial.print(col);
  Serial.print(" -> steps: ");
  Serial.println(moveSteps);

  String line1 = "GOTO COL ";
  line1 += col;
  lcdStatus(line1, "Moving...");
  sendStatusUpdate("GOTO_COLUMN");

  moveStepsTrapezoid(labs(moveSteps), dir);
  sendStatusUpdate("GOTO_COMPLETE");
}

// ============================
//   SERVO CONTROL FUNCTIONS
// ============================
void servoSmooth(Servo &sv, int &curr, int target, float speed_dps = SERVO_SPEED_DPS_DEFAULT) {
  target = constrain(target, 0, 180);
  if (curr == target) return;

  float delayPerDeg = 1000.0f / speed_dps;
  int step = (target > curr) ? 1 : -1;

  while (curr != target) {
    curr += step;
    if ((step > 0 && curr > target) || (step < 0 && curr < target)) curr = target;
    sv.write(curr);
    delay(delayPerDeg);
  }
}

void returnToDefaultPosition() {
  Serial.println("Returning to default position...");

  const int SHORT_DELAY = 250;
  const int S5_DELAY    = 400;

  servoSmooth(s1, s1Pos, 100);
  delay(SHORT_DELAY);

  servoSmooth(s2, s2Pos, 90);
  delay(SHORT_DELAY);

  servoSmooth(s5, s5Pos, 10);
  delay(S5_DELAY);

  servoSmooth(s4, s4Pos, 100);
  delay(SHORT_DELAY);

  servoSmooth(s6, s6Pos, 65);
  delay(SHORT_DELAY);

  s3.write(90);
  s3Pos = 90;
  delay(SHORT_DELAY);
}

void goToLoadingZonePose() {
  lcdStatus("LOADING ZONE", "Moving...");
  sendStatusUpdate("RETURN_TO_LOADING");

  const int D = 300;

  servoSmooth(s6, s6Pos, 90);
  delay(D);

  servoSmooth(s5, s5Pos, 120);
  delay(D);
  servoSmooth(s6, s6Pos, 75);
  delay(D);
  servoSmooth(s2, s2Pos, 60);
  delay(D);

  servoSmooth(s1, s1Pos, 145);
  delay(D);

  servoSmooth(s6, s6Pos, 90);
  delay(D);
  servoSmooth(s5, s5Pos, 50);
  delay(D);

  servoSmooth(s6, s6Pos, 90);
  delay(D);
  returnToDefaultPosition();
}

void moveServosToPickupFromConveyor() {
  lcdStatus("PICK", "From conveyor");
  sendStatusUpdate("PICKING_FROM_CONVEYOR");

  servoSmooth(s6, s6Pos, 133);
  servoSmooth(s2, s2Pos, 55);
  servoSmooth(s1, s1Pos, 160);
  servoSmooth(s4, s4Pos, 50);
  servoSmooth(s5, s5Pos, 80);
  servoSmooth(s4, s4Pos, 60);
  servoSmooth(s5, s5Pos, 90);

  delay(400);
  servoSmooth(s1, s1Pos, 90);
  servoSmooth(s5, s5Pos, 10);
  servoSmooth(s2, s2Pos, 120);
  servoSmooth(s4, s4Pos, 110);
  servoSmooth(s6, s6Pos, 60);

  sendStatusUpdate("PICK_FROM_CONVEYOR_COMPLETE");
  returnToDefaultPosition();
}

// ============================
//   LOADING ZONE FUNCTIONS
// ============================
void openLoadingZone() {
  servoSmooth(loadingServo, loadingServoPos, 180);
  delay(500);
}

void closeLoadingZone() {
  servoSmooth(loadingServo, loadingServoPos, 90);
  delay(500);
}

void operateLoadingZone(bool open) {
  if (open) {
    openLoadingZone();
    sendStatusUpdate("LOADING_ZONE_OPEN");
  } else {
    closeLoadingZone();
    sendStatusUpdate("LOADING_ZONE_CLOSED");
  }
}

// ============================
//   PLACE ROW FUNCTIONS
// ============================
void placeInRow1() {
  servoSmooth(s5, s5Pos, 90);
  servoSmooth(s2, s2Pos, 95);
  servoSmooth(s4, s4Pos, 90);
  servoSmooth(s1, s1Pos, 160);
  delay(400);

  servoSmooth(s5, s5Pos, 55);
  delay(500);

  servoSmooth(s1, s1Pos, 120);
  servoSmooth(s4, s4Pos, 110);
  servoSmooth(s2, s2Pos, 95);

  returnToDefaultPosition();
}

void placeInRow2() {
  servoSmooth(s4, s4Pos, 40);
  servoSmooth(s5, s5Pos, 85);
  servoSmooth(s4, s4Pos, 30);
  servoSmooth(s2, s2Pos, 75);
  servoSmooth(s1, s1Pos, 160);
  delay(400);

  servoSmooth(s5, s5Pos, 60);
  delay(200);

  servoSmooth(s1, s1Pos, 120);
  servoSmooth(s2, s2Pos, 90);
  servoSmooth(s4, s4Pos, 30);
  returnToDefaultPosition();
}

void placeInRow3() {
  s5.write(0);   delay(600);
  s4.write(0);   delay(600);
  s5.write(30);  delay(600);
  s2.write(110); delay(600);
  s5.write(60);  delay(600);
  s2.write(60);  delay(600);
  s5.write(75);  delay(600);
  s2.write(10);  delay(600);
  s5.write(80);  delay(600);
  s4.write(5);   delay(600);
  s2.write(0);   delay(600);
  s5.write(100); delay(600);
  s4.write(15);  delay(600);
  s1.write(160); delay(600);

  s4.write(0);   delay(600);
  s5.write(70);  delay(600);
  s2.write(80);  delay(600);
  s5.write(40);  delay(600);

  s4Pos = 0;
  s5Pos = 0;
  s2Pos = 45;
  s1Pos = 120;
  returnToDefaultPosition();
}

// ============================
//   PICK FROM CELL FUNCTIONS
// ============================
void pickFromRow1() {
  s1.write(160); delay(600);
  s5.write(65);  delay(600);
  s2.write(95);  delay(600);
  s4.write(90);  delay(600);
  s1.write(90);  delay(600);

  s2.write(95);  delay(600);
  s4.write(110); delay(600);
  s5.write(10);  delay(600);

  s2Pos = 95;
  s4Pos = 110;
  s5Pos = 10;
  s1Pos = 120;
  returnToDefaultPosition();
}

void pickFromRow2() {
  s1.write(160); delay(600);

  s4.write(40);  delay(600);
  s5.write(40);  delay(600);
  s4.write(30);  delay(600);
  s2.write(75);  delay(600);
  s5.write(75);  delay(600);
  s1.write(90);  delay(600);

  s2.write(90);  delay(600);
  s4.write(30);  delay(600);
  s5.write(10);  delay(600);

  s2Pos = 90;
  s4Pos = 30;
  s5Pos = 10;
  s1Pos = 120;
  returnToDefaultPosition();
}

void pickFromRow3() {
  s1.write(160); delay(600);
  s5.write(0);   delay(600);
  s4.write(0);   delay(600);
  s5.write(30);  delay(600);
  s2.write(110); delay(600);
  s5.write(60);  delay(600);
  s2.write(60);  delay(600);
  s5.write(75);  delay(600);
  s2.write(10);  delay(600);
  s5.write(80);  delay(600);
  s4.write(5);   delay(600);
  s2.write(0);   delay(600);
  s5.write(100); delay(600);
  s4.write(15);  delay(600);
  s1.write(80);  delay(600);

  s4.write(0);   delay(600);
  s5.write(70);  delay(600);
  s2.write(80);  delay(600);
  s5.write(40);  delay(600);

  s4Pos = 0;
  s5Pos = 0;
  s2Pos = 45;
  s1Pos = 120;
  returnToDefaultPosition();
}

void placeInRow_thenRetract(int row) {
  String line1 = "PLACE R";
  line1 += row;
  lcdStatus(line1, "Placing...");
  sendStatusUpdate("PLACING");

  switch (row) {
    case 1: placeInRow1(); break;
    case 2: placeInRow2(); break;
    case 3: placeInRow3(); break;
    default:
      Serial.println("Invalid row (1..3).");
      lcdStatus("ERROR", "Row invalid");
      sendStatusUpdate("PLACE_ERROR");
      return;
  }

  if (targetCol >= 1 && targetRow >= 1) {
    cellOccupied[targetRow - 1][targetCol - 1] = true;
    sendCellUpdate(targetCol, targetRow, "PLACED", "OCCUPIED");
    sendCellStatusUpdate(targetRow, targetCol, true);
  }

  returnToDefaultPosition();
  sendStatusUpdate("PLACE_COMPLETE");
}

void pickFromRow_thenRetract(int row) {
  String line1 = "TAKE R";
  line1 += row;
  lcdStatus(line1, "Picking...");
  sendStatusUpdate("PICK_FROM_CELL");

  switch (row) {
    case 1: pickFromRow1(); break;
    case 2: pickFromRow2(); break;
    case 3: pickFromRow3(); break;
    default:
      Serial.println("Invalid row (1..3) in pick.");
      lcdStatus("ERROR", "Row invalid");
      sendStatusUpdate("PICK_FROM_CELL_ERR");
      return;
  }

  if (targetCol >= 1 && targetRow >= 1) {
    cellOccupied[targetRow - 1][targetCol - 1] = false;
sendCellUpdate(targetCol, targetRow, "TAKEN", "EMPTY");
    sendCellStatusUpdate(targetRow, targetCol, false);
  }

  returnToDefaultPosition();
  sendStatusUpdate("PICK_FROM_CELL_DONE");
}

// ============================
//       RFID HELPERS
// ============================
String uidToString(const byte* uid, uint8_t len) {
  String s;
  for (uint8_t i = 0; i < len; i++) {
    if (i) s += ".";
    s += String(uid[i]);
  }
  return s;
}

bool tryReadRFID(String &outStr) {
  byte uid[7];
  uint8_t uidLength;
  bool success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100);
  if (!success) return false;
  outStr = uidToString(uid, uidLength);
  return true;
}

// ============================
//   IR SENSOR FUNCTIONS
// ============================
void setupIRSensors() {
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      pinMode(IR_PINS[row][col], INPUT_PULLUP);
    }
  }
}

bool readIRSensor(int row, int col) {
  if (row < 0 || row >= 3 || col < 0 || col >= 4) return false;
  return digitalRead(IR_PINS[row][col]) == LOW;
}

void updateCellOccupancyFromSensors() {
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      bool currentStatus = digitalRead(IR_PINS[row][col]) == LOW;

      if (currentStatus != lastCellStatus[row][col]) {
        cellOccupied[row][col] = currentStatus;

        sendCellStatusUpdate(row + 1, col + 1, currentStatus);

        String action = currentStatus ? "OCCUPIED" : "EMPTY";
        String msg = "CELL:";
        msg += (col + 1);
        msg += ":";
        msg += (row + 1);
        msg += ":SENSOR_UPDATE:";
        msg += action;
        sendToESP32(msg);

        if (currentStatus) {
          Serial.print("IR Detected: R");
          Serial.print(row + 1);
          Serial.print("C");
          Serial.println(col + 1);
        }

        lastCellStatus[row][col] = currentStatus;
      }
    }
  }
}

// ============================
//   ULTRASONIC FUNCTIONS
// ============================
int readUltrasonicDistance() {
  delay(50);
  unsigned int uS = sonar.ping();
  return uS / US_ROUNDTRIP_CM;
}

bool checkLoadingZoneOccupied() {
  int distance = readUltrasonicDistance();
  bool occupied = (distance > 0 && distance < LOADING_ZONE_DISTANCE_THRESHOLD);

  if (occupied != loadingZoneOccupied) {
    loadingZoneOccupied = occupied;
    sendLoadingZoneUpdate(occupied);

    if (occupied) closeLoadingZone();
    else openLoadingZone();
  }

  return occupied;
}

// ============================
//   STORAGE STRATEGY FUNCTIONS
// ============================
bool getCellFromStrategy(int &col, int &row) {
  switch (currentStorageStrategy) {
    case STRATEGY_NEAREST_EMPTY:
      for (int r = 0; r < 3; r++) {
        for (int c = 0; c < 4; c++) {
          if (!cellOccupied[r][c]) {
            row = r + 1;
            col = c + 1;
            return true;
          }
        }
      }
      break;

    case STRATEGY_ROUND_ROBIN:
      for (int i = 0; i < 12; i++) {
        int idx = (nextCellIndex + i) % 12;
        int r = idx / 4;
        int c = idx % 4;
        if (!cellOccupied[r][c]) {
          row = r + 1;
          col = c + 1;
          nextCellIndex = (idx + 1) % 12;
          return true;
        }
      }
      break;

    case STRATEGY_RANDOM: {
      int emptyCells[12];
      int count = 0;
      for (int r = 0; r < 3; r++) {
        for (int c = 0; c < 4; c++) {
          if (!cellOccupied[r][c]) emptyCells[count++] = r * 4 + c;
        }
      }
      if (count > 0) {
        int idx = emptyCells[random(count)];
        row = (idx / 4) + 1;
        col = (idx % 4) + 1;
        return true;
      }
      break;
    }

    case STRATEGY_AI_OPTIMIZED: {
      int bestRow = -1, bestCol = -1;
      int bestDistance = 1000;
      for (int r = 0; r < 3; r++) {
        for (int c = 0; c < 4; c++) {
          if (!cellOccupied[r][c]) {
            int distance = abs((c + 1) - (targetCol > 0 ? targetCol : 1));
            if (distance < bestDistance) {
              bestDistance = distance;
              bestRow = r + 1;
              bestCol = c + 1;
            }
          }
        }
      }
      if (bestRow != -1) {
        row = bestRow;
        col = bestCol;
        return true;
      }
      break;
    }

    case STRATEGY_FIXED:
      for (int r = 0; r < 3; r++) {
        for (int c = 0; c < 4; c++) {
          if (!cellOccupied[r][c] && fixedStorageMap[r][c] == nextCellIndex + 1) {
            row = r + 1;
            col = c + 1;
            nextCellIndex = (nextCellIndex + 1) % 12;
            return true;
          }
        }
      }
      break;
  }

  return false;
}

// ============================
//   AUTO TASK MANAGEMENT
// ============================
void addAutoTask(String command, String rfid = "", int col = -1, int row = -1) {
  if (autoTaskCount >= 10) {
    Serial.println("Auto task queue full!");
    return;
  }

  autoTasks[autoTaskCount].command = command;
  autoTasks[autoTaskCount].rfid = rfid;
  autoTasks[autoTaskCount].col = col;
  autoTasks[autoTaskCount].row = row;
  autoTasks[autoTaskCount].pending = true;

  Serial.print("Added auto task: ");
  Serial.println(command);

  autoTaskCount++;
}

void processNextAutoTask() {
  if (currentTaskIndex >= 0 && currentTaskIndex < autoTaskCount) return;

  for (int i = 0; i < autoTaskCount; i++) {
    if (autoTasks[i].pending) {
      currentTaskIndex = i;
      AutoTask task = autoTasks[i];

      Serial.print("Processing auto task ");
      Serial.print(i);
      Serial.print(": ");
      Serial.println(task.command);

      lcdStatus("AUTO TASK", task.command);

      if (task.command == "AUTO_STOCK") {
        if (task.rfid.length() > 0) {
          String cmd = "AUTO_STOCK:" + task.rfid;
          handleCommand(cmd);
        }
      } else if (task.command == "PLACE") {
        if (task.col > 0 && task.row > 0) {
          String cmd = "PLACE " + String(task.col) + " " + String(task.row);
          handleCommand(cmd);
        }
      } else if (task.command == "TAKE") {
        if (task.col > 0 && task.row > 0) {
          String cmd = "TAKE " + String(task.col) + " " + String(task.row);
          handleCommand(cmd);
        }
      } else {
        handleCommand(task.command);
      }

      autoTasks[i].pending = false;

      // خلّصنا مهمة => اسمح للي بعدها تنفذ
      currentTaskIndex = -1;
      break;
    }
  }
}

// ============================
//       COMMAND HANDLER
// ============================
String readCommand(Stream &s) {
  s.setTimeout(500);
  String cmd = s.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();
  return cmd;
}

// ====== (handleCommand كما هو عندك بدون تغيير زوايا) ======
void handleCommand(String cmd) {
  if (cmd.length() == 0) return;

  Serial.print("CMD RECEIVED: ");
  Serial.println(cmd);

  sendToESP32("CMD_RECEIVED:" + cmd);

  // ===== STORAGE STRATEGY COMMANDS =====
  if (cmd == "STRATEGY NEAREST") {
    currentStorageStrategy = STRATEGY_NEAREST_EMPTY;
    lcdStatus("STRATEGY", "Nearest Empty");
    sendToESP32("STRATEGY:NEAREST_EMPTY");
    return;
  }

  if (cmd == "STRATEGY ROUND_ROBIN") {
    currentStorageStrategy = STRATEGY_ROUND_ROBIN;
    lcdStatus("STRATEGY", "Round Robin");
    sendToESP32("STRATEGY:ROUND_ROBIN");
    return;
  }

  if (cmd == "STRATEGY RANDOM") {
    currentStorageStrategy = STRATEGY_RANDOM;
    lcdStatus("STRATEGY", "Random");
    sendToESP32("STRATEGY:RANDOM");
    return;
  }

  if (cmd == "STRATEGY AI") {
    currentStorageStrategy = STRATEGY_AI_OPTIMIZED;
    lcdStatus("STRATEGY", "AI Optimized");
    sendToESP32("STRATEGY:AI_OPTIMIZED");
    return;
  }

  if (cmd == "STRATEGY FIXED") {
    currentStorageStrategy = STRATEGY_FIXED;
    lcdStatus("STRATEGY", "Fixed Mapping");
    sendToESP32("STRATEGY:FIXED");
    return;
  }

  if (cmd == "SET_FIXED_MAP") {
    lcdStatus("SET FIXED MAP", "Not Implemented");
    sendToESP32("SET_FIXED_MAP:ACK");
    return;
  }

  // ===== LOADING ZONE COMMANDS =====
  if (cmd == "LOADING_OPEN") { operateLoadingZone(true); return; }
  if (cmd == "LOADING_CLOSE") { operateLoadingZone(false); return; }

  if (cmd == "CHECK_LOADING") {
    bool occupied = checkLoadingZoneOccupied();
    lcdStatus("LOADING ZONE", occupied ? "OCCUPIED" : "EMPTY");
    return;
  }

  // ===== CONVEYOR MANUAL CONTROL =====
  if (cmd == "CONVEYOR_MOVE") {
    if (currentMode == MODE_MANUAL) {
      lcdStatus("MANUAL CONVEYOR", "Moving...");
      moveConveyor12cmSmooth();
    }
    return;
  }

  if (cmd == "CONVEYOR_STOP") {
    enableConveyorMotor(false);
    conveyorStepper.stop();
    lcdStatus("CONVEYOR", "Stopped");
    return;
  }

  // ===== MODE SWITCHING =====
  if (cmd == "MODE AUTO") {
    currentMode = MODE_AUTO;
    autoModeRunning = true;
    convState = IDLE;
    prevConvState = (RunState)(-1);
    enableConveyorMotor(false);
    conveyorStepper.stop();

    lcdStatus("MODE: AUTO", "RFID Conveyor");
    Serial.println("Switched to AUTO mode");
    sendToESP32("MODE:AUTO");

    if (autoTaskCount > 0) {
      lcdStatus("AUTO MODE", "Processing tasks...");
      sendToESP32("PROCESSING_TASKS");
    }
    return;
  }

  if (cmd == "MODE MANUAL") {
    currentMode = MODE_MANUAL;
    autoModeRunning = false;
    enableConveyorMotor(false);
    conveyorStepper.stop();
    convState = MANUAL_MODE;

    lcdStatus("MODE: MANUAL", "Ready");
    Serial.println("Switched to MANUAL mode");
    sendToESP32("MODE:MANUAL");
    return;
  }

  // ===== AUTO MODE CONTROL =====
  if (cmd == "AUTO START") {
    currentMode = MODE_AUTO;
    autoModeRunning = true;
    convState = IDLE;
    lcdStatus("AUTO MODE", "Starting...");
    sendToESP32("AUTO_STARTED");
    return;
  }

  if (cmd == "AUTO STOP") {
    autoModeRunning = false;
    convState = MANUAL_MODE;
    enableConveyorMotor(false);
    conveyorStepper.stop();
    lcdStatus("AUTO MODE", "Stopped");
    sendToESP32("AUTO_STOPPED");
    return;
  }

  // ===== AUTO STOCK COMMAND WITH STRATEGY =====
  if (cmd.startsWith("AUTO_STOCK:")) {
    String rfidTag = cmd.substring(11);
    rfidTag.trim();

    Serial.print("AUTO_STOCK command for RFID: ");
    Serial.println(rfidTag);

    lcdStatus("AUTO STOCK", "RFID: " + rfidTag);
    sendToESP32("AUTO_STOCK_START:" + rfidTag);

    currentRFID = rfidTag;
    lastTag = rfidTag;

    int col = -1, row = -1;
    if (getCellFromStrategy(col, row)) {
      targetCol = col;
      targetRow = row;

      int idx = findTagIndex(rfidTag);
      if (idx >= 0) lastSymbol = TAG_SYMBOLS[idx];
      else lastSymbol = '?';

      Serial.print("Target (Strategy): C");
      Serial.print(targetCol);
      Serial.print(" R");
      Serial.println(targetRow);

      lcdStatus("TAG:" + String(lastSymbol),
                "C" + String(targetCol) + " R" + String(targetRow));

      sendRFIDUpdate(rfidTag, String(lastSymbol));

      lcdStatus("AUTO STOCK", "Executing...");

      moveServosToPickupFromConveyor();

      if (targetCol > 0 && targetRow > 0) {
        goToColumn(targetCol);
        placeInRow_thenRetract(targetRow);
      }

      homeArm();
      returnToDefaultPosition();

      sendToESP32("AUTO_STOCK_COMPLETE");
    } else {
      lcdStatus("NO EMPTY CELL", "Check Warehouse");
      sendToESP32("AUTO_STOCK_ERROR:NO_EMPTY_CELL");
    }
    return;
  }

  // ===== BASIC COMMANDS =====
  if (cmd == "HOME") {
    Serial.println("CMD: HOME");
    lcdStatus("CMD: HOME", "");
    homeArm();
    returnToDefaultPosition();
    return;
  }

  if (cmd == "PICK") {
    Serial.println("CMD: PICK (conveyor)");
    lcdStatus("CMD: PICK", "From Conveyor");
    moveServosToPickupFromConveyor();
    homeArm();
    returnToDefaultPosition();
    return;
  }

  if (cmd.startsWith("GOTO ")) {
    int spaceIndex = cmd.indexOf(' ');
    if (spaceIndex < 0) return;
    int col = cmd.substring(spaceIndex + 1).toInt();
    Serial.print("CMD: GOTO ");
    Serial.println(col);
    goToColumn(col);
    homeArm();
    returnToDefaultPosition();
    return;
  }

  if (cmd.startsWith("PLACE ")) {
    int space1 = cmd.indexOf(' ');
    int space2 = cmd.indexOf(' ', space1 + 1);
    if (space1 < 0 || space2 < 0) return;

    int col = cmd.substring(space1 + 1, space2).toInt();
    int row = cmd.substring(space2 + 1).toInt();

    Serial.print("CMD: PLACE ");
    Serial.print(col);
    Serial.print(" ");
    Serial.println(row);

    targetCol = col;
    targetRow = row;

    goToColumn(col);
    placeInRow_thenRetract(row);
    homeArm();
    return;
  }

  if (cmd.startsWith("TAKE ")) {
    int space1 = cmd.indexOf(' ');
    int space2 = cmd.indexOf(' ', space1 + 1);
    if (space1 < 0 || space2 < 0) return;

    int col = cmd.substring(space1 + 1, space2).toInt();
    int row = cmd.substring(space2 + 1).toInt();

    Serial.print("CMD: TAKE ");
    Serial.print(col);
    Serial.print(" ");
    Serial.println(row);

    targetCol = col;
    targetRow = row;

    lcdStatus("TAKE CELL", "C" + String(col) + " R" + String(row));
    sendStatusUpdate("PICK_FROM_CELL_START");

    goToColumn(col);
    pickFromRow_thenRetract(row);
    homeArm();

    sendStatusUpdate("PICK_FROM_CELL_DONE");
    return;
  }

  if (cmd == "GET_IR_STATUS") {
    sendAllCellStatus();
    return;
  }

  if (cmd == "GET_LOADING_STATUS") {
    bool occupied = checkLoadingZoneOccupied();
    lcdStatus("LOADING ZONE", occupied ? "OCCUPIED" : "EMPTY");
    sendLoadingZoneUpdate(occupied);
    return;
  }

  if (cmd == "GET_STATUS") {
    sendSensorUpdate();
    sendAllCellStatus();
    checkLoadingZoneOccupied();
    return;
  }

  if (cmd.startsWith("ADD_TASK:")) {
    String taskCmd = cmd.substring(9);
    addAutoTask(taskCmd);
    lcdStatus("TASK ADDED", taskCmd);
    sendToESP32("TASK_ADDED:" + taskCmd);
    return;
  }

  Serial.println("Unknown command.");
  lcdStatus("CMD: UNKNOWN", "");
}

// ============================
//       LCD STATE UPDATE
// ============================
void updateLCDForState() {
  if (convState == prevConvState) return;
  prevConvState = convState;

  switch (convState) {
    case IDLE:
      lcdStatus("AUTO: IDLE", "Waiting LDR1");
      sendToESP32("STATE:IDLE");
      break;
    case MOVE_12CM:
      lcdStatus("AUTO: MOVE", "Moving 12cm");
      sendToESP32("STATE:MOVE_12CM");
      break;
    case WAIT_RFID:
      lcdStatus("AUTO: WAIT", "Reading RFID");
      sendToESP32("STATE:WAIT_RFID");
      break;
    case MOVING_TO_LDR2:
      lcdStatus("AUTO: MOVE", "To LDR2");
      sendToESP32("STATE:MOVING_TO_LDR2");
      break;
    case STOPPED:
      lcdStatus("AUTO: STOP", "Clear LDR2");
      sendToESP32("STATE:STOPPED");
      break;
    case MANUAL_MODE:
      lcdStatus("MANUAL MODE", "Ready");
      sendToESP32("STATE:MANUAL_MODE");
      break;
  }
}

// ============================
//       SETUP FUNCTION
// ============================
void setup() {
  Serial.begin(115200);
  ESP_SERIAL.begin(ESP_BAUD);

  lcd.init();
  lcd.backlight();
  lcdStatus("SYSTEM START", "Initializing...");

  Serial.println("=== SMART WAREHOUSE SYSTEM ===");
  Serial.println("COMPLETE VERSION WITH IR & ULTRASONIC");
  Serial.println("==============================");

  pinMode(ARM_DIR_PIN, OUTPUT);
  pinMode(ARM_STEP_PIN, OUTPUT);
  pinMode(ARM_ENABLE_PIN, OUTPUT);
  pinMode(LIMIT_SWITCH_PIN, INPUT_PULLUP);
  digitalWrite(ARM_ENABLE_PIN, LOW);

  s1.attach(S1_PIN);
  s2.attach(S2_PIN);
  s3.attach(S3_PIN);
  s4.attach(S4_PIN);
  s5.attach(S5_PIN);
  s6.attach(S6_PIN);
  loadingServo.attach(LOADING_SERVO_PIN);

  s1.write(s1Default); delay(100);
  s2.write(s2Default); delay(100);
  s3.write(s3Default); delay(100);
  s4.write(s4Default); delay(100);
  s5.write(s5Default); delay(100);
  s6.write(s6Default); delay(100);
  loadingServo.write(loadingServoDefault); delay(100);

  setupIRSensors();
  for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
      cellOccupied[row][col] = digitalRead(IR_PINS[row][col]) == LOW;
      lastCellStatus[row][col] = cellOccupied[row][col];
    }
  }

  pinMode(LDR1_PIN, INPUT_PULLUP);
  pinMode(LDR2_PIN, INPUT_PULLUP);

  setupConveyorStepper();

  Serial1.begin(115200);
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("ERROR: PN532 not found!");
    lcdStatus("ERROR", "PN532 not found");
    while (1);
  }
  nfc.SAMConfig();
  Serial.println("PN532 ready.");

  homeArm();
  returnToDefaultPosition();

  autoTaskCount = 0;
  currentTaskIndex = -1;

  randomSeed(analogRead(0));

  lcdStatus("READY", "Mode: MANUAL");
  sendToESP32("ARDUINO:READY");

  sendAllCellStatus();
  checkLoadingZoneOccupied();

  Serial.println("System Ready! (Complete Version with IR & Ultrasonic)");
}

void loop() {
  static unsigned long lastSensorUpdate = 0;
  static unsigned long lastIRCheck = 0;
  static unsigned long lastUltrasonicCheck = 0;

  conveyorStepper.run();

  // Check IR sensors every 500ms
  if (millis() - lastIRCheck > 500) {
    updateCellOccupancyFromSensors();
    lastIRCheck = millis();
  }

  // Check loading zone every 1 second
  if (millis() - lastUltrasonicCheck > 1000) {
    checkLoadingZoneOccupied();
    lastUltrasonicCheck = millis();
  }

  // Send sensor updates every 500ms
  if (millis() - lastSensorUpdate > 500) {
    sendSensorUpdate();
    lastSensorUpdate = millis();
  }

  // AUTO MODE LOGIC
  if (currentMode == MODE_AUTO && autoModeRunning) {
    updateLCDForState();

    bool ldr1Active = readLDRStable(LDR1_PIN);
    bool ldr2Active = readLDRStable(LDR2_PIN);

    switch (convState) {
      case IDLE:
        enableConveyorMotor(false);
        conveyorStepper.stop();

        if (autoTaskCount > 0) {
          processNextAutoTask();
          delay(1000);
        } else if (ldr1Active) {
          Serial.println("LDR1: Object detected -> start 12cm");
          lcdStatus("AUTO: START", "LDR1 detected");

          enableConveyorMotor(true);
          delay(150);

          conveyorStepper.setCurrentPosition(0);
          conveyorStepper.move(STEPS_PER_12CM);
          sendStatusUpdate("MOVING_12CM_AUTO");

          convState = MOVE_12CM;
        }
        break;

      case MOVE_12CM:
        if (ldr2Active) {
          Serial.println("LDR2 triggered during 12cm");
          conveyorStepper.stop();
          enableConveyorMotor(false);
          sendStatusUpdate("12CM_LDR2_HIT");
          convState = WAIT_RFID;
        } else if (conveyorStepper.distanceToGo() == 0) {
          Serial.println("12cm move finished");
          enableConveyorMotor(false);
          sendStatusUpdate("12CM_COMPLETE_AUTO");
          convState = WAIT_RFID;
        }
        break;

      case WAIT_RFID: {
        bool rfidFound = false;
        unsigned long startTime = millis();

        Serial.println("Scanning for RFID...");
        lcdStatus("AUTO: WAIT", "Scanning RFID");

        while (millis() - startTime < 3000) {
          String tag;
          if (tryReadRFID(tag)) {
            Serial.print("RFID: "); Serial.println(tag);
            currentRFID = tag;
            lastTag = tag;

            int idx = findTagIndex(tag);
            if (idx >= 0) {
              lastSymbol = TAG_SYMBOLS[idx];

              if (getCellFromStrategy(targetCol, targetRow)) {
                Serial.print("Strategy selected: C"); Serial.print(targetCol);
                Serial.print(" R"); Serial.println(targetRow);

                lcdStatus("TAG:" + String(lastSymbol),
                          "C" + String(targetCol) + " R" + String(targetRow));

                sendRFIDUpdate(tag, String(lastSymbol));
                sendCellUpdate(targetCol, targetRow, "DETECTED", "RESERVED");
              } else {
                Serial.println("No empty cell available!");
                lcdStatus("NO EMPTY CELL", "Check Warehouse");
                targetCol = -1;
                targetRow = -1;
              }
            } else {
              Serial.println("Unknown tag");
              lcdStatus("TAG UNKNOWN", "No target");
              lastSymbol = '?';
              targetCol = -1;
              targetRow = -1;
            }

            rfidFound = true;
            break;
          }
          delay(100);
        }

        convState = MOVING_TO_LDR2;
        if (!rfidFound) {
          Serial.println("No RFID found");
          lastSymbol = '?';
          targetCol = -1;
          targetRow = -1;
        }
        break;
      }

      case MOVING_TO_LDR2:
        moveConveyorToLDR2Smooth();
        lcdStatus("AUTO: PICK", "LDR2 detected");
        delay(300);

        returnToDefaultPosition();
        moveServosToPickupFromConveyor();

        if (targetCol > 0 && targetRow > 0) {
          Serial.print("Placing at C"); Serial.print(targetCol);
          Serial.print(" R"); Serial.println(targetRow);

          lcdStatus("PLACE " + String(lastSymbol),
                   "C" + String(targetCol) + " R" + String(targetRow));

          goToColumn(targetCol);
          placeInRow_thenRetract(targetRow);
        } else {
          Serial.println("No target - going home");
          lcdStatus("NO TARGET", "Going home");
          homeArm();
          returnToDefaultPosition();
        }

        returnToDefaultPosition();
        homeArm();

        targetCol = -1;
        targetRow = -1;
        lastSymbol = '?';
        lastTag = "";
        currentRFID = "";

        convState = STOPPED;
        break;

      case STOPPED:
        enableConveyorMotor(false);

        if (!ldr2Active) {
          Serial.println("LDR2 cleared - ready");
          conveyorStepper.setCurrentPosition(0);
          convState = IDLE;

          if (autoTaskCount > 0) delay(2000);
        }
        break;

      case MANUAL_MODE:
        break;
    }
  } else {
    if (convState != MANUAL_MODE) {
      enableConveyorMotor(false);
      conveyorStepper.stop();
      convState = MANUAL_MODE;
      prevConvState = (RunState)(-1);
    }
  }

  if (Serial.available()) {
    String cmd = readCommand(Serial);
    handleCommand(cmd);
  }

  if (ESP_SERIAL.available()) {
    String cmd = readCommand(ESP_SERIAL);
    handleCommand(cmd);
  }
}
