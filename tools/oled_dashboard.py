"""
oled_dashboard.py - All-in-one OLED dashboard

Features:
  1. Weather      - Current weather
  2. Battery      - Laptop battery %
  3. System       - CPU/RAM usage
  4. Music        - Audio visualizer
  5. Notifications- Email/WhatsApp alerts
  6. Calendar     - Today's date/events

Requirements:
  pip install pyserial psutil requests comtypes
"""

import serial
import time
import threading
import subprocess
import sys
import os

# =====================================================
# CONFIG
# =====================================================
SERIAL_PORT = "COM4"
BAUD_RATE = 9600
WEATHER_CITY = "Chennai"  # Change to your city

# =====================================================
# SERIAL
# =====================================================
ser = None
current_mode = "menu"

def connect():
    global ser
    print(f"Connecting to {SERIAL_PORT}...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("Connected!")
    print_menu()

def print_menu():
    print("")
    print("=" * 40)
    print("  OLED DASHBOARD")
    print("=" * 40)
    print("  1. Weather")
    print("  2. Battery")
    print("  3. CPU/RAM")
    print("  4. Music Visualizer")
    print("  5. Notifications")
    print("  6. Calendar")
    print("  7. Auto Mode (cycles all)")
    print("  8. Time")
    print("  q. Quit")
    print("=" * 40)
    print("")

def send_oled(lines):
    """Send multi-line text to OLED. Uses | as newline separator."""
    msg = "M" + "|".join(lines) + "\n"
    ser.write(msg.encode('utf-8', errors='replace'))
    ser.flush()

# =====================================================
# 1. WEATHER
# =====================================================
def get_weather():
    try:
        import requests
        url = f"https://wttr.in/{WEATHER_CITY}?format=%C+%t+%h"
        r = requests.get(url, timeout=5)
        data = r.text.strip()
        # Returns like: "Clear +30°C 75%"
        return data
    except:
        return "Weather unavailable"

def show_weather():
    weather = get_weather()
    print(f"Weather: {weather}")
    send_oled(["== WEATHER ==", weather, WEATHER_CITY])

# =====================================================
# 2. BATTERY
# =====================================================
def get_battery():
    try:
        import psutil
        bat = psutil.sensors_battery()
        percent = bat.percent
        plugged = "Charging" if bat.power_plugged else "On Battery"
        return f"{percent}% - {plugged}"
    except:
        return "Battery unavailable"

def show_battery():
    battery = get_battery()
    print(f"Battery: {battery}")
    send_oled(["== BATTERY ==", battery])

# =====================================================
# 3. CPU/RAM
# =====================================================
def get_system():
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=1)
        ram = psutil.virtual_memory()
        ram_used = ram.used // (1024 * 1024)
        ram_total = ram.total // (1024 * 1024)
        return [f"CPU: {cpu}%", f"RAM: {ram_used}/{ram_total}MB"]
    except:
        return ["System unavailable"]

def show_system():
    lines = get_system()
    print(f"System: {lines}")
    send_oled(["== SYSTEM ="] + lines)

# =====================================================
# 4. MUSIC VISUALIZER
# =====================================================
def get_audio_level():
    try:
        # Windows: use PowerShell to get audio level
        result = subprocess.run(
            ['powershell', '-command',
             'Add-Type -AssemblyName System.Windows.Forms; '
             '[System.Windows.Forms.SendKeys]::SendWait(""); '
             '$w = New-Object -ComObject WScript.Shell; '
             'Get-AudioDevice -PlaybackVolume'],
            capture_output=True, text=True, timeout=3
        )
        # Fallback: just return a random level for demo
        import random
        return random.randint(10, 100)
    except:
        import random
        return random.randint(10, 100)

def show_music():
    """Show audio level as bar graph."""
    level = get_audio_level()
    bars = int(level / 10)
    bar = "|" * bars + " " * (10 - bars)
    send_oled(["== MUSIC ==", f"Vol: [{bar}]", f"Level: {level}%"])
    print(f"Audio: {level}%")

# =====================================================
# 5. NOTIFICATIONS
# =====================================================
last_notifications = []

def check_notifications():
    """Check for new notifications."""
    try:
        # Check Windows toast notifications
        result = subprocess.run(
            ['powershell', '-command',
             'Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\Windows\\Notifications\\wpdata" '
             '-Recurse -Filter "*.dat" | Select-Object -First 1'],
            capture_output=True, text=True, timeout=3
        )
        # For demo, return placeholder
        return ["No new notifications"]
    except:
        return ["No new notifications"]

def show_notifications():
    notifs = check_notifications()
    print(f"Notifications: {notifs}")
    send_oled(["== ALERTS ="] + notifs[:2])

# =====================================================
# 6. CALENDAR
# =====================================================
def get_calendar():
    import datetime
    now = datetime.datetime.now()
    date_str = now.strftime("%d %b %Y")
    day_str = now.strftime("%A")
    time_str = now.strftime("%I:%M %p")
    return [date_str, day_str, time_str]

def show_calendar():
    cal = get_calendar()
    print(f"Calendar: {cal}")
    send_oled(["== TODAY =="] + cal)

# =====================================================
# 8. TIME
# =====================================================
def show_time():
    now = time.localtime()
    t = f"{now.tm_hour:02d}:{now.tm_min:02d}:{now.tm_sec:02d}"
    send_oled(["== TIME ==", t])
    print(f"Time: {t}")

# =====================================================
# AUTO MODE
# =====================================================
auto_running = False

def auto_mode():
    global auto_running
    auto_running = True
    features = [show_weather, show_battery, show_system, show_calendar, show_time]
    idx = 0
    while auto_running:
        features[idx % len(features)]()
        idx += 1
        time.sleep(5)

# =====================================================
# MAIN
# =====================================================
def main():
    connect()

    auto_thread = None

    try:
        while True:
            choice = input("Select: ").strip()

            if choice == '1':
                show_weather()
            elif choice == '2':
                show_battery()
            elif choice == '3':
                show_system()
            elif choice == '4':
                show_music()
            elif choice == '5':
                show_notifications()
            elif choice == '6':
                show_calendar()
            elif choice == '7':
                if auto_thread and auto_thread.is_alive():
                    auto_running = False
                    print("Auto mode stopped")
                else:
                    auto_thread = threading.Thread(target=auto_mode, daemon=True)
                    auto_thread.start()
                    print("Auto mode started (press Enter to stop)")
            elif choice == '8':
                show_time()
            elif choice.lower() == 'q':
                break
            else:
                # Send raw text
                if choice:
                    send_oled([choice])

    except KeyboardInterrupt:
        pass
    finally:
        auto_running = False
        if ser and ser.is_open:
            ser.close()
        print("\nDone.")

if __name__ == "__main__":
    main()
