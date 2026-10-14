#include <Arduino.h>
#include <U8g2lib.h>
#include <Wire.h>

// ============================================================
// I2C pin selection.
// Arduino Uno:    SCL = A5, SDA = A4
// ESP32-CAM:      default Wire pins are GPIO21(SDA)/GPIO22(SCL),
//                 but on the AI-Thinker board those are camera
//                 pins (Y5 / PCLK), so use free GPIOs instead:
//                 SDA = GPIO14, SCL = GPIO15.
// ============================================================
#if defined(ESP_PLATFORM) || defined(ARDUINO_ARCH_ESP32)
  #define OLED_SDA 14
  #define OLED_SCL 15
#else
  #define OLED_SDA SDA
  #define OLED_SCL SCL
#endif

U8G2_SSD1306_128X64_NONAME_1_HW_I2C u8g2(
  U8G2_R0,
  U8X8_PIN_NONE,
  OLED_SCL,
  OLED_SDA
);

char serialBuf[128];
uint8_t serialIdx = 0;

uint8_t batteryLevel = 100;
bool isCharging = false;
bool isRaining = false;
bool btConnected = false;

// 10 Emotions
enum Emotion { E_HAPPY, E_NORMAL, E_SAD, E_ANGRY, E_CHARGING,
              E_SLEEPY, E_EXCITED, E_WORRIED, E_COOL, E_ALERT };
Emotion currentEmotion = E_HAPPY;

enum Mode { FACE, CLIPBOARD, ALERT, DASHBOARD, WEATHER_SUNNY, WEATHER_MONSOON };
Mode currentMode = FACE;

char clipText[128] = "";
char alertText[128] = "";
char dashText[128] = "";

unsigned long modeStart = 0;
#define ALERT_TIMEOUT 5000
#define DASH_TIMEOUT 8000
#define CLIP_TIMEOUT 10000
#define WEATHER_TIMEOUT 300000

unsigned long lastBlink = 0;

// Rain
#define MAX_DROPS 15
int8_t dropY[MAX_DROPS];
int8_t dropX[MAX_DROPS];

// Scroll
int16_t scrollX = 128;

// Charging bolt
uint8_t boltFrame = 0;
unsigned long lastBoltFrame = 0;

// Particles
#define NUM_PARTICLES 8
int8_t partX[NUM_PARTICLES] = {38, 48, 57, 67, 77, 87, 52, 72};
int8_t partY[NUM_PARTICLES] = {58, 50, 42, 55, 47, 59, 35, 52};

// Sunny
uint8_t sunAngle = 0;
#define NUM_RAYS 8

// Fast sin/cos lookup (0-255 mapped to 0-360 degrees)
const int8_t sinLUT[64] = {
   0,  6, 12, 18, 23, 28, 33, 38, 42, 46, 49, 52, 55, 57, 59, 61,
  62, 63, 63, 63, 62, 61, 59, 57, 55, 52, 49, 46, 42, 38, 33, 28,
  23, 18, 12,  6,  0, -6,-12,-18,-23,-28,-33,-38,-42,-46,-49,-52,
 -55,-57,-59,-61,-62,-63,-63,-63,-62,-61,-59,-57,-55,-52,-49,-46
};
int8_t fastSin(uint8_t angle) { return sinLUT[angle % 64]; }
int8_t fastCos(uint8_t angle) { return sinLUT[(angle + 16) % 64]; }

// Monsoon
#define MAX_MONSOON_DROPS 20
int8_t mDropY[MAX_MONSOON_DROPS];
int8_t mDropX[MAX_MONSOON_DROPS];
uint8_t cloudX = 0;

void initRain() {
  for (uint8_t i = 0; i < MAX_DROPS; i++) {
    dropX[i] = random(5, 123);
    dropY[i] = random(-64, 0);
  }
}

void initMonsoon() {
  cloudX = 0;
  for (uint8_t i = 0; i < MAX_MONSOON_DROPS; i++) {
    mDropX[i] = random(0, 128);
    mDropY[i] = random(-64, 0);
  }
}

void drawRainDrop() {
  for (uint8_t i = 0; i < MAX_DROPS; i++) {
    dropY[i] += 4;
    if (dropY[i] > 64) {
      dropY[i] = random(-30, 0);
      dropX[i] = random(5, 123);
    }
    u8g2.drawVLine(dropX[i], dropY[i], 3);
  }
}

// =====================================================
// TOP BAR: Battery % (top left) + BT icon (top right)
// =====================================================
void drawTopBar() {
  u8g2.setDrawColor(1);
  u8g2.setFont(u8g2_font_6x10_tf);

  // Battery % - top left
  char buf[10];
  if (isCharging && batteryLevel < 100) {
    sprintf(buf, "%d%%+", batteryLevel);
  } else {
    sprintf(buf, "%d%%", batteryLevel);
  }
  u8g2.drawStr(0, 10, buf);

  // Bluetooth icon - top right
  if (btConnected) {
    u8g2.drawVLine(122, 2, 7);
    u8g2.drawPixel(119, 4);
    u8g2.drawPixel(125, 4);
    u8g2.drawPixel(119, 8);
    u8g2.drawPixel(125, 8);
  }
}

// =====================================================
// CHARGING ANIMATION
// =====================================================
void drawChargeBattery() {
  u8g2.setDrawColor(1);
  u8g2.drawRFrame(43, 2, 42, 11, 3);
  u8g2.drawBox(85, 5, 3, 5);
  uint8_t fillW = (batteryLevel * 36) / 100;
  if (fillW > 0) u8g2.drawBox(46, 5, fillW, 5);
  u8g2.drawTriangle(66, 4, 61, 9, 66, 9);
  u8g2.drawTriangle(66, 9, 71, 4, 66, 4);
}

void drawChargingEyes() {
  u8g2.setDrawColor(1);
  u8g2.drawRBox(25, 22, 22, 28, 11);
  u8g2.drawRBox(81, 22, 22, 28, 11);
}

void drawChargingMouth() {
  u8g2.setDrawColor(1);
  u8g2.drawHLine(45, 56, 38);
}

void drawParticles() {
  u8g2.setDrawColor(1);
  for (uint8_t i = 0; i < NUM_PARTICLES; i++) {
    if (i % 3 == 0) u8g2.drawDisc(partX[i], partY[i], 2);
    else u8g2.drawPixel(partX[i], partY[i]);
  }
}

void moveParticles() {
  for (uint8_t i = 0; i < NUM_PARTICLES; i++) {
    partY[i] -= 2;
    if (partY[i] < 15) {
      partY[i] = 60;
      partX[i] += 7;
      if (partX[i] > 90) partX[i] = 35 + (i * 5);
    }
  }
}

void showChargingIntro() {
  for (uint8_t f = 0; f < 4; f++) moveParticles();
  u8g2.firstPage();
  do {
    drawChargeBattery();
    drawChargingEyes();
    drawChargingMouth();
    drawParticles();
  } while (u8g2.nextPage());
}

// =====================================================
// CHARGING BOLT (small, top right of face)
// =====================================================
void drawChargingBolt() {
  int8_t yOff = 0;
  if (millis() - lastBoltFrame > 300) {
    boltFrame = (boltFrame + 1) % 3;
    lastBoltFrame = millis();
  }
  if (boltFrame == 0) yOff = -1;
  else if (boltFrame == 2) yOff = 1;
  u8g2.setDrawColor(1);
  u8g2.drawTriangle(114, 14 + yOff, 108, 24 + yOff, 116, 22 + yOff);
  u8g2.drawTriangle(108, 24 + yOff, 116, 24 + yOff, 110, 32 + yOff);
}

// =====================================================
// 10 EMOTIONS FACE (centered, below top bar)
// =====================================================
void showEmotionFace() {
  unsigned long now = millis();
  bool blinking = (now - lastBlink > 3000 + random(0, 2000));

  // Blink
  if (blinking) {
    u8g2.firstPage();
    do {
      drawTopBar();
      u8g2.setDrawColor(1);
      u8g2.drawHLine(22, 30, 28);   // Left eye closed
      u8g2.drawHLine(78, 30, 28);   // Right eye closed
      u8g2.drawVLine(63, 36, 8);    // Nose
      u8g2.drawHLine(48, 52, 32);   // Mouth
      if (isCharging && batteryLevel < 100) drawChargingBolt();
      if (isRaining) drawRainDrop();
    } while (u8g2.nextPage());
    delay(120);
    lastBlink = now;
  }

  u8g2.firstPage();
  do {
    drawTopBar();
    u8g2.setDrawColor(1);

    switch (currentEmotion) {
      // ---- 0: HAPPY (big eyes, smile) ----
      case E_HAPPY:
        u8g2.drawRBox(18, 14, 32, 26, 12);
        u8g2.drawDisc(34, 27, 7);
        u8g2.drawRBox(78, 14, 32, 26, 12);
        u8g2.drawDisc(94, 27, 7);
        u8g2.drawVLine(63, 34, 8);
        u8g2.drawLine(48, 52, 54, 56);
        u8g2.drawHLine(54, 56, 20);
        u8g2.drawLine(74, 56, 80, 52);
        break;

      // ---- 1: NORMAL (big eyes, straight mouth) ----
      case E_NORMAL:
        u8g2.drawRBox(18, 14, 32, 26, 12);
        u8g2.drawDisc(34, 27, 7);
        u8g2.drawRBox(78, 14, 32, 26, 12);
        u8g2.drawDisc(94, 27, 7);
        u8g2.drawVLine(63, 34, 8);
        u8g2.drawHLine(48, 52, 32);
        break;

      // ---- 2: SAD (droopy eyes, frown + tears) ----
      case E_SAD:
        u8g2.drawRBox(18, 18, 32, 24, 12);
        u8g2.drawDisc(34, 30, 6);
        u8g2.drawRBox(78, 18, 32, 24, 12);
        u8g2.drawDisc(94, 30, 6);
        u8g2.drawVLine(63, 36, 6);
        u8g2.drawLine(48, 56, 54, 52);
        u8g2.drawHLine(54, 52, 20);
        u8g2.drawLine(74, 52, 80, 56);
        u8g2.drawDisc(28, 44, 2);
        u8g2.drawDisc(88, 44, 2);
        break;

      // ---- 3: ANGRY (eyebrows, gritted teeth) ----
      case E_ANGRY:
        u8g2.drawRBox(18, 18, 32, 24, 12);
        u8g2.drawDisc(34, 30, 7);
        u8g2.drawRBox(78, 18, 32, 24, 12);
        u8g2.drawDisc(94, 30, 7);
        u8g2.drawLine(18, 14, 36, 18);
        u8g2.drawLine(96, 14, 78, 18);
        u8g2.drawVLine(63, 36, 6);
        u8g2.drawHLine(48, 52, 32);
        u8g2.drawVLine(56, 52, 5);
        u8g2.drawVLine(64, 52, 5);
        u8g2.drawVLine(72, 52, 5);
        break;

      // ---- 4: CHARGING ----
      case E_CHARGING:
        u8g2.drawRBox(18, 14, 32, 26, 12);
        u8g2.drawDisc(34, 27, 7);
        u8g2.drawRBox(78, 14, 32, 26, 12);
        u8g2.drawDisc(94, 27, 7);
        u8g2.drawVLine(63, 34, 8);
        u8g2.drawHLine(48, 52, 32);
        drawChargingBolt();
        break;

      // ---- 5: SLEEPY (half eyes, Z's) ----
      case E_SLEEPY:
        u8g2.drawRBox(18, 22, 32, 18, 9);
        u8g2.drawDisc(34, 31, 5);
        u8g2.drawRBox(78, 22, 32, 18, 9);
        u8g2.drawDisc(94, 31, 5);
        u8g2.drawVLine(63, 36, 6);
        u8g2.drawHLine(48, 52, 32);
        // Z's
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(106, 14, "z");
        u8g2.drawStr(112, 8, "z");
        break;

      // ---- 6: EXCITED (wide eyes, open mouth, stars) ----
      case E_EXCITED:
        u8g2.drawRBox(16, 12, 34, 28, 14);
        u8g2.drawDisc(33, 26, 9);
        u8g2.drawRBox(76, 12, 34, 28, 14);
        u8g2.drawDisc(93, 26, 9);
        u8g2.drawVLine(63, 34, 8);
        u8g2.drawCircle(64, 54, 5);
        u8g2.drawDisc(8, 12, 2);
        u8g2.drawDisc(120, 12, 2);
        u8g2.drawDisc(8, 56, 2);
        u8g2.drawDisc(120, 56, 2);
        break;

      // ---- 7: WORRIED (uneven eyes, wavy mouth) ----
      case E_WORRIED:
        u8g2.drawRBox(18, 16, 32, 24, 12);
        u8g2.drawDisc(34, 28, 7);
        u8g2.drawRBox(78, 14, 32, 26, 12);
        u8g2.drawDisc(94, 27, 7);
        u8g2.drawLine(20, 12, 36, 16);
        u8g2.drawLine(96, 18, 78, 14);
        u8g2.drawVLine(63, 36, 6);
        u8g2.drawLine(48, 54, 54, 50);
        u8g2.drawLine(54, 50, 60, 54);
        u8g2.drawLine(60, 54, 66, 50);
        u8g2.drawLine(66, 50, 72, 54);
        u8g2.drawLine(72, 54, 80, 50);
        break;

      // ---- 8: COOL (sunglasses, smirk) ----
      case E_COOL:
        u8g2.drawBox(16, 20, 36, 12);
        u8g2.drawBox(76, 20, 36, 12);
        u8g2.drawHLine(52, 24, 24);
        u8g2.drawPixel(22, 24);
        u8g2.drawPixel(82, 24);
        u8g2.drawVLine(63, 36, 8);
        u8g2.drawLine(48, 52, 64, 52);
        u8g2.drawLine(64, 52, 80, 48);
        break;

      // ---- 9: ALERT (wide eyes, O mouth) ----
      case E_ALERT:
        u8g2.drawRBox(16, 12, 34, 28, 14);
        u8g2.drawDisc(33, 26, 9);
        u8g2.drawRBox(76, 12, 34, 28, 14);
        u8g2.drawDisc(93, 26, 9);
        u8g2.drawVLine(63, 34, 8);
        u8g2.drawCircle(64, 54, 5);
        u8g2.drawVLine(4, 14, 16);
        u8g2.drawDisc(4, 36, 2);
        break;
    }

    if (isCharging && batteryLevel < 100 && currentEmotion != E_CHARGING) drawChargingBolt();
    if (isRaining) drawRainDrop();

  } while (u8g2.nextPage());
}

// =====================================================
// SCROLL TEXT
// =====================================================
void showScrollText(const char* text) {
  scrollX -= 2;
  int16_t textW = strlen(text) * 7;
  if (scrollX < -textW) scrollX = 128;

  u8g2.firstPage();
  do {
    drawTopBar();
    u8g2.setDrawColor(1);
    u8g2.setFont(u8g2_font_7x14_tf);
    u8g2.drawStr(scrollX, 40, text);
  } while (u8g2.nextPage());
}

// =====================================================
// SHOW TEXT
// =====================================================
void drawTextPage(const char* text) {
  u8g2.setDrawColor(1);
  u8g2.setFont(u8g2_font_7x14_tf);
  uint8_t y = 24;
  uint8_t col = 0;
  for (uint8_t i = 0; text[i]; i++) {
    if (text[i] == '|') {
      y += 16;
      col = 0;
      if (y > 62) break;
    } else {
      char s[2] = {text[i], '\0'};
      u8g2.drawStr(col * 7, y, s);
      col++;
      if (col >= 18) { col = 0; y += 16; if (y > 62) break; }
    }
  }
}

void showAlert() {
  u8g2.firstPage();
  do {
    drawTopBar();
    drawTextPage(alertText);
    if (isRaining) drawRainDrop();
  } while (u8g2.nextPage());
}

void showDash() {
  u8g2.firstPage();
  do {
    drawTopBar();
    drawTextPage(dashText);
    if (isRaining) drawRainDrop();
  } while (u8g2.nextPage());
}

// =====================================================
// SUNNY
// =====================================================
void showSunny() {
  sunAngle += 4;
  u8g2.firstPage();
  do {
    drawTopBar();
    u8g2.setDrawColor(1);
    u8g2.drawDisc(64, 32, 12);
    u8g2.drawCircle(64, 32, 16);
    for (uint8_t i = 0; i < NUM_RAYS; i++) {
      uint8_t a = sunAngle + (i * 32);
      int8_t s = fastSin(a);
      int8_t c = fastCos(a);
      int16_t x1 = 64 + (c * 20) / 63;
      int16_t y1 = 32 + (s * 20) / 63;
      int16_t x2 = 64 + (c * 28) / 63;
      int16_t y2 = 32 + (s * 28) / 63;
      u8g2.drawLine(x1, y1, x2, y2);
    }
    for (uint8_t i = 0; i < 128; i += 8) {
      int8_t waveY = 58 + (fastSin((i / 4) + sunAngle) / 8);
      u8g2.drawPixel(i, waveY);
      u8g2.drawPixel(i + 1, waveY);
    }
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(30, 64, "SUNNY DAY!");
  } while (u8g2.nextPage());
}

// =====================================================
// MONSOON
// =====================================================
void showMonsoon() {
  u8g2.firstPage();
  do {
    drawTopBar();
    u8g2.setDrawColor(1);
    u8g2.drawDisc(40 + cloudX, 18, 10);
    u8g2.drawDisc(60 + cloudX, 14, 12);
    u8g2.drawDisc(80 + cloudX, 18, 10);
    u8g2.drawBox(30 + cloudX, 18, 62, 8);
    for (uint8_t i = 0; i < MAX_MONSOON_DROPS; i++) {
      mDropY[i] += 5;
      if (mDropY[i] > 64) {
        mDropY[i] = random(-20, 0);
        mDropX[i] = random(0, 128);
      }
      u8g2.drawLine(mDropX[i], mDropY[i], mDropX[i] - 2, mDropY[i] + 6);
    }
    for (uint8_t i = 0; i < 128; i += 20) {
      u8g2.drawDisc(i + 10, 62, 4);
    }
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(18, 64, "MONSOON RAIN!");
  } while (u8g2.nextPage());
  cloudX = (cloudX + 1) % 30;
}

// =====================================================
// DEMO MODE - cycle all 10 emotions
// =====================================================
const char* emotionNames[] = {
  "Happy", "Normal", "Sad", "Angry", "Charging",
  "Sleepy", "Excited", "Worried", "Cool", "Alert"
};

void showDemoEmotion(uint8_t idx) {
  currentEmotion = (Emotion)idx;
  unsigned long start = millis();

  while (millis() - start < 2000) {  // 2 seconds each
    unsigned long now = millis();
    bool blinking = (now - lastBlink > 3000 + random(0, 2000));
    if (blinking) {
      u8g2.firstPage();
      do {
        drawTopBar();
        u8g2.setDrawColor(1);
        u8g2.drawHLine(22, 30, 28);
        u8g2.drawHLine(78, 30, 28);
        u8g2.drawVLine(63, 36, 8);
        u8g2.drawHLine(48, 52, 32);
      } while (u8g2.nextPage());
      delay(120);
      lastBlink = now;
    }

    u8g2.firstPage();
    do {
      drawTopBar();
      u8g2.setDrawColor(1);

      // Draw emotion face
      switch (currentEmotion) {
        case E_HAPPY:
          u8g2.drawRBox(18, 14, 32, 26, 12);
          u8g2.drawDisc(34, 27, 7);
          u8g2.drawRBox(78, 14, 32, 26, 12);
          u8g2.drawDisc(94, 27, 7);
          u8g2.drawVLine(63, 34, 8);
          u8g2.drawLine(48, 52, 54, 56);
          u8g2.drawHLine(54, 56, 20);
          u8g2.drawLine(74, 56, 80, 52);
          break;
        case E_NORMAL:
          u8g2.drawRBox(18, 14, 32, 26, 12);
          u8g2.drawDisc(34, 27, 7);
          u8g2.drawRBox(78, 14, 32, 26, 12);
          u8g2.drawDisc(94, 27, 7);
          u8g2.drawVLine(63, 34, 8);
          u8g2.drawHLine(48, 52, 32);
          break;
        case E_SAD:
          u8g2.drawRBox(18, 18, 32, 24, 12);
          u8g2.drawDisc(34, 30, 6);
          u8g2.drawRBox(78, 18, 32, 24, 12);
          u8g2.drawDisc(94, 30, 6);
          u8g2.drawVLine(63, 36, 6);
          u8g2.drawLine(48, 56, 54, 52);
          u8g2.drawHLine(54, 52, 20);
          u8g2.drawLine(74, 52, 80, 56);
          u8g2.drawDisc(28, 44, 2);
          u8g2.drawDisc(88, 44, 2);
          break;
        case E_ANGRY:
          u8g2.drawRBox(18, 18, 32, 24, 12);
          u8g2.drawDisc(34, 30, 7);
          u8g2.drawRBox(78, 18, 32, 24, 12);
          u8g2.drawDisc(94, 30, 7);
          u8g2.drawLine(18, 14, 36, 18);
          u8g2.drawLine(96, 14, 78, 18);
          u8g2.drawVLine(63, 36, 6);
          u8g2.drawHLine(48, 52, 32);
          u8g2.drawVLine(56, 52, 5);
          u8g2.drawVLine(64, 52, 5);
          u8g2.drawVLine(72, 52, 5);
          break;
        case E_CHARGING:
          u8g2.drawRBox(18, 14, 32, 26, 12);
          u8g2.drawDisc(34, 27, 7);
          u8g2.drawRBox(78, 14, 32, 26, 12);
          u8g2.drawDisc(94, 27, 7);
          u8g2.drawVLine(63, 34, 8);
          u8g2.drawHLine(48, 52, 32);
          drawChargingBolt();
          break;
        case E_SLEEPY:
          u8g2.drawRBox(18, 22, 32, 18, 9);
          u8g2.drawDisc(34, 31, 5);
          u8g2.drawRBox(78, 22, 32, 18, 9);
          u8g2.drawDisc(94, 31, 5);
          u8g2.drawVLine(63, 36, 6);
          u8g2.drawHLine(48, 52, 32);
          u8g2.setFont(u8g2_font_6x10_tf);
          u8g2.drawStr(106, 14, "z");
          u8g2.drawStr(112, 8, "z");
          break;
        case E_EXCITED:
          u8g2.drawRBox(16, 12, 34, 28, 14);
          u8g2.drawDisc(33, 26, 9);
          u8g2.drawRBox(76, 12, 34, 28, 14);
          u8g2.drawDisc(93, 26, 9);
          u8g2.drawVLine(63, 34, 8);
          u8g2.drawCircle(64, 54, 5);
          u8g2.drawDisc(8, 12, 2);
          u8g2.drawDisc(120, 12, 2);
          break;
        case E_WORRIED:
          u8g2.drawRBox(18, 16, 32, 24, 12);
          u8g2.drawDisc(34, 28, 7);
          u8g2.drawRBox(78, 14, 32, 26, 12);
          u8g2.drawDisc(94, 27, 7);
          u8g2.drawLine(20, 12, 36, 16);
          u8g2.drawLine(96, 18, 78, 14);
          u8g2.drawVLine(63, 36, 6);
          u8g2.drawLine(48, 54, 54, 50);
          u8g2.drawLine(54, 50, 60, 54);
          u8g2.drawLine(60, 54, 66, 50);
          u8g2.drawLine(66, 50, 72, 54);
          break;
        case E_COOL:
          u8g2.drawBox(16, 20, 36, 12);
          u8g2.drawBox(76, 20, 36, 12);
          u8g2.drawHLine(52, 24, 24);
          u8g2.drawPixel(22, 24);
          u8g2.drawPixel(82, 24);
          u8g2.drawVLine(63, 36, 8);
          u8g2.drawLine(48, 52, 64, 52);
          u8g2.drawLine(64, 52, 80, 48);
          break;
        case E_ALERT:
          u8g2.drawRBox(16, 12, 34, 28, 14);
          u8g2.drawDisc(33, 26, 9);
          u8g2.drawRBox(76, 12, 34, 28, 14);
          u8g2.drawDisc(93, 26, 9);
          u8g2.drawVLine(63, 34, 8);
          u8g2.drawCircle(64, 54, 5);
          u8g2.drawVLine(4, 14, 16);
          u8g2.drawDisc(4, 36, 2);
          break;
      }

      // Emotion name at bottom
      u8g2.setFont(u8g2_font_6x10_tf);
      u8g2.drawStr(40, 64, emotionNames[currentEmotion]);

    } while (u8g2.nextPage());
    delay(100);
  }
}

void runDemo() {
  for (uint8_t i = 0; i <= 9; i++) {
    showDemoEmotion(i);
  }
}

// =====================================================
// SERIAL HANDLER
// =====================================================
void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      if (serialIdx > 0) {
        serialBuf[serialIdx] = '\0';

        // Check BT FIRST (starts with B)
        if (serialBuf[0] == 'B' && serialBuf[1] == 'T') {
          btConnected = (serialBuf[2] == '1');
        }
        else if (serialBuf[0] == 'B') {
          char *comma = strchr(serialBuf + 1, ',');
          if (comma) {
            batteryLevel = atoi(serialBuf + 1);
            bool newCharging = (comma[1] == '1');
            if (newCharging && !isCharging) {
              currentMode = FACE;
              currentEmotion = E_CHARGING;
              for (uint8_t i = 0; i < NUM_PARTICLES; i++) {
                partX[i] = 38 + (i * 7);
                partY[i] = 58 - (i * 3);
              }
            }
            if (!newCharging && isCharging) {
              currentEmotion = E_HAPPY;
            }
            if (!newCharging) {
              if (batteryLevel >= 60) currentEmotion = E_HAPPY;
              else if (batteryLevel >= 30) currentEmotion = E_NORMAL;
              else if (batteryLevel >= 10) currentEmotion = E_SAD;
              else currentEmotion = E_ANGRY;
            }
            isCharging = newCharging;
          }
        }
        else if (serialBuf[0] == 'R') {
          isRaining = (serialBuf[1] == '1');
          if (isRaining) currentEmotion = E_WORRIED;
        }
        else if (serialBuf[0] == 'C') {
          strncpy(clipText, serialBuf + 1, sizeof(clipText) - 1);
          currentMode = CLIPBOARD;
          modeStart = millis();
          scrollX = 128;
        }
        else if (serialBuf[0] == 'A') {
          strncpy(alertText, serialBuf + 1, sizeof(alertText) - 1);
          currentMode = ALERT;
          currentEmotion = E_ALERT;
          modeStart = millis();
        }
        else if (serialBuf[0] == 'D') {
          strncpy(dashText, serialBuf + 1, sizeof(dashText) - 1);
          currentMode = DASHBOARD;
          modeStart = millis();
        }
        else if (serialBuf[0] == 'M') {
          strncpy(clipText, serialBuf + 1, sizeof(clipText) - 1);
          currentMode = CLIPBOARD;
          currentEmotion = E_COOL;
          modeStart = millis();
          scrollX = 128;
        }
        else if (serialBuf[0] == 'W') {
          if (serialBuf[1] == '1') {
            currentMode = WEATHER_SUNNY;
            currentEmotion = E_EXCITED;
          } else if (serialBuf[1] == '2') {
            currentMode = WEATHER_MONSOON;
            currentEmotion = E_WORRIED;
            initMonsoon();
          }
          modeStart = millis();
        }
        else if (serialBuf[0] == 'E') {
          uint8_t emo = serialBuf[1] - '0';
          if (emo <= 9) {
            currentEmotion = (Emotion)emo;
            currentMode = FACE;
          }
        }
        // P = play all emotions demo
        else if (serialBuf[0] == 'P') {
          runDemo();
        }

        serialIdx = 0;
      }
    } else if (serialIdx < sizeof(serialBuf) - 1) {
      serialBuf[serialIdx++] = c;
    }
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(9600);
#if defined(ESP_PLATFORM) || defined(ARDUINO_ARCH_ESP32)
  Wire.begin(OLED_SDA, OLED_SCL);
#else
  Wire.begin();
#endif
  u8g2.begin();
  initRain();

  Serial.println("READY");

  u8g2.firstPage();
  do {
    u8g2.setDrawColor(1);
    u8g2.setFont(u8g2_font_7x14_tf);
    u8g2.drawStr(20, 18, "Dhashini");
    u8g2.drawStr(12, 35, "Smart Hub");
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(25, 52, "Starting...");
  } while (u8g2.nextPage());

  delay(2000);
  lastBlink = millis();
}

// =====================================================
// MAIN LOOP
// =====================================================
void loop() {
  handleSerial();
  unsigned long now = millis();

  // Charging animation only when not 100%
  if (isCharging && batteryLevel < 100 && currentMode == FACE) {
    showChargingIntro();
    delay(30);
    return;
  }

  switch (currentMode) {
    case CLIPBOARD:
      showScrollText(clipText);
      delay(30);
      if (now - modeStart > CLIP_TIMEOUT) {
        currentMode = FACE;
      }
      break;

    case ALERT:
      showAlert();
      if (now - modeStart > ALERT_TIMEOUT) {
        currentMode = FACE;
        currentEmotion = E_NORMAL;
      }
      delay(200);
      break;

    case DASHBOARD:
      showDash();
      if (now - modeStart > DASH_TIMEOUT) {
        currentMode = FACE;
      }
      delay(200);
      break;

    case WEATHER_SUNNY:
      showSunny();
      if (now - modeStart > WEATHER_TIMEOUT) {
        currentMode = FACE;
      }
      delay(30);
      break;

    case WEATHER_MONSOON:
      showMonsoon();
      if (now - modeStart > WEATHER_TIMEOUT) {
        currentMode = FACE;
      }
      delay(30);
      break;

    case FACE:
    default:
      showEmotionFace();
      delay(100);
      break;
  }
}
