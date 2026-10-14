"""
oled_auto.py - Smart OLED Dashboard Hub

Clean, compact UI for 128x64 OLED.
Auto-cycles through features.

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
    # Each line max 21 chars
    clean = []
    for l in lines:
        clean.append(l[:21])
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

        # Simple bar: 10 chars
        filled = pct // 10
        empty = 10 - filled
        bar = "o" * filled + "." * empty

        icon = ">>" if charging else "  "
        return [
            "    [ BATTERY ]",
            f"  [{bar}] {pct}%",
            f"   {icon} {'CHARGING' if charging else 'BATTERY'}"
        ]
    except:
        return ["    [ BATTERY ]", "    Not Found"]

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
        data = r.text.strip()  # "Clear +30C 75%"
        parts = data.split()
        if len(parts) >= 3:
            cond = parts[0]
            temp = parts[1]
            hum = parts[2]
            return [
                "    [ WEATHER ]",
                f"   {cond}",
                f"   {temp}  {hum}"
            ]
        return ["    [ WEATHER ]", f"   {data}"]
    except:
        return ["    [ WEATHER ]", "   No Internet"]

# =====================================================
# SYSTEM (CPU + RAM)
# =====================================================
def get_system():
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.5)
        ram = psutil.virtual_memory()
        used = ram.used // (1024 * 1024)
        total = ram.total // (1024 * 1024)

        cpu_filled = int(cpu / 10)
        cpu_bar = "o" * cpu_filled + "." * (10 - cpu_filled)

        ram_filled = int(ram.percent / 10)
        ram_bar = "o" * ram_filled + "." * (10 - ram_filled)

        return [
            "    [ SYSTEM ]",
            f"C[{cpu_bar}]{cpu}%",
            f"R[{ram_bar}]{used}M"
        ]
    except:
        return ["    [ SYSTEM ]", "   psutil error"]

# =====================================================
# CALENDAR
# =====================================================
def get_calendar():
    import datetime
    now = datetime.datetime.now()
    return [
        "    [ TODAY ]",
        f"  {now.strftime('%d %b %Y')}",
        f"  {now.strftime('%A %I:%M %p')}"
    ]

# =====================================================
# TIME
# =====================================================
def get_time():
    t = time.strftime("%I:%M:%S")
    ampm = time.strftime("%p")
    return [
        "    [ TIME ]",
        f"     {t}",
        f"      {ampm}"
    ]

# =====================================================
# HUB SCREEN (shows all at once)
# =====================================================
def get_hub():
    try:
        import psutil
        bat = psutil.sensors_battery()
        cpu = psutil.cpu_percent(interval=0.3)
        ram = psutil.virtual_memory()
        t = time.strftime("%H:%M")

        bat_str = f"B:{bat.percent}%{'+' if bat.power_plugged else ''}"
        cpu_str = f"C:{int(cpu)}%"
        ram_str = f"R:{int(ram.percent)}%"
        time_str = t

        return [
            "    [ HUB ]",
            f" {bat_str}  {cpu_str}",
            f" {ram_str}   {time_str}"
        ]
    except:
        return ["    [ HUB ]", "   Loading..."]

# =====================================================
# AUTO CYCLE
# =====================================================
def auto_cycle():
    screens = [
        ("BATTERY",  get_battery),
        ("WEATHER",  get_weather),
        ("SYSTEM",   get_system),
        ("HUB",      get_hub),
        ("CALENDAR", get_calendar),
        ("TIME",     get_time),
    ]

    idx = 0
    while True:
        try:
            name, func = screens[idx % len(screens)]
            lines = func()
            send_oled(lines)
            print(f"  [{name}] {' | '.join(lines)}")
            idx += 1
            time.sleep(CYCLE_DELAY)
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(2)

# =====================================================
# CLIPBOARD
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
            send_oled(["    [ COPY ]", cur[:21]])
            print(f"  [Clipboard] {cur[:21]}")
            last = cur
            time.sleep(5)
        time.sleep(1)

# =====================================================
# MAIN
# =====================================================
def main():
    connect()
    print("=" * 40)
    print("  OLED Dashboard Hub")
    print("  Auto-cycling every 8s")
    print("  Ctrl+C = copy to OLED")
    print("  Press Ctrl+C to stop")
    print("=" * 40)

    threading.Thread(target=auto_cycle, daemon=True).start()
    threading.Thread(target=monitor_clipboard, daemon=True).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
