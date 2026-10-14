"""
allow_clicker.py - Monitor permission dialogs, click Allow from Arduino

When Kiro (or any app) asks "Allow?", it shows on OLED.
Press Arduino button to click Allow/Decline on laptop.

Requirements:
  pip install pyserial pyautogui
"""

import serial
import time
import threading
import subprocess
import re

# =====================================================
# CONFIG
# =====================================================
SERIAL_PORT = "COM3"  # Change to your Uno's port
BAUD_RATE = 9600

# =====================================================
# SERIAL
# =====================================================
ser = None

def connect():
    global ser
    print(f"Connecting to {SERIAL_PORT} at {BAUD_RATE} baud...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("Connected!")
    print("=" * 40)
    print("Arduino buttons:")
    print("  Button A (Pin 2) -> Accept/Allow")
    print("  Button B (Pin 3) -> Decline/Skip")
    print("=" * 40)

def send_to_oled(text):
    """Send message to Arduino OLED."""
    global ser
    if not ser or not ser.is_open:
        return
    msg = f"M{text}\n"
    ser.write(msg.encode('utf-8', errors='replace'))
    ser.flush()
    print(f"  -> OLED: {text[:40]}...")

def click_allow():
    """Click the Allow button on laptop."""
    try:
        import pyautogui
        # Try to find and click Allow button
        # Common Allow button locations/text
        try:
            loc = pyautogui.locateOnScreen('allow_button.png', confidence=0.8)
            if loc:
                pyautogui.click(pyautogui.center(loc))
                print("  [Clicked Allow button]")
                return
        except:
            pass

        # Fallback: try common positions or use keyboard
        # For most dialogs, Alt+A or Enter works
        pyautogui.hotkey('alt', 'a')
        print("  [Sent Alt+A to accept]")
    except Exception as e:
        print(f"  [Click error: {e}]")

def click_decline():
    """Click Decline/Cancel on laptop."""
    try:
        import pyautogui
        pyautogui.hotkey('alt', 'n')
        print("  [Sent Alt+N to decline]")
    except Exception as e:
        print(f"  [Click error: {e}]")

# =====================================================
# MONITOR PERMISSION DIALOGS
# =====================================================

def monitor_permissions():
    """Check for permission dialogs periodically."""
    print("[Permission monitor active]")

    last_check = 0
    while True:
        now = time.time()
        if now - last_check < 2:  # Check every 2 seconds
            time.sleep(0.5)
            continue
        last_check = now

        try:
            # Take screenshot and look for "Allow" text
            import pyautogui
            screenshot = pyautogui.screenshot()

            # Check if any permission dialog is visible
            # This is a simple check - you can improve with OCR
            # For now, we'll just send a test message periodically

        except Exception as e:
            pass

# =====================================================
# LISTEN FOR ARDUINO BUTTONS
# =====================================================

def listen_arduino():
    """Listen for button presses from Arduino."""
    global ser
    buffer = ""

    while True:
        if not ser or not ser.is_open:
            time.sleep(1)
            continue

        try:
            if ser.in_waiting:
                data = ser.read(ser.in_waiting).decode('utf-8', errors='replace')
                buffer += data

                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    line = line.strip()

                    if line.startswith("BTN:"):
                        btn = line[4:]
                        if btn == "A":
                            print("  [Button A pressed - Accept]")
                            click_allow()
                            send_to_oled("ACCEPTED!");
                            time.sleep(1)
                        elif btn == "B":
                            print("  [Button B pressed - Decline]")
                            click_decline()
                            send_to_oled("DECLINED!");
                            time.sleep(1)

            time.sleep(0.01)
        except:
            time.sleep(0.1)

# =====================================================
# MAIN
# =====================================================

def main():
    connect()

    # Start button listener thread
    btn_thread = threading.Thread(target=listen_arduino, daemon=True)
    btn_thread.start()

    print("\nReady! Press Ctrl+C to exit.\n")
    print("To test: Send a message from Arduino or type below.\n")

    try:
        while True:
            try:
                user_input = input("> ").strip()
                if user_input.lower() == 'quit':
                    break
                elif user_input.lower() == 'test':
                    send_to_oled("Allow access?")
                elif user_input:
                    send_to_oled(user_input)
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
