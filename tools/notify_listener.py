"""
Notification listener - polls foreground window and Phone Link process.
When Phone Link or other apps show a notification, it sends to OLED.
"""
import time
import ctypes
import subprocess

user32 = ctypes.windll.user32

def get_foreground_title():
    try:
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return "", hwnd
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        cls_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls_buf, 256)
        return buf.value, hwnd
    except:
        return "", 0

def get_all_windows():
    windows = []
    def callback(hwnd, lParam):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                cls_buf = ctypes.create_unicode_buffer(256)
                user32.GetClassNameW(hwnd, cls_buf, 256)
                title = buf.value
                cls = cls_buf.value
                if title and len(title) > 1:
                    windows.append((hwnd, title, cls))
        return True
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
    user32.EnumWindows(WNDENUMPROC(callback), 0)
    return windows

IGNORE_CLASSES = {
    'MediaContextNotificationWindow',
    'DWM Notification Window',
    'Windows Push Notifications Platform',
    'BluetoothNotificationAreaIconWindowClass',
    'NotifyIconOverflowWindow',
    'Shell_TrayWnd',
    'Shell_SecondaryTrayWnd',
    'Progman',
    'WorkerW',
    'MSCTFIME UI',
    'IME',
    'ApplicationFrameWindow',
}

def start_notification_listener(send_fn):
    print("  [Notify] Monitoring for new popup windows...")

    # Baseline
    base_windows = get_all_windows()
    base_hwnds = {hwnd for hwnd, title, cls in base_windows}
    notified = set()

    print(f"  [Notify] Baseline: {len(base_hwnds)} windows. Send a notification now!")

    while True:
        try:
            time.sleep(2)
            current = get_all_windows()

            for hwnd, title, cls in current:
                if hwnd in base_hwnds or hwnd in notified:
                    continue
                if cls in IGNORE_CLASSES:
                    continue
                if len(title) > 100:
                    continue

                # New window appeared!
                notified.add(hwnd)
                send_fn(f"APHONE LINK|{title[:60]}")
                print(f"  [Notify] NEW: {title[:60]}")

            if len(notified) > 200:
                notified = set(list(notified)[-100:])

            # Refresh baseline every 60 sec
            if len(current) > len(base_hwnds) + 10:
                for hwnd, title, cls in current:
                    base_hwnds.add(hwnd)

        except Exception as e:
            pass


if __name__ == "__main__":
    def test(cmd):
        print(f"  SEND: {cmd}")
    start_notification_listener(test)
