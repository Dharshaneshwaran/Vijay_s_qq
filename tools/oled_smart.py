# python
import sys
import time
import datetime
import requests
import subprocess
import re
import ctypes
import threading
from collections import deque

try:
    import serial
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyserial"])
    import serial

try:
    import psutil
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
    import psutil

PORT = "COM4"
BAUD = 9600
WEATHER_CITY = "Coimbatore"

E_HAPPY = 0; E_NORMAL = 1; E_SAD = 2; E_ANGRY = 3; E_CHARGING = 4
E_SLEEPY = 5; E_EXCITED = 6; E_WORRIED = 7; E_COOL = 8; E_ALERT = 9

NOTIF_SKIP = ["Visual Studio Code", "Kiro", "VS Code", "Code - OSS",
              "PyCharm", "IntelliJ", "Android Studio", "Eclipse",
              "Sublime Text", "Notepad++", "Atom", "Postman", "Insomnia"]

last_battery = -1
last_alert = ""
alert_cooldown = 0
last_weather = 0
last_bt_check = 0
bt_was_connected = False
last_clipboard = ""
last_dashboard = 0
serial_lock = threading.Lock()
DASH_CYCLE = [0, 1, 2, 4, 5, 6, 7]  # cpu, ram, brightness, hub, cputemp, disk, net
dash_idx = 0
net_prev = None
net_last_time = 0

CUSTOM_RULES = [
    {"type": "cpu", "threshold": 90, "msg": "CPU HIGH|90%+|"},
    {"type": "ram", "threshold": 85, "msg": "RAM HIGH|85%+|"},
    {"type": "temp", "threshold": 80, "msg": "CPU HOT|80C+|"},
    {"type": "disk", "threshold": 90, "msg": "DISK FULL|90%+|"},
    {"type": "net", "threshold": 10, "msg": "NET SPIKE|10MB/s+|"},
]
custom_alert_cooldowns = {}

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
    time.sleep(2)
    print("Connected to Arduino", flush=True)
    time.sleep(3)
    while ser.in_waiting:
        print(ser.readline().decode("utf-8", errors="ignore").strip(), flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    sys.exit(1)

def send_cmd(prefix, data):
    try:
        msg = f"{prefix}{data}\n".encode()
        with serial_lock:
            ser.write(msg)
            ser.flush()
        print(f"Sent: {prefix}{data}", flush=True)
    except Exception as e:
        print(f"Send error: {e}", flush=True)

def get_foreground():
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value
    except:
        return ""

def check_bluetooth():
    global bt_was_connected, last_bt_check
    now = time.time()
    if now - last_bt_check < 5:
        return
    last_bt_check = now
    bt_connected = False
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Enum\Bluetooth", 0, winreg.KEY_READ)
        i = 0
        while True:
            try:
                subkey = winreg.EnumKey(key, i)
                dev_key = winreg.OpenKey(key, subkey + "\\Device Parameters", 0, winreg.KEY_READ)
                winreg.CloseKey(dev_key)
                bt_connected = True
                break
            except OSError:
                break
            i += 1
            if i > 20:
                break
        winreg.CloseKey(key)
    except:
        pass
    if not bt_connected:
        try:
            r = subprocess.run(
                ["powershell", "-Command",
                 "Get-PnpDevice -Status OK | Where-Object {$_.Class -eq 'Bluetooth'} | Select-Object -First 1 -ExpandProperty Status"],
                capture_output=True, text=True, timeout=3)
            if "OK" in r.stdout:
                bt_connected = True
        except:
            pass
    if bt_connected != bt_was_connected:
        bt_was_connected = bt_connected
        send_cmd("BT", "1" if bt_connected else "0")
        print(f"Bluetooth: {'Connected' if bt_connected else 'Disconnected'}", flush=True)

def send_battery():
    global last_battery, last_alert, alert_cooldown
    batt = psutil.sensors_battery()
    if batt is None:
        return
    percent = batt.percent
    is_charging = batt.power_plugged
    charge = "1" if is_charging else "0"
    last_battery = percent
    send_cmd("B", f"{percent},{charge}")
    if is_charging:
        last_alert = ""
    elif percent <= 10 and last_alert != "low" and time.time() > alert_cooldown:
        send_cmd("A", "ALERT|LOW BATTERY|")
        last_alert = "low"
        alert_cooldown = time.time() + 60
    elif percent <= 15 and last_alert != "caution" and time.time() > alert_cooldown:
        send_cmd("A", "ALERT|Consider|Charging|")
        last_alert = "caution"
        alert_cooldown = time.time() + 120
    elif percent > 15:
        last_alert = ""

def send_weather():
    try:
        url = f"https://wttr.in/{WEATHER_CITY}?format=%C+%t+%h"
        r = requests.get(url, timeout=3)
        if r.status_code == 200:
            cond = r.text.strip().encode("ascii", "ignore").decode()
            if "rain" in cond.lower() or "drizzle" in cond.lower():
                send_cmd("W", "2")
            else:
                send_cmd("W", "1")
            print(f"Weather: {cond}", flush=True)
        else:
            send_cmd("W", "1")
    except Exception as e:
        print(f"Weather error: {e}", flush=True)
        send_cmd("W", "1")

def check_music():
    title = get_foreground()
    cleaned = ""
    if "YouTube" in title:
        cleaned = re.sub(r"\s*[-–|].*$", "", title.replace(" - YouTube", "").replace(" | YouTube", ""))
    elif "Spotify" in title:
        cleaned = re.sub(r"\s*[-–|].*$", "", title.replace(" - Spotify", "").replace(" | Spotify", ""))
    if cleaned and len(cleaned) > 2:
        send_cmd("M", f"♪ {cleaned}")
        print(f"Music: {cleaned}", flush=True)

def get_clipboard():
    try:
        r = subprocess.run(
            ['powershell', '-command', 'Get-Clipboard'],
            capture_output=True, text=True, timeout=3)
        return r.stdout.strip()
    except:
        return ""

def monitor_clipboard():
    global last_clipboard
    while True:
        cur = get_clipboard()
        if cur and cur != last_clipboard:
            last_clipboard = cur
            send_cmd("C", cur[:120])
            print(f"Clipboard: {cur[:30]}", flush=True)
            time.sleep(5)
        time.sleep(1)

def get_brightness():
    try:
        result = subprocess.run(
            ['powershell', '-command',
             'Get-CimInstance -Namespace root\\WMI '
             '-ClassName WmiMonitorBrightness | '
             'Select-Object -ExpandProperty CurrentBrightness'],
            capture_output=True, text=True, timeout=5)
        return int(result.stdout.strip())
    except:
        return 0

def get_cpu_temp():
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for name, entries in temps.items():
                if entries:
                    return int(entries[0].current)
    except:
        pass
    try:
        r = subprocess.run(
            ['powershell', '-command',
             '(Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/WMI '
             '| Select-Object -First 1).CurrentTemperature / 10'],
            capture_output=True, text=True, timeout=5)
        val = float(r.stdout.strip())
        return int(val)
    except:
        return -1

def get_disk_usage():
    try:
        usage = psutil.disk_usage('/')
        return int(usage.percent), usage.used // (1024 * 1024 * 1024), usage.total // (1024 * 1024 * 1024)
    except:
        return -1, 0, 0

def get_network_speed():
    global net_prev, net_last_time
    try:
        net = psutil.net_io_counters()
        now = time.time()
        if net_prev and net_last_time:
            dt = now - net_last_time
            if dt > 0:
                up_speed = (net.bytes_sent - net_prev.bytes_sent) / dt / 1024  # KB/s
                down_speed = (net.bytes_recv - net_prev.bytes_recv) / dt / 1024
                net_prev = net
                net_last_time = now
                return up_speed, down_speed
        net_prev = net
        net_last_time = now
        return 0, 0
    except:
        return 0, 0

def check_custom_rules():
    for rule in CUSTOM_RULES:
        rtype = rule["type"]
        threshold = rule["threshold"]
        msg = rule["msg"]
        cooldown_key = f"{rtype}_{threshold}"
        now = time.time()
        if cooldown_key in custom_alert_cooldowns and now < custom_alert_cooldowns[cooldown_key]:
            continue
        triggered = False
        if rtype == "cpu":
            val = psutil.cpu_percent(interval=0.1)
            if val >= threshold:
                triggered = True
        elif rtype == "ram":
            val = psutil.virtual_memory().percent
            if val >= threshold:
                triggered = True
        elif rtype == "temp":
            val = get_cpu_temp()
            if val >= threshold:
                triggered = True
        elif rtype == "disk":
            val = get_disk_usage()[0]
            if val >= threshold:
                triggered = True
        elif rtype == "net":
            _, down = get_network_speed()
            if down >= threshold:
                triggered = True
        if triggered:
            send_cmd("A", msg)
            custom_alert_cooldowns[cooldown_key] = now + 300
            print(f"Custom alert: {msg}", flush=True)

def send_live_clock():
    while True:
        t = time.strftime("%I:%M:%S")
        ampm = time.strftime("%p")
        d = time.strftime("%d %b %Y")
        send_cmd("T", f"{t} {ampm}|{d}|")
        time.sleep(1.5)

def send_dashboard():
    global dash_idx, last_dashboard
    now = time.time()
    if now - last_dashboard < 300:
        return
    last_dashboard = now

    mode = DASH_CYCLE[dash_idx % len(DASH_CYCLE)]
    dash_idx += 1

    try:
        if mode == 0:  # CPU
            cpu = psutil.cpu_percent(interval=0.3)
            send_cmd("D", f"CPU|{int(cpu)}%|")
        elif mode == 1:  # RAM
            ram = psutil.virtual_memory()
            used_mb = ram.used // (1024 * 1024)
            send_cmd("D", f"RAM|{int(ram.percent)}%|{used_mb}MB|")
        elif mode == 2:  # Brightness
            br = get_brightness()
            send_cmd("D", f"BRIGHT|{br}%|")
        elif mode == 4:  # Hub (all in one)
            batt = psutil.sensors_battery()
            cpu = psutil.cpu_percent(interval=0.3)
            ram = psutil.virtual_memory()
            t = time.strftime("%H:%M")
            if batt:
                bat_str = f"{batt.percent}%"
                if batt.power_plugged:
                    bat_str += "+"
            else:
                bat_str = "N/A"
            send_cmd("D", f"HUB|B:{bat_str} C:{int(cpu)}%|R:{int(ram.percent)}% {t}|")
        elif mode == 5:  # CPU Temp
            temp = get_cpu_temp()
            if temp > 0:
                send_cmd("D", f"TEMP|{temp}C|")
            else:
                send_cmd("D", f"TEMP|N/A|")
        elif mode == 6:  # Disk
            pct, used, total = get_disk_usage()
            if pct >= 0:
                send_cmd("D", f"DISK|{pct}%|{used}/{total}GB|")
            else:
                send_cmd("D", f"DISK|N/A|")
        elif mode == 7:  # Network
            up, down = get_network_speed()
            if up > 1024 or down > 1024:
                send_cmd("D", f"NET|U:{up/1024:.1f}M|D:{down/1024:.1f}M|")
            else:
                send_cmd("D", f"NET|U:{up:.0f}K|D:{down:.0f}K|")
    except Exception as e:
        print(f"Dashboard error: {e}", flush=True)

def monitor_toast_notifications():
    try:
        from winsdk.windows.ui.notifications import ToastNotificationManager
        seen = deque(maxlen=50)
        print("Toast monitor started", flush=True)
        while True:
            try:
                notifier = ToastNotificationManager.create_toast_notifier_with_id(
                    "{0AC5ED19-6F34-457F-8F76-31C476A98B22}")
                history = notifier.get_history()
                notifs = history.get_toast_history()
                for i in range(min(notifs.size, 5)):
                    try:
                        toast = notifs.get_at(i)
                        app_id = toast.get_tag()
                        if not app_id:
                            app_id = str(i)
                        if app_id in seen:
                            continue
                        seen.append(app_id)
                        binding = toast.get_visual_properties().get_binding_text()
                        if binding and binding.size > 0:
                            text = binding.get_at(0).get_text()
                            if text and len(text) > 2:
                                skip = False
                                for s in NOTIF_SKIP:
                                    if s.lower() in text.lower():
                                        skip = True
                                        break
                                if not skip:
                                    short = text[:30]
                                    send_cmd("A", f"NOTIFY|{short}|")
                                    print(f"Toast: {short}", flush=True)
                    except:
                        pass
            except:
                pass
            time.sleep(8)
    except ImportError:
        print("WinRT not available", flush=True)
    except Exception as e:
        print(f"Toast error: {e}", flush=True)

toast_thread = threading.Thread(target=monitor_toast_notifications, daemon=True)
toast_thread.start()
clip_thread = threading.Thread(target=monitor_clipboard, daemon=True)
clip_thread.start()
clock_thread = threading.Thread(target=send_live_clock, daemon=True)
clock_thread.start()

print("Running...", flush=True)
try:
    while True:
        send_battery()
        check_bluetooth()
        check_music()
        send_dashboard()
        check_custom_rules()

        now = time.time()
        if now - last_weather > 1800:
            send_weather()
            last_weather = now

        time.sleep(3)
except KeyboardInterrupt:
    print("Stopped", flush=True)
finally:
    ser.close()
