"""
clipboard_oled.py - Copy on laptop, show on OLED

Just copy text (Ctrl+C) and it appears on OLED automatically.

Requirements:
  pip install pyserial
"""

import serial
import time
import subprocess
import ctypes

# =====================================================
# CONFIG
# =====================================================
SERIAL_PORT = "COM3"
BAUD_RATE = 9600

# =====================================================
# GET CLIPBOARD
# =====================================================
def get_clipboard():
    """Get clipboard text using PowerShell."""
    try:
        result = subprocess.run(
            ['powershell', '-command', 'Get-Clipboard'],
            capture_output=True, text=True, timeout=3
        )
        return result.stdout.strip()
    except:
        return ""

# =====================================================
# SEND TO ARDUINO
# =====================================================
def send_to_oled(ser, text):
    """Send text to Arduino."""
    if not text:
        return
    msg = f"M{text}\n"
    ser.write(msg.encode('utf-8', errors='replace'))
    ser.flush()
    print(f"Sent: {text[:50]}")

# =====================================================
# MAIN
# =====================================================
def main():
    print(f"Connecting to {SERIAL_PORT}...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("Connected!")
    print("")
    print("=" * 40)
    print("  Copy anything (Ctrl+C)")
    print("  It will show on OLED!")
    print("")
    print("  Or type message + Enter")
    print("  Type 'quit' to exit")
    print("=" * 40)
    print("")

    last_clipboard = ""

    try:
        while True:
            # Check clipboard
            current = get_clipboard()
            if current and current != last_clipboard:
                send_to_oled(ser, current)
                last_clipboard = current

            # Check user input
            try:
                import msvcrt
                if msvcrt.kbhit():
                    line = input("> ").strip()
                    if line.lower() == 'quit':
                        break
                    elif line.lower() == 'time':
                        now = time.localtime()
                        t = f"T{now.tm_hour:02d}:{now.tm_min:02d}:{now.tm_sec:02d}"
                        ser.write(f"{t}\n".encode())
                        ser.flush()
                        print("Time sent")
                    elif line:
                        send_to_oled(ser, line)
            except:
                pass

            time.sleep(0.5)

    except KeyboardInterrupt:
        pass
    finally:
        ser.close()
        print("\nDone.")

if __name__ == "__main__":
    main()
