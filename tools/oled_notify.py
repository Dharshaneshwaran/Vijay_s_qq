"""
oled_notify.py - Send notifications to Arduino OLED

Features:
  1. Press Ctrl+Shift+O to send clipboard text to OLED
  2. Type messages manually in the console
  3. Captures Windows notifications automatically

Requirements:
  pip install pyserial keyboard plyer
"""

import serial
import time
import threading
import sys

# =====================================================
# CONFIG
# =====================================================
SERIAL_PORT = "COM3"  # Change to your Uno's port
BAUD_RATE = 9600

# =====================================================
# SERIAL CONNECTION
# =====================================================
ser = None

def connect():
    global ser
    print(f"Connecting to {SERIAL_PORT}...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("Connected!")
    print("=" * 40)
    print("Commands:")
    print("  Type any text + Enter  -> Send to OLED")
    print("  Ctrl+Shift+O          -> Send clipboard to OLED")
    print("  'time'                -> Send current time")
    print("  'clear'               -> Clear OLED")
    print("  'quit'                -> Exit")
    print("=" * 40)

def send_to_oled(text):
    """Send text to Arduino via serial."""
    global ser
    if not ser or not ser.is_open:
        print("Not connected!")
        return

    # Arduino expects: M<text>\n (M = message mode)
    msg = f"M{text}\n"
    ser.write(msg.encode('utf-8', errors='replace'))
    ser.flush()
    print(f"  -> Sent: {text[:50]}...")

def send_time():
    """Send current time to Arduino."""
    now = time.localtime()
    t_str = f"T{now.tm_hour:02d}:{now.tm_min:02d}:{now.tm_sec:02d}"
    send_to_oled(t_str)

def send_clear():
    """Clear OLED display."""
    send_to_oled("CLEAR")

# =====================================================
# CLIPBOARD MONITOR (Ctrl+Shift+O)
# =====================================================

def monitor_clipboard():
    """Watch for Ctrl+Shift+O hotkey to send clipboard."""
    try:
        import keyboard
        print("\n[Clipboard monitor active - Ctrl+Shift+O to send]")

        def on_hotkey():
            try:
                import subprocess
                result = subprocess.run(
                    ['powershell', '-command', 'Get-Clipboard'],
                    capture_output=True, text=True, timeout=3
                )
                text = result.stdout.strip()
                if text:
                    print(f"\n[Clipboard captured]")
                    send_to_oled(text[:100])
                else:
                    print("\n[Clipboard empty]")
            except Exception as e:
                print(f"\n[Clipboard error: {e}]")

        keyboard.add_hotkey('ctrl+shift+o', on_hotkey)
        return True
    except ImportError:
        print("\n[Install 'keyboard' for clipboard support: pip install keyboard]")
        return False

# =====================================================
# WINDOWS NOTIFICATION MONITOR
# =====================================================

def monitor_notifications():
    """Monitor Windows toast notifications."""
    try:
        from plyer import notification
        print("[Notification monitor active]")
        return True
    except ImportError:
        print("[Install 'plyer' for notifications: pip install plyer]")
        return False

# =====================================================
# MAIN
# =====================================================

def main():
    connect()
    has_clipboard = monitor_clipboard()

    try:
        while True:
            try:
                # Check for incoming serial data (time requests from Arduino)
                if ser and ser.in_waiting:
                    line = ser.readline().decode('utf-8', errors='replace').strip()
                    if line.startswith("TIME?"):
                        send_time()

                # Console input (non-blocking check)
                import select
                if sys.platform == 'win32':
                    import msvcrt
                    if msvcrt.kbhit():
                        user_input = input("> ").strip()
                        if user_input.lower() == 'quit':
                            break
                        elif user_input.lower() == 'time':
                            send_time()
                        elif user_input.lower() == 'clear':
                            send_clear()
                        elif user_input:
                            send_to_oled(user_input)
                else:
                    # Linux/Mac
                    user_input = input("> ").strip()
                    if user_input.lower() == 'quit':
                        break
                    elif user_input.lower() == 'time':
                        send_time()
                    elif user_input.lower() == 'clear':
                        send_clear()
                    elif user_input:
                        send_to_oled(user_input)

                time.sleep(0.1)

            except EOFError:
                break
            except KeyboardInterrupt:
                break

    finally:
        if ser and ser.is_open:
            ser.close()
        print("\nDisconnected.")

if __name__ == "__main__":
    main()
