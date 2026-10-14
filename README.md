# Smart OLED Hub

Arduino Uno / ESP32-CAM + SSD1306 128x64 OLED dashboard with face expressions, weather animations, and laptop data display.

## Structure

```
├── firmware_uno/           # Arduino Uno firmware (standalone project)
│   ├── src/
│   │   └── main.cpp        # Main firmware code
│   └── platformio.ini      # PlatformIO config (board: uno)
├── firmware_esp32cam/      # ESP32-CAM firmware (standalone project)
│   ├── src/
│   │   └── main.cpp        # Main firmware code (OLED on GPIO14/15)
│   └── platformio.ini      # PlatformIO config (board: esp32cam)
├── tools/                  # Python companion scripts (shared by both)
│   ├── oled_smart.py       # Main hub script (battery, weather, music, clipboard)
│   ├── oled_auto.py        # Auto-cycling dashboard
│   ├── oled_dashboard.py
│   ├── oled_hub.py
│   ├── oled_notify.py
│   ├── clipboard_oled.py
│   ├── trackpad_oled.py
│   ├── allow_clicker.py
│   ├── send_time.py
│   ├── server.py
│   └── notify_listener.py
└── docs/
```

## Features

- **Face Expressions**: Happy/Normal/Sad/Angry based on battery level
- **Blink Animation**: Eyes blink every 3-5 seconds
- **Charging Animation**: Battery filling + particles when plugged in (stops at 100%)
- **Rain Effect**: Falling drops when weather is rainy
- **Sunny Animation**: Rotating sun rays every 30 min
- **Monsoon Animation**: Heavy rain with clouds every 30 min
- **Clipboard Scrolling**: Ctrl+C text scrolls across OLED
- **Music Display**: Shows currently playing song from browser/Spotify
- **Notifications**: Detects popup windows (Phone Link, calls)
- **Dashboard**: CPU, RAM, Battery stats
- **Weather**: Coimbatore weather every 30 minutes
- **Brightness**: Auto-detects screen brightness changes

## Setup

### Firmware (pick one folder — they are independent)

**Option 1: Arduino Uno**
```bash
cd firmware_uno
pio run -t upload
```

**Option 2: ESP32-CAM**
```bash
cd firmware_esp32cam
pio run -t upload
```
> ESP32-CAM has no onboard USB chip: use an external USB-UART on UART0
> (`TX=GPIO1` → adapter RX, `RX=GPIO3` → adapter TX, `GND` → GND) with
> **GPIO0 pulled to GND** while flashing (or an ESP32-CAM-MB programmer base).

### Python Hub
```bash
cd tools
pip install pyserial psutil requests
python oled_smart.py
```

### Send Manual Notification
```bash
python oled_smart.py notify "Your message here"
```

## Serial Protocol

| Command | Format | Description |
|---------|--------|-------------|
| B | `B<level>,<charging>` | Battery level (0-100) and charging state |
| R | `R<0\|1>` | Rain on/off |
| C | `C<text>` | Clipboard text (scrolls, stays) |
| A | `A<text>` | Alert message (shows 5 sec) |
| D | `D<text>` | Dashboard text (shows 8 sec) |
| M | `M<text>` | Music/scroll text |
| W | `W<1\|2>` | Weather: 1=sunny, 2=monsoon |

## Hardware

**Option 1 (firmware_uno):**
- Arduino Uno (ATmega328P)
- SSD1306 128x64 OLED (I2C, address 0x3C) — SCL → A5, SDA → A4

**Option 2 (firmware_esp32cam):**
- AI-Thinker ESP32-CAM (OV2640 stays disabled in this project)
- SSD1306 128x64 OLED (I2C, address 0x3C) — SCL → **GPIO15**, SDA → **GPIO14**
  (default I2C pins 21/22 are camera pins on this board, so free GPIOs are used)

- U8G2 library (page-buffer mode)
# Vijay_s_qq
