#include <PN532_HSU.h>
#include <PN532.h>
#include <AccelStepper.h>

// ---------- Pins ----------
#define DIR_PIN   5
#define STEP_PIN  6
#define EN_PIN    7
#define LDR1_PIN  9   // أول حساس (بداية القشط)
#define LDR2_PIN  8   // ثاني حساس (نهاية القشط)

// ---------- Settings ----------
const bool LDR_ACTIVE_LOW = true;   // LOW = جسم موجود
const float STEPPER_SPEED = 2000.0; // سرعة متوسطة إلى عالية
const float STEPPER_ACCEL = 1200.0;
const long STEPS_PER_12CM = 600;    // 12 سم = 600 ستيب

// ---------- PN532 ----------
PN532_HSU pn532hsu(Serial1);
PN532 nfc(pn532hsu);

// ---------- Stepper ----------
AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);

// ---------- State machine ----------
enum RunState {
  IDLE,         // لا شيء
  MOVE_12CM,    // تحريك الجسم 12 سم بعد LDR1
  WAIT_RFID,    // محاولة قراءة RFID
  MOVING,       // يتحرك بعد قراءة التاج
  STOPPED       // توقف عند LDR2
};
RunState state = IDLE;

// ---------- Helpers ----------
bool readLDR(uint8_t pin) {
  int raw = digitalRead(pin);
  return LDR_ACTIVE_LOW ? (raw == LOW) : (raw == HIGH);
}

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
  bool success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50);
  if (!success) return false;
  outStr = uidToString(uid, uidLength);
  return true;
}

void enableMotor(bool enable) {
  digitalWrite(EN_PIN, enable ? LOW : HIGH); // LOW = enable
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  Serial.println(F("=== Conveyor + PN532 + Dual LDR ==="));

  pinMode(LDR1_PIN, INPUT_PULLUP);
  pinMode(LDR2_PIN, INPUT_PULLUP);
  pinMode(EN_PIN, OUTPUT);
  enableMotor(false);

  // Stepper setup
  stepper.setMaxSpeed(STEPPER_SPEED);
  stepper.setAcceleration(STEPPER_ACCEL);

  // PN532 setup
  Serial1.begin(115200);
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println(F("❌ PN532 not found!"));
    while (1);
  }
  nfc.SAMConfig();
  Serial.println(F("✅ PN532 Ready."));
  Serial.println(F("Waiting for object at LDR1..."));
}

// ---------- Loop ----------
void loop() {
  stepper.run(); // يحافظ على الحركة الناعمة

  switch (state) {

    case IDLE:
      if (readLDR(LDR1_PIN)) {
        Serial.println(F("📦 Object detected at LDR1 — moving 12cm..."));
        enableMotor(true);
        stepper.moveTo(stepper.currentPosition() + STEPS_PER_12CM);
        state = MOVE_12CM;
      }
      break;

    case MOVE_12CM:
      if (stepper.distanceToGo() == 0) {
        Serial.println(F("📏 12cm reached — trying to read RFID..."));
        state = WAIT_RFID;
      }
      break;

    case WAIT_RFID: {
      String tag;
      if (tryReadRFID(tag)) {
        Serial.print(F("✅ RFID Tag read: "));
        Serial.println(tag);
        // بعد قراءة التاج يبدأ التحرك المستمر
        stepper.moveTo(999999); // يتحرك باستمرار للأمام
        Serial.println(F("▶ Conveyor moving until LDR2 triggered..."));
        state = MOVING;
      }
      break;
    }

    case MOVING:
      if (readLDR(LDR2_PIN)) {
        Serial.println(F("⛔ LDR2 detected object — stopping conveyor."));
        stepper.stop();
        enableMotor(false);
        state = STOPPED;
      }
      break;

    case STOPPED:
      if (!readLDR(LDR2_PIN)) {
        Serial.println(F("✅ Object cleared — back to idle."));
        stepper.setCurrentPosition(0);
        state = IDLE;
      }
      break;
  }
}