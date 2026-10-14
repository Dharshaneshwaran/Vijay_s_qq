"""
send_time.py - Sends real clock time to Arduino Uno via USB serial.

Usage:
  python send_time.py

Protocol:
  Sends "THH:MM:SS\n" every second to the Uno.
  Uno displays the real time on the OLED.

Requirements:
  pip install pyserial

The Uno shows up as a COM port (e.g., COM3 on Windows).
Edit SERIAL_PORT below to match your Uno's port.
"""

import time
import serial

# =====================================================
# CONFIG - change this to your Uno's COM port
# =====================================================
SERIAL_PORT = "COM3"   # Windows: check Device Manager
                        # Linux:   /dev/ttyACM0 or /dev/ttyUSB0
                        # Mac:     /dev/cu.usbmodem*

BAUD_RATE = 9600

# =====================================================
# MAIN
# =====================================================

def main():
    print(f"Connecting to {SERIAL_PORT} at {BAUD_RATE} baud...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)  # wait for Uno to reset after serial connect
    print("Connected! Sending time... (Ctrl+C to stop)")

    try:
        while True:
            now = time.localtime()
            t_str = f"T{now.tm_hour:02d}:{now.tm_min:02d}:{now.tm_sec:02d}\n"
            ser.write(t_str.encode())
            ser.flush()
            print(f"  Sent: {t_str.strip()}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
