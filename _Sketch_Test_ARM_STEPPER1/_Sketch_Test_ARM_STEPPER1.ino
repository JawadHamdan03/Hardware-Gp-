const int DIR = 5;
const int STEP = 6;
const int EN = 7;

const long testSteps = 200;    
const int stepDelayUs = 800; 
void setup()
{
   Serial.begin(115200);
  pinMode(DIR_PIN, OUTPUT);
  pinMode(STEP_PIN, OUTPUT);
  if (ENABLE_PIN >= 0) pinMode(ENABLE_PIN, OUTPUT);
  if (ENABLE_PIN >= 0) digitalWrite(ENABLE_PIN, LOW);

  digitalWrite(DIR, HIGH);

  for (long i = 0; i < testSteps; i++) {
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(2);
    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(stepDelayUs);
  }
}

void loop()
{
  
}