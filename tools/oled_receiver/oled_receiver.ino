#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Eye animation
int eyeX = 64, eyeY = 32;
int pupilX = 0, pupilY = 0;
unsigned long lastEyeMove = 0;
bool showFeatures = false;
unsigned long featureTimer = 0;

// Data buffers
String currentTime = "--:--:-- --";
String currentDate = "-- --- ----";
int batteryPct = -1;
bool batteryCharging = false;
int cpuPct = -1;
int ramPct = -1;
String ramUsed = "";
int brightnessPct = -1;
int cpuTemp = -1;
int diskPct = -1;
String diskUsed = "";
float netUp = 0;
float netDown = 0;
bool btConnected = false;
String lastAlert = "";
String lastMusic = "";
String lastNotif = "";
String lastClipboard = "";
int weatherCode = 0;

// Alert scroll
String alertLine1 = "";
String alertLine2 = "";
unsigned long alertTime = 0;
bool alertActive = false;

// Notif scroll
String notifText = "";
unsigned long notifTime = 0;
bool notifActive = false;

// Dashboard page
int dashPage = 0;
unsigned long lastDashSwitch = 0;
#define DASH_INTERVAL 5000

// Command buffer
String cmdBuffer = "";

void setup() {
  Serial.begin(9600);
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 failed"));
    for (;;);
  }
  
  display.clearDisplay();
  display.display();
  delay(1000);
  
  Serial.println("READY");
}

void loop() {
  // Read serial
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      processCommand(cmdBuffer);
      cmdBuffer = "";
    } else {
      cmdBuffer += c;
    }
  }
  
  // Update display
  if (alertActive && millis() - alertTime < 5000) {
    drawAlert();
  } else if (notifActive && millis() - notifTime < 4000) {
    drawNotification();
  } else if (showFeatures) {
    alertActive = false;
    notifActive = false;
    drawFeatureScreen();
  } else {
    drawEye();
  }
  
  // Auto switch dashboard pages
  if (showFeatures && millis() - lastDashSwitch > DASH_INTERVAL) {
    dashPage = (dashPage + 1) % 6;
    lastDashSwitch = millis();
  }
  
  display.display();
}

void processCommand(String cmd) {
  if (cmd.length() < 2) return;
  
  char prefix = cmd.charAt(0);
  String data = cmd.substring(1);
  
  switch (prefix) {
    case 'T': parseTime(data); break;
    case 'B': parseBattery(data); break;
    case 'D': parseDashboard(data); break;
    case 'A': parseAlert(data); break;
    case 'M': parseMusic(data); break;
    case 'C': parseClipboard(data); break;
    case 'W': parseWeather(data); break;
    case 'BT': parseBluetooth(data); break;
  }
  
  showFeatures = true;
  featureTimer = millis();
}

void parseTime(String data) {
  int pipe = data.indexOf('|');
  if (pipe > 0) {
    currentTime = data.substring(0, pipe);
    currentDate = data.substring(pipe + 1);
    currentDate.replace("|", "");
  }
}

void parseBattery(String data) {
  int comma = data.indexOf(',');
  if (comma > 0) {
    batteryPct = data.substring(0, comma).toInt();
    batteryCharging = (data.substring(comma + 1) == "1");
  }
}

void parseDashboard(String data) {
  int pipe = data.indexOf('|');
  String type = data.substring(0, pipe);
  String rest = data.substring(pipe + 1);
  
  if (type == "CPU") {
    cpuPct = rest.toInt();
  } else if (type == "RAM") {
    int p = rest.indexOf('|');
    ramPct = rest.substring(0, p).toInt();
    ramUsed = rest.substring(p + 1);
    ramUsed.replace("|", "");
  } else if (type == "BRIGHT") {
    brightnessPct = rest.toInt();
  } else if (type == "TIME") {
    int p = rest.indexOf('|');
    currentTime = rest.substring(0, p);
    currentDate = rest.substring(p + 1);
    currentDate.replace("|", "");
  } else if (type == "HUB") {
    parseHub(rest);
  } else if (type == "TEMP") {
    if (rest != "N/A") cpuTemp = rest.toInt();
    else cpuTemp = -1;
  } else if (type == "DISK") {
    int p = rest.indexOf('|');
    diskPct = rest.substring(0, p).toInt();
    diskUsed = rest.substring(p + 1);
    diskUsed.replace("|", "");
  } else if (type == "NET") {
    parseNet(rest);
  }
}

void parseHub(String data) {
  // B:85% C:45%|R:62% 14:30|
  int bStart = data.indexOf("B:") + 2;
  int bEnd = data.indexOf(" ", bStart);
  if (bEnd < 0) bEnd = data.length();
  String batStr = data.substring(bStart, bEnd);
  batStr.replace("%", "");
  batStr.replace("+", "");
  batteryPct = batStr.toInt();
  batteryCharging = data.indexOf("+") > 0;
  
  int cStart = data.indexOf("C:") + 2;
  int cEnd = data.indexOf("%", cStart);
  if (cEnd > 0) cpuPct = data.substring(cStart, cEnd).toInt();
  
  int rStart = data.indexOf("R:") + 2;
  int rEnd = data.indexOf("%", rStart);
  if (rEnd > 0) ramPct = data.substring(rStart, rEnd).toInt();
  
  int timeStart = data.indexOf(" ", rEnd > 0 ? rEnd : 0) + 1;
  int timeEnd = data.indexOf("|", timeStart);
  if (timeEnd > 0 && timeStart > 0) {
    currentTime = data.substring(timeStart, timeEnd);
  }
}

void parseNet(String data) {
  // U:120K D:1.5M|
  int uStart = data.indexOf("U:") + 2;
  int uEnd = data.indexOf(" ", uStart);
  int dStart = data.indexOf("D:") + 2;
  int dEnd = data.indexOf("|", dStart);
  
  if (uEnd > 0) {
    String uStr = data.substring(uStart, uEnd);
    if (uStr.indexOf("M") > 0) {
      uStr.replace("M", "");
      netUp = uStr.toFloat() * 1024;
    } else {
      uStr.replace("K", "");
      netUp = uStr.toFloat();
    }
  }
  
  if (dEnd > 0) {
    String dStr = data.substring(dStart, dEnd);
    if (dStr.indexOf("M") > 0) {
      dStr.replace("M", "");
      netDown = dStr.toFloat() * 1024;
    } else {
      dStr.replace("K", "");
      netDown = dStr.toFloat();
    }
  }
}

void parseAlert(String data) {
  // NOTIFY|text| or ALERT|text|text|
  if (data.startsWith("NOTIFY|")) {
    notifText = data.substring(7);
    notifText.replace("|", "");
    notifTime = millis();
    notifActive = true;
  } else if (data.startsWith("ALERT|")) {
    int p1 = data.indexOf('|', 6);
    int p2 = data.indexOf('|', p1 + 1);
    alertLine1 = data.substring(6, p1);
    if (p2 > 0) alertLine2 = data.substring(p1 + 1, p2);
    else alertLine2 = data.substring(p1 + 1);
    alertTime = millis();
    alertActive = true;
  }
}

void parseMusic(String data) {
  lastMusic = data;
}

void parseClipboard(String data) {
  lastClipboard = data;
}

void parseWeather(String data) {
  weatherCode = data.toInt();
}

void parseBluetooth(String data) {
  btConnected = (data == "1");
}

// ========== DRAW FUNCTIONS ==========

void drawEye() {
  display.clearDisplay();
  
  // Move pupil randomly
  if (millis() - lastEyeMove > 2000) {
    pupilX = random(-3, 4);
    pupilY = random(-2, 3);
    lastEyeMove = millis();
  }
  
  // Left eye
  display.drawCircle(38, 32, 18, SSD1306_WHITE);
  display.fillCircle(38 + pupilX, 32 + pupilY, 6, SSD1306_WHITE);
  display.fillCircle(38 + pupilX + 2, 32 + pupilY - 2, 2, SSD1306_BLACK);
  
  // Right eye
  display.drawCircle(90, 32, 18, SSD1306_WHITE);
  display.fillCircle(90 + pupilX, 32 + pupilY, 6, SSD1306_WHITE);
  display.fillCircle(90 + pupilX + 2, 32 + pupilY - 2, 2, SSD1306_BLACK);
}

void drawFeatureScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  // Time header on every page
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(currentTime);
  if (btConnected) {
    display.setCursor(100, 0);
    display.print("BT");
  }
  if (batteryPct >= 0) {
    display.setCursor(110, 0);
    display.print(batteryPct);
    display.print("%");
  }
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  switch (dashPage) {
    case 0: drawTimePage(); break;
    case 1: drawSystemPage(); break;
    case 2: drawResourcePage(); break;
    case 3: drawNetworkPage(); break;
    case 4: drawStatusPage(); break;
    case 5: drawInfoPage(); break;
  }
}

void drawTimePage() {
  // Large time
  display.setTextSize(2);
  display.setCursor(10, 15);
  display.print(currentTime);
  
  // Date
  display.setTextSize(1);
  display.setCursor(25, 40);
  display.print(currentDate);
  
  // Battery bar
  if (batteryPct >= 0) {
    drawBatteryBar(0, 52, 128, 12);
  }
}

void drawSystemPage() {
  display.setTextSize(1);
  display.setCursor(0, 13);
  display.print("CPU:");
  if (cpuPct >= 0) {
    drawBar(30, 13, 70, 8, cpuPct);
    display.setCursor(105, 13);
    display.print(cpuPct);
    display.print("%");
  }
  
  display.setCursor(0, 28);
  display.print("RAM:");
  if (ramPct >= 0) {
    drawBar(30, 28, 70, 8, ramPct);
    display.setCursor(105, 28);
    display.print(ramPct);
    display.print("%");
  }
  
  display.setCursor(0, 43);
  display.print("TMP:");
  if (cpuTemp > 0) {
    display.setCursor(30, 43);
    display.print(cpuTemp);
    display.print("C");
    if (cpuTemp > 70) {
      display.setCursor(70, 43);
      display.print("HOT!");
    }
  } else {
    display.setCursor(30, 43);
    display.print("N/A");
  }
}

void drawResourcePage() {
  display.setTextSize(1);
  display.setCursor(0, 13);
  display.print("DISK:");
  if (diskPct >= 0) {
    drawBar(35, 13, 60, 8, diskPct);
    display.setCursor(100, 13);
    display.print(diskPct);
    display.print("%");
    
    display.setCursor(0, 28);
    display.print(diskUsed);
  }
  
  display.setCursor(0, 43);
  display.print("BRIGHT:");
  if (brightnessPct > 0) {
    display.setCursor(50, 43);
    display.print(brightnessPct);
    display.print("%");
  }
}

void drawNetworkPage() {
  display.setTextSize(1);
  display.setCursor(0, 13);
  display.print("UP:");
  display.setCursor(40, 13);
  if (netUp > 1024) {
    display.print(netUp / 1024, 1);
    display.print(" MB/s");
  } else {
    display.print(netUp, 0);
    display.print(" KB/s");
  }
  
  display.setCursor(0, 28);
  display.print("DOWN:");
  display.setCursor(40, 28);
  if (netDown > 1024) {
    display.print(netDown / 1024, 1);
    display.print(" MB/s");
  } else {
    display.print(netDown, 0);
    display.print(" KB/s");
  }
  
  display.setCursor(0, 45);
  display.print("BT: ");
  display.print(btConnected ? "Connected" : "Disconnected");
}

void drawStatusPage() {
  display.setTextSize(1);
  display.setCursor(0, 13);
  display.print("BAT: ");
  if (batteryPct >= 0) {
    display.print(batteryPct);
    display.print("%");
    if (batteryCharging) display.print(" +");
  }
  
  display.setCursor(0, 28);
  display.print("MUS: ");
  if (lastMusic.length() > 0) {
    String shortMus = lastMusic.substring(0, 18);
    display.print(shortMus);
  }
  
  display.setCursor(0, 43);
  display.print("WTH: ");
  if (weatherCode == 2) display.print("Rainy");
  else display.print("Clear");
}

void drawInfoPage() {
  display.setTextSize(1);
  display.setCursor(0, 13);
  
  if (lastClipboard.length() > 0) {
    String line = "";
    int y = 13;
    for (int i = 0; i < lastClipboard.length() && y < 60; i++) {
      line += lastClipboard.charAt(i);
      if (line.length() >= 21 || lastClipboard.charAt(i) == '\n') {
        display.setCursor(0, y);
        display.print(line);
        line = "";
        y += 12;
      }
    }
    if (line.length() > 0 && y < 60) {
      display.setCursor(0, y);
      display.print(line);
    }
  } else {
    display.setCursor(0, 30);
    display.print("No clipboard data");
  }
}

void drawBar(int x, int y, int w, int h, int pct) {
  display.drawRect(x, y, w, h, SSD1306_WHITE);
  int fill = (w - 2) * pct / 100;
  display.fillRect(x + 1, y + 1, fill, h - 2, SSD1306_WHITE);
}

void drawBatteryBar(int x, int y, int w, int h) {
  display.drawRect(x, y, w, h, SSD1306_WHITE);
  int fill = (w - 2) * batteryPct / 100;
  display.fillRect(x + 1, y + 1, fill, h - 2, SSD1306_WHITE);
  
  display.setTextSize(1);
  display.setCursor(x + 4, y + 3);
  display.print(batteryPct);
  display.print("%");
  
  if (batteryCharging) {
    display.setCursor(x + w - 15, y + 3);
    display.print("+");
  }
}

void drawAlert() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  // Flashing border
  if ((millis() / 300) % 2 == 0) {
    display.drawRect(2, 2, 124, 60, SSD1306_WHITE);
  }
  
  display.setTextSize(1);
  display.setCursor(10, 5);
  display.print("!! ALERT !!");
  
  display.setTextSize(2);
  display.setCursor(10, 22);
  display.print(alertLine1);
  
  if (alertLine2.length() > 0) {
    display.setTextSize(1);
    display.setCursor(10, 48);
    display.print(alertLine2);
  }
}

void drawNotification() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("NOTIFICATION");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  display.setTextSize(1);
  // Word wrap notification text
  String line = "";
  int y = 18;
  for (int i = 0; i < notifText.length() && y < 60; i++) {
    line += notifText.charAt(i);
    if (line.length() >= 21 || notifText.charAt(i) == '\n') {
      display.setCursor(0, y);
      display.print(line);
      line = "";
      y += 12;
    }
  }
  if (line.length() > 0 && y < 60) {
    display.setCursor(0, y);
    display.print(line);
  }
}
