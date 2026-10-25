#include <Arduino.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <BluetoothSerial.h>

// ============================================================
// QBIT Hub firmware - ESP32-CAM (AI-Thinker)
//
// Talks the QBIT serial protocol over BOTH:
//   * USB/UART0 hardware serial  (9600 baud)  - used for flashing & wired debug
//   * Bluetooth SPP (classic)    - device name "QBIT-Hub"
// The desktop app (desktop-v2) pairs the Bluetooth port and drives the OLED.
//
// OLED wiring (I2C, 0x3C):
//   OLED SDA <-> GPIO14   OLED SCL <-> GPIO15   VCC 3.3V   GND GND
//
// This build renders the 14 ELECTRON face expressions (minimalist two-blob
// eyes + a small mouth, no pupils/nose) to match the desktop QbitFace:
//   0 idle      1 happy     2 curious   3 sleepy
//   4 focused   5 excited   6 surprised 7 worried
//   8 stressed  9 exhausted 10 playful  11 alert
//   12 charging 13 thinking
// ============================================================
#define OLED_SDA 14
#define OLED_SCL 15

U8G2_SSD1306_128X64_NONAME_1_HW_I2C u8g2(
  U8G2_R0,
  U8X8_PIN_NONE,
  OLED_SCL,
  OLED_SDA
);

BluetoothSerial SerialBT;

char serialBuf[160];
uint8_t serialIdx = 0;

uint8_t batteryLevel = 100;
bool isCharging = false;
bool isRaining  = false;
bool btConnected = false;   // reflects desktop BT1/BT0 (icon)

// ---- 14 Electron expressions (index order matches the desktop) ----
enum Expr {
  EX_IDLE, EX_HAPPY, EX_CURIOUS, EX_SLEEPY,
  EX_FOCUSED, EX_EXCITED, EX_SURPRISED, EX_WORRIED,
  EX_STRESSED, EX_EXHAUSTED, EX_PLAYFUL, EX_ALERT,
  EX_CHARGING, EX_THINKING, EXPR_COUNT
};
Expr currentExpr = EX_IDLE;

const char* exprNames[EXPR_COUNT] = {
  "idle","happy","curious","sleepy","focused","excited","surprised",
  "worried","stressed","exhausted","playful","alert","charging","thinking"
};

enum Mode { FACE, CLIPBOARD, ALERT, DASHBOARD, WEATHER_SUNNY, WEATHER_MONSOON };
Mode currentMode = FACE;

char clipText[160] = "";
char alertText[160] = "";
char dashText[160]  = "";

unsigned long modeStart = 0;
#define ALERT_TIMEOUT   5000
#define DASH_TIMEOUT    8000
#define CLIP_TIMEOUT    10000
#define WEATHER_TIMEOUT 300000

unsigned long lastBlink = 0;
bool blinkNow = false;

// Bounce / breath animation phase (for excited/playful/charging/exhausted).
unsigned long animPhase = 0;

// Rain overlay
#define MAX_DROPS 15
int8_t dropY[MAX_DROPS];
int8_t dropX[MAX_DROPS];

// Scroll
int16_t scrollX = 128;

// Charging bolt
uint8_t boltFrame = 0;
unsigned long lastBoltFrame = 0;

// Monsoon
#define MAX_MONSOON_DROPS 20
int8_t mDropY[MAX_MONSOON_DROPS];
int8_t mDropX[MAX_MONSOON_DROPS];
uint8_t cloudX = 0;

// Sunny
uint8_t sunAngle = 0;
#define NUM_RAYS 8
const int8_t sinLUT[64] = {
   0,  6, 12, 18, 23, 28, 33, 38, 42, 46, 49, 52, 55, 57, 59, 61,
  62, 63, 63, 63, 62, 61, 59, 57, 55, 52, 49, 46, 42, 38, 33, 28,
  23, 18, 12,  6,  0, -6,-12,-18,-23,-28,-33,-38,-42,-46,-49,-52,
 -55,-57,-59,-61,-62,-63,-63,-63,-62,-61,-59,-57,-55,-52,-49,-46
};
int8_t fastSin(uint8_t a) { return sinLUT[a % 64]; }
int8_t fastCos(uint8_t a) { return sinLUT[(a + 16) % 64]; }

void initRain() {
  for (uint8_t i = 0; i < MAX_DROPS; i++) { dropX[i] = random(5, 123); dropY[i] = random(-64, 0); }
}
void initMonsoon() {
  cloudX = 0;
  for (uint8_t i = 0; i < MAX_MONSOON_DROPS; i++) { mDropX[i] = random(0, 128); mDropY[i] = random(-64, 0); }
}
void drawRainDrop() {
  for (uint8_t i = 0; i < MAX_DROPS; i++) {
    dropY[i] += 4;
    if (dropY[i] > 64) { dropY[i] = random(-30, 0); dropX[i] = random(5, 123); }
    u8g2.drawVLine(dropX[i], dropY[i], 3);
  }
}

// =====================================================
// TOP BAR: Battery % (top left) + BT icon (top right)
// =====================================================
void drawTopBar() {
  u8g2.setDrawColor(1);
  u8g2.setFont(u8g2_font_6x10_tf);
  char buf[10];
  if (isCharging && batteryLevel < 100) sprintf(buf, "%d%%+", batteryLevel);
  else sprintf(buf, "%d%%", batteryLevel);
  u8g2.drawStr(0, 10, buf);
  if (btConnected) {
    u8g2.drawVLine(122, 2, 7);
    u8g2.drawPixel(119, 4); u8g2.drawPixel(125, 4);
    u8g2.drawPixel(119, 8); u8g2.drawPixel(125, 8);
  }
}

// Charging bolt (small, top-right of face)
void drawChargingBolt() {
  int8_t yOff = 0;
  if (millis() - lastBoltFrame > 300) { boltFrame = (boltFrame + 1) % 3; lastBoltFrame = millis(); }
  if (boltFrame == 0) yOff = -1; else if (boltFrame == 2) yOff = 1;
  u8g2.setDrawColor(1);
  u8g2.drawTriangle(114, 14 + yOff, 108, 24 + yOff, 116, 22 + yOff);
  u8g2.drawTriangle(108, 24 + yOff, 116, 24 + yOff, 110, 32 + yOff);
}

// =====================================================
// ELECTRON-STYLE FACE
// Two blob eyes + a small mouth, no pupils, no nose.
// Eye geometry is derived from the desktop expressions.css:
//   - base eye: rounded box ~ 26 x 34, centred around y=34
//   - left eye centre x = 40, right eye centre x = 88
//   - mouth: a small arc/line/O centred at (64, ~52)
// Each expression tweaks eye height / curvature / tilt / mouth.
// `yOff` lets the whole face bounce or breathe.
// =====================================================

// A rounded eye "blob". cx,cy = centre; w,h = size.
void drawEye(int16_t cx, int16_t cy, int16_t w, int16_t h, uint8_t r) {
  u8g2.drawRBox(cx - w / 2, cy - h / 2, w, h, r);
}

// Happy / curved "u" eye (fill a chunky arc).
void drawCurvedEye(int16_t cx, int16_t cy, int16_t w, bool up) {
  // Approximate the CSS curved-happy eye with a thick arc of boxes.
  int16_t half = w / 2;
  for (int16_t dx = -half; dx <= half; dx++) {
    float t = (float)dx / half;              // -1..1
    int16_t curve = (int16_t)(t * t * 7.0);  // parabola, 0 at centre
    int16_t y = up ? cy + curve : cy - curve;
    u8g2.drawVLine(cx + dx, y - 2, 5);
  }
}

void drawFace(int16_t yOff) {
  u8g2.setDrawColor(1);
  const int16_t LX = 40, RX = 88;   // eye centre x
  const int16_t EY = 32 + yOff;     // eye centre y
  const int16_t MY = 52 + yOff;     // mouth y

  // ---- Eyes per expression ----
  switch (currentExpr) {

    case EX_IDLE:
    case EX_THINKING: {
      int16_t h = (currentExpr == EX_THINKING) ? 26 : 32;
      int16_t ey = (currentExpr == EX_THINKING) ? EY - 6 : EY;
      drawEye(LX, ey, 26, h, 11);
      drawEye(RX, ey, 26, h, 11);
      u8g2.drawHLine(54, MY, 20);                       // neutral mouth
    } break;

    case EX_HAPPY:
    case EX_PLAYFUL: {
      drawCurvedEye(LX, EY, 28, false);
      if (currentExpr == EX_PLAYFUL) drawEye(RX, EY, 26, 10, 5);  // right eye wink
      else drawCurvedEye(RX, EY, 28, false);
      // smile
      u8g2.drawLine(50, MY, 58, MY + 5);
      u8g2.drawHLine(58, MY + 5, 12);
      u8g2.drawLine(70, MY + 5, 78, MY);
    } break;

    case EX_CURIOUS: {
      drawEye(LX, EY, 26, 32, 11);
      drawEye(RX, EY - 7, 24, 26, 11);                  // right eye raised (CSS translateY -7)
      u8g2.drawHLine(56, MY, 16);
    } break;

    case EX_SLEEPY: {
      drawEye(LX, EY + 6, 28, 14, 7);                   // low, squat eyes
      drawEye(RX, EY + 6, 28, 14, 7);
      u8g2.drawHLine(56, MY + 2, 16);
      u8g2.setFont(u8g2_font_6x10_tf);                  // z's
      u8g2.drawStr(104, 16, "z"); u8g2.drawStr(112, 9, "z");
    } break;

    case EX_FOCUSED:
    case EX_STRESSED: {
      // Narrowed, angled eyes (CSS: slanted + mirrored right eye).
      drawEye(LX, EY, 28, 18, 6);
      drawEye(RX, EY, 28, 18, 6);
      u8g2.drawLine(LX - 16, EY - 12, LX + 12, EY - 7); // angry brows
      u8g2.drawLine(RX + 16, EY - 12, RX - 12, EY - 7);
      u8g2.drawHLine(52, MY, 24);
      if (currentExpr == EX_STRESSED) {                 // sweat drop (right)
        u8g2.drawDisc(110, 44, 2);
        u8g2.drawTriangle(110, 39, 108, 44, 112, 44);
      }
    } break;

    case EX_EXCITED: {
      drawEye(LX, EY, 30, 30, 14);                      // big wide eyes
      drawEye(RX, EY, 30, 30, 14);
      u8g2.drawCircle(64, MY, 5);                       // open "o" mouth
      u8g2.drawDisc(8, 12 + yOff, 2);                   // sparkles
      u8g2.drawDisc(120, 12 + yOff, 2);
      u8g2.drawDisc(8, 56 + yOff, 2);
      u8g2.drawDisc(120, 56 + yOff, 2);
    } break;

    case EX_SURPRISED:
    case EX_ALERT: {
      drawEye(LX, EY, 30, 34, 15);                      // very tall round eyes
      drawEye(RX, EY, 30, 34, 15);
      u8g2.drawCircle(64, MY, 5);                       // round mouth
      if (currentExpr == EX_ALERT) {                    // exclamation at left
        u8g2.drawVLine(4, 14 + yOff, 16);
        u8g2.drawDisc(4, 34 + yOff, 2);
      }
    } break;

    case EX_WORRIED: {
      // Tilted, slightly closed eyes (CSS rotate +/-13deg, scaleY .8).
      drawEye(LX, EY + 2, 26, 22, 10);
      drawEye(RX, EY, 26, 24, 10);
      u8g2.drawLine(LX - 14, EY - 14, LX + 12, EY - 10); // worried brows
      u8g2.drawLine(RX + 14, EY - 10, RX - 12, EY - 14);
      // wavy mouth
      u8g2.drawLine(48, MY + 2, 54, MY - 2);
      u8g2.drawLine(54, MY - 2, 60, MY + 2);
      u8g2.drawLine(60, MY + 2, 66, MY - 2);
      u8g2.drawLine(66, MY - 2, 72, MY + 2);
      u8g2.drawLine(72, MY + 2, 80, MY - 2);
    } break;

    case EX_EXHAUSTED: {
      drawEye(LX, EY + 8, 30, 10, 5);                   // flat, drooping eyes
      drawEye(RX, EY + 8, 30, 10, 5);
      u8g2.drawHLine(54, MY + 4, 20);
      // tired sweat
      u8g2.drawDisc(110, 46, 2);
    } break;

    case EX_CHARGING: {
      drawCurvedEye(LX, EY, 28, false);                 // same happy curve as CSS
      drawCurvedEye(RX, EY, 28, false);
      u8g2.drawHLine(54, MY, 20);
      drawChargingBolt();
    } break;

    default: break;
  }

  // Charging bolt overlay whenever charging (unless already the charging face).
  if (isCharging && batteryLevel < 100 && currentExpr != EX_CHARGING) drawChargingBolt();
  if (isRaining) drawRainDrop();
}

// Compute a vertical bounce/breath offset for lively expressions.
int16_t faceOffset() {
  switch (currentExpr) {
    case EX_EXCITED:  return (millis() / 120) % 2 ? -4 : 0;    // quick bounce
    case EX_PLAYFUL:  return (millis() / 160) % 2 ? -3 : 0;
    case EX_CHARGING: return (millis() / 500) % 2 ? -2 : 0;    // slow breath
    case EX_EXHAUSTED:return (millis() / 900) % 2 ? -1 : 0;    // very slow breath
    default: return 0;
  }
}

void showExprFace() {
  unsigned long now = millis();
  bool blinking = (now - lastBlink > 3000UL + random(0, 2000));

  // Blink frame: flatten both eyes briefly (skip for already-closed faces).
  bool canBlink = !(currentExpr == EX_SLEEPY || currentExpr == EX_EXHAUSTED);
  if (blinking && canBlink) {
    u8g2.firstPage();
    do {
      drawTopBar();
      u8g2.setDrawColor(1);
      int16_t yOff = faceOffset();
      u8g2.drawHLine(28, 32 + yOff, 24);
      u8g2.drawHLine(76, 32 + yOff, 24);
      // keep the mouth so the blink reads naturally
      u8g2.drawHLine(54, 52 + yOff, 20);
      if (isCharging && batteryLevel < 100) drawChargingBolt();
      if (isRaining) drawRainDrop();
    } while (u8g2.nextPage());
    delay(110);
    lastBlink = now;
  }

  u8g2.firstPage();
  do {
    drawTopBar();
    drawFace(faceOffset());
  } while (u8g2.nextPage());
}

// =====================================================
// TEXT MODES (scroll / alert / dashboard)
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
void drawTextPage(const char* text) {
  u8g2.setDrawColor(1);
  u8g2.setFont(u8g2_font_7x14_tf);
  uint8_t y = 24, col = 0;
  for (uint8_t i = 0; text[i]; i++) {
    if (text[i] == '|') { y += 16; col = 0; if (y > 62) break; }
    else { char s[2] = {text[i], '\0'}; u8g2.drawStr(col * 7, y, s); col++; if (col >= 18) { col = 0; y += 16; if (y > 62) break; } }
  }
}
void showAlert() {
  u8g2.firstPage();
  do { drawTopBar(); drawTextPage(alertText); if (isRaining) drawRainDrop(); } while (u8g2.nextPage());
}
void showDash() {
  u8g2.firstPage();
  do { drawTopBar(); drawTextPage(dashText); if (isRaining) drawRainDrop(); } while (u8g2.nextPage());
}

// =====================================================
// WEATHER
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
      int8_t s = fastSin(a), c = fastCos(a);
      u8g2.drawLine(64 + (c * 20) / 63, 32 + (s * 20) / 63, 64 + (c * 28) / 63, 32 + (s * 28) / 63);
    }
    for (uint8_t i = 0; i < 128; i += 8) {
      int8_t waveY = 58 + (fastSin((i / 4) + sunAngle) / 8);
      u8g2.drawPixel(i, waveY); u8g2.drawPixel(i + 1, waveY);
    }
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(30, 64, "SUNNY DAY!");
  } while (u8g2.nextPage());
}
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
      if (mDropY[i] > 64) { mDropY[i] = random(-20, 0); mDropX[i] = random(0, 128); }
      u8g2.drawLine(mDropX[i], mDropY[i], mDropX[i] - 2, mDropY[i] + 6);
    }
    for (uint8_t i = 0; i < 128; i += 20) u8g2.drawDisc(i + 10, 62, 4);
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(18, 64, "MONSOON RAIN!");
  } while (u8g2.nextPage());
  cloudX = (cloudX + 1) % 30;
}

// =====================================================
// DEMO - cycle all 14 expressions
// =====================================================
void showDemoExpr(uint8_t idx) {
  currentExpr = (Expr)idx;
  unsigned long start = millis();
  while (millis() - start < 1600) {
    u8g2.firstPage();
    do {
      drawTopBar();
      drawFace(faceOffset());
      u8g2.setFont(u8g2_font_6x10_tf);
      u8g2.drawStr(34, 64, exprNames[idx]);
    } while (u8g2.nextPage());
    delay(80);
  }
}
void runDemo() { for (uint8_t i = 0; i < EXPR_COUNT; i++) showDemoExpr(i); }

// =====================================================
// PROTOCOL - one parser, fed from USB serial AND Bluetooth
// =====================================================
void processLine(char* line) {
  if (line[0] == 'B' && line[1] == 'T') {
    btConnected = (line[2] == '1');
  }
  else if (line[0] == 'B') {
    char *comma = strchr(line + 1, ',');
    if (comma) {
      batteryLevel = atoi(line + 1);
      bool newCharging = (comma[1] == '1');
      if (newCharging && !isCharging) { currentMode = FACE; currentExpr = EX_CHARGING; }
      if (!newCharging && isCharging) { currentExpr = EX_HAPPY; }
      isCharging = newCharging;
    }
  }
  else if (line[0] == 'R') { isRaining = (line[1] == '1'); if (isRaining) currentExpr = EX_WORRIED; }
  else if (line[0] == 'C') { strncpy(clipText, line + 1, sizeof(clipText) - 1); currentMode = CLIPBOARD; modeStart = millis(); scrollX = 128; }
  else if (line[0] == 'A') { strncpy(alertText, line + 1, sizeof(alertText) - 1); currentMode = ALERT; currentExpr = EX_ALERT; modeStart = millis(); }
  else if (line[0] == 'D') { strncpy(dashText, line + 1, sizeof(dashText) - 1); currentMode = DASHBOARD; modeStart = millis(); }
  else if (line[0] == 'M') { strncpy(clipText, line + 1, sizeof(clipText) - 1); currentMode = CLIPBOARD; currentExpr = EX_FOCUSED; modeStart = millis(); scrollX = 128; }
  else if (line[0] == 'W') {
    if (line[1] == '1') { currentMode = WEATHER_SUNNY;  currentExpr = EX_EXCITED; }
    else if (line[1] == '2') { currentMode = WEATHER_MONSOON; currentExpr = EX_WORRIED; initMonsoon(); }
    modeStart = millis();
  }
  else if (line[0] == 'E') {
    // Accept E0..E13 (two digits) -> one of the 14 expressions.
    int emo = atoi(line + 1);
    if (emo >= 0 && emo < EXPR_COUNT) { currentExpr = (Expr)emo; currentMode = FACE; }
  }
  else if (line[0] == 'P') { runDemo(); }
}

void feedSerial() {
  // USB / UART0
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (serialIdx > 0) { serialBuf[serialIdx] = '\0'; processLine(serialBuf); serialIdx = 0; } }
    else if (serialIdx < sizeof(serialBuf) - 1) serialBuf[serialIdx++] = c;
  }
  // Bluetooth SPP
  while (SerialBT.available()) {
    char c = SerialBT.read();
    if (c == '\n' || c == '\r') { if (serialIdx > 0) { serialBuf[serialIdx] = '\0'; processLine(serialBuf); serialIdx = 0; } }
    else if (serialIdx < sizeof(serialBuf) - 1) serialBuf[serialIdx++] = c;
  }
}

// Mirror READY to whichever transport is listening.
void announceReady() {
  Serial.println("READY");
  SerialBT.println("READY");
}

// =====================================================
// SETUP / LOOP
// =====================================================
void setup() {
  Serial.begin(9600);
  SerialBT.begin("QBIT-Hub");           // advertise a classic-Bluetooth SPP port
  Wire.begin(OLED_SDA, OLED_SCL);
  u8g2.begin();
  initRain();

  announceReady();

  u8g2.firstPage();
  do {
    u8g2.setDrawColor(1);
    u8g2.setFont(u8g2_font_7x14_tf);
    u8g2.drawStr(16, 18, "QBIT Hub");
    u8g2.drawStr(10, 35, "Bluetooth");
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(8, 52, "Pair: QBIT-Hub");
  } while (u8g2.nextPage());

  delay(2000);
  lastBlink = millis();
}

void loop() {
  feedSerial();

  // Reflect live Bluetooth link state onto the icon automatically.
  static bool lastBtState = false;
  bool nowBt = SerialBT.hasClient();
  if (nowBt != lastBtState) { btConnected = nowBt; lastBtState = nowBt; if (nowBt) announceReady(); }

  unsigned long now = millis();

  switch (currentMode) {
    case CLIPBOARD:
      showScrollText(clipText); delay(30);
      if (now - modeStart > CLIP_TIMEOUT) currentMode = FACE;
      break;
    case ALERT:
      showAlert(); delay(180);
      if (now - modeStart > ALERT_TIMEOUT) { currentMode = FACE; currentExpr = EX_IDLE; }
      break;
    case DASHBOARD:
      showDash(); delay(180);
      if (now - modeStart > DASH_TIMEOUT) currentMode = FACE;
      break;
    case WEATHER_SUNNY:
      showSunny(); delay(30);
      if (now - modeStart > WEATHER_TIMEOUT) currentMode = FACE;
      break;
    case WEATHER_MONSOON:
      showMonsoon(); delay(30);
      if (now - modeStart > WEATHER_TIMEOUT) currentMode = FACE;
      break;
    case FACE:
    default:
      showExprFace(); delay(90);
      break;
  }
}
