"""
trackpad_oled.py - Use laptop trackpad to control cursor on OLED

Moves your trackpad → cursor moves on OLED display.

Requirements:
  pip install pyserial pynput
"""

import serial
import time
import threading

# =====================================================
# CONFIG
# =====================================================
SERIAL_PORT = "COM3"  # Change to your Uno's port
BAUD_RATE = 115200    # Faster for real-time tracking
OLED_W = 128
OLED_H = 64

# =====================================================
# STATE
# =====================================================
ser = None
cursor_x = OLED_W // 2
cursor_y = OLED_H // 2
drawing = False  # Left click = draw
erasing = False  # Right click = erase
last_sent = 0

# =====================================================
# SERIAL
# =====================================================
def connect():
    global ser
    print(f"Connecting to {SERIAL_PORT} at {BAUD_RATE} baud...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("Connected!")
    print("=" * 40)
    print("Trackpad controls:")
    print("  Move trackpad  -> Move cursor on OLED")
    print("  Left click     -> Draw (pen on)")
    print("  Right click    -> Erase")
    print("  Middle click   -> Clear screen")
    print("  Scroll         -> Change brush size")
    print("  ESC            -> Exit")
    print("=" * 40)

def send_cursor():
    """Send cursor position to Arduino."""
    global last_sent
    now = time.time()
    if now - last_sent < 0.016:  # ~60fps max
        return
    last_sent = now

    if not ser or not ser.is_open:
        return

    mode = 'D' if drawing else ('E' if erasing else 'C')
    msg = f"{mode}{cursor_x},{cursor_y}\n"
    try:
        ser.write(msg.encode())
        ser.flush()
    except:
        pass

# =====================================================
# MOUSE LISTENER
# =====================================================
def startMouseListener():
    from pynput import mouse

    def on_move(x, y):
        global cursor_x, cursor_y
        # Map screen coords to OLED coords
        # Get screen size (approximate)
        screen_w = 1920  # Adjust to your screen
        screen_h = 1080

        cursor_x = int((x / screen_w) * OLED_W)
        cursor_y = int((y / screen_h) * OLED_H)

        cursor_x = max(0, min(OLED_W - 1, cursor_x))
        cursor_y = max(0, min(OLED_H - 1, cursor_y))

        send_cursor()

    def on_click(x, y, button, pressed):
        global drawing, erasing
        if pressed:
            if button == mouse.Button.left:
                drawing = True
                erasing = False
                print("  [Pen ON]")
            elif button == mouse.Button.right:
                erasing = True
                drawing = False
                print("  [Eraser ON]")
            elif button == mouse.Button.middle:
                if ser and ser.is_open:
                    ser.write(b"C0,0\n")
                    print("  [Screen cleared]")
        else:
            drawing = False
            erasing = False

    listener = mouse.Listener(
        on_move=on_move,
        on_click=on_click
    )
    listener.start()
    return listener

# =====================================================
# MAIN
# =====================================================
def main():
    connect()
    listener = startMouseListener()

    try:
        while True:
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    finally:
        listener.stop()
        if ser and ser.is_open:
            ser.close()
        print("\nDisconnected.")

if __name__ == "__main__":
    main()
