"""
oled_hub.py - Smart OLED Dashboard Hub

Features:
  - Auto-cycles: Battery, Weather, CPU, Brightness, Time, Hub
  - Copy text (Ctrl+C) → shows on OLED
  - Adjust laptop brightness → shows on OLED

Requirements:
  pip install pyserial psutil requests
"""

import serial
import time
import threading
import subprocess

SERIAL_PORT = "COM3"
BAUD_RATE = 9600
WEATHER_CITY = "Chennai"
CYCLE_DELAY = 8

ser = None

def connect():
    global ser
    print(f"Connecting to {SERIAL_PORT}...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("Connected!")

def send_oled(lines):
    clean = [l[:21] for l in lines]
    msg = "M" + "|".join(clean) + "\n"
    ser.write(msg.encode('utf-8', errors='replace'))
    ser.flush()

# =====================================================
# BATTERY
# =====================================================
def get_battery():
    try:
        import psutil
        bat = psutil.sensors_battery()
        pct = bat.percent
        charging = bat.power_plugged
        filled = pct // 10
        bar = "#" * filled + "-" * (10 - filled)
        icon = ">>" if charging else "  "
        return [
            "==== BATTERY ====",
            f" [{bar}] {pct}%",
            f"  {icon} {'CHARGING' if charging else 'ON BATTERY'}"
        ]
    except:
        return ["==== BATTERY ====", "    Not Found"]

# =====================================================
# WEATHER
# =====================================================
def get_weather():
    try:
        import requests
        r = requests.get(
            f"https://wttr.in/{WEATHER_CITY}?format=%C+%t+%h",
            timeout=5
        )
        data = r.text.strip()
        parts = data.split()
        if len(parts) >= 3:
            return [
                "==== WEATHER ====",
                f"  {parts[0]}",
                f"  Temp: {parts[1]} Hum: {parts[2]}"
            ]
        return ["==== WEATHER ====", f"  {data}"]
    except:
        return ["==== WEATHER ====", "  No Internet"]

# =====================================================
# SYSTEM
# =====================================================
def get_system():
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.5)
        ram = psutil.virtual_memory()
        used = ram.used // (1024 * 1024)

        cpu_filled = int(cpu / 10)
        cpu_bar = "#" * cpu_filled + "-" * (10 - cpu_filled)

        ram_filled = int(ram.percent / 10)
        ram_bar = "#" * ram_filled + "-" * (10 - ram_filled)

        return [
            "==== SYSTEM ====",
            f"CPU [{cpu_bar}] {int(cpu)}%",
            f"RAM [{ram_bar}] {used}MB"
        ]
    except:
        return ["==== SYSTEM ====", "    psutil error"]

# =====================================================
# BRIGHTNESS
# =====================================================
def get_brightness():
    try:
        result = subprocess.run(
            ['powershell', '-command',
             'Get-CimInstance -Namespace root\\WMI '
             '-ClassName WmiMonitorBrightness | '
             'Select-Object -ExpandProperty CurrentBrightness'],
            capture_output=True, text=True, timeout=5
        )
        pct = int(result.stdout.strip())
        filled = pct // 10
        bar = "#" * filled + "-" * (10 - filled)
        return [
            "==== BRIGHT ====",
            f" [{bar}] {pct}%",
            f"  Screen Brightness"
        ]
    except:
        return ["==== BRIGHT ====", "    N/A"]

# =====================================================
# CALENDAR
# =====================================================
def get_calendar():
    import datetime
    now = datetime.datetime.now()
    return [
        "===== TODAY =====",
        f"  {now.strftime('%d %B %Y')}",
        f"  {now.strftime('%A | %I:%M %p')}"
    ]

# =====================================================
# TIME
# =====================================================
def get_time():
    t = time.strftime("%I:%M:%S")
    ampm = time.strftime("%p")
    d = time.strftime("%d %b %Y")
    return [
        "===== TIME =====",
        f"      {t}",
        f"    {ampm}  {d}"
    ]

# =====================================================
# HUB (all in one)
# =====================================================
def get_hub():
    try:
        import psutil
        bat = psutil.sensors_battery()
        cpu = psutil.cpu_percent(interval=0.3)
        ram = psutil.virtual_memory()
        t = time.strftime("%H:%M")

        return [
            "====== HUB ======",
            f"B:{bat.percent}%{'+'if bat.power_plugged else ''} C:{int(cpu)}%",
            f"R:{int(ram.percent)}%    {t}"
        ]
    except:
        return ["====== HUB ======", "    Loading..."]

# =====================================================
# BRIGHTNESS MONITOR
# =====================================================
last_brightness = -1

def monitor_brightness():
    global last_brightness
    while True:
        try:
            result = subprocess.run(
                ['powershell', '-command',
                 'Get-CimInstance -Namespace root\\WMI '
                 '-ClassName WmiMonitorBrightness | '
                 'Select-Object -ExpandProperty CurrentBrightness'],
                capture_output=True, text=True, timeout=5
            )
            pct = int(result.stdout.strip())
            if pct != last_brightness:
                last_brightness = pct
                filled = pct // 10
                bar = "#" * filled + "-" * (10 - filled)
                send_oled([
                    "==== BRIGHT ====",
                    f" [{bar}] {pct}%",
                    f"  Screen Brightness"
                ])
                print(f"  [Brightness] {pct}%")
                time.sleep(2)  # Show for 2 sec
        except:
            pass
        time.sleep(2)

# =====================================================
# CLIPBOARD MONITOR
# =====================================================
def get_clipboard():
    try:
        r = subprocess.run(
            ['powershell', '-command', 'Get-Clipboard'],
            capture_output=True, text=True, timeout=3
        )
        return r.stdout.strip()
    except:
        return ""

def monitor_clipboard():
    last = ""
    while True:
        cur = get_clipboard()
        if cur and cur != last:
            send_oled(["====== COPY =====", cur[:21]])
            print(f"  [Clipboard] {cur[:21]}")
            last = cur
            time.sleep(3)
        time.sleep(1)

# =====================================================
# AUTO CYCLE
# =====================================================
def auto_cycle():
    screens = [
        get_battery, get_weather, get_system,
        get_brightness, get_hub, get_calendar, get_time
    ]
    idx = 0
    while True:
        try:
            lines = screens[idx % len(screens)]()
            send_oled(lines)
            print(f"  [{' | '.join(lines)}]")
            idx += 1
            time.sleep(CYCLE_DELAY)
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(2)

# =====================================================
# MAIN
# =====================================================
def main():
    connect()
    print("=" * 40)
    print("  OLED Dashboard Hub")
    print("  Auto-cycling every 8s")
    print("  Ctrl+C on laptop = show on OLED")
    print("  Adjust brightness = show on OLED")
    print("  Press Ctrl+C here to stop")
    print("=" * 40)

    threading.Thread(target=auto_cycle, daemon=True).start()
    threading.Thread(target=monitor_clipboard, daemon=True).start()
    threading.Thread(target=monitor_brightness, daemon=True).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
