#!/usr/bin/env python3
"""
QBIT Dashboard Server — v2 (fast)
Pre-converts frames to U8G2 format, streams at 2Mbaud.

Usage:
  pip install pyserial websockets
  python server.py --port COM3
  Open http://localhost:8765
"""

import argparse, asyncio, json, re, sys, time
from pathlib import Path

import serial
import websockets

# =====================================================
# Parse sys_idle.h → pre-convert to U8G2 page-major
# =====================================================

IDLE_H = Path(__file__).parent / "include" / "sys_idle.h"

def parse_qbit_frames(h_file):
    content = h_file.read_text(encoding="utf-8", errors="ignore")

    m = re.search(r'sys_idle_delays\[.*?\]\s*=\s*\{([^}]+)\}', content)
    delays = [int(x.strip()) for x in m.group(1).split(",") if x.strip()] if m else [30]*149

    frames_match = re.search(r'sys_idle_frames\[.*?\]\s*=\s*\{(.*)', content, re.DOTALL)
    if not frames_match:
        return delays, []

    frame_blocks = re.findall(r'\{([^}]+)\}', frames_match.group(1))
    frames = []
    for block in frame_blocks:
        hex_vals = re.findall(r'0x([0-9a-fA-F]{2})', block)
        if len(hex_vals) == 1024:
            frames.append(bytes(int(h, 16) for h in hex_vals))
    return delays, frames

def qbit_to_u8g2(frame):
    """Convert one QBIT row-major frame to U8G2 page-major format."""
    buf = bytearray(1024)
    for page in range(8):
        for col in range(128):
            val = 0
            col_byte = col >> 3
            col_bit = 1 << (7 - (col & 7))
            for bit in range(8):
                row = (page << 3) | bit
                src = row * 16 + col_byte
                if frame[src] & col_bit:
                    val |= (1 << bit)
            buf[page * 128 + col] = val ^ 0xFF
    return bytes(buf)

# =====================================================
# Serial
# =====================================================

class QBITSerial:
    def __init__(self, port, baud=2000000):
        self.ser = None
        self.connected = False
        try:
            self.ser = serial.Serial(port, baud, timeout=2)
            time.sleep(2)
            self.ser.reset_input_buffer()
            self.ser.write(b'X')
            resp = self.ser.readline().decode().strip()
            if resp == "QBIT_OK":
                self.connected = True
                print(f"Connected: {port} @ {baud}")
        except Exception as e:
            print(f"Serial error: {e}")

    def send_frame(self, data):
        if not self.connected: return False
        self.ser.reset_input_buffer()
        self.ser.write(b'R')
        self.ser.write(data)
        # Wait for "F" acknowledgment from Uno
        resp = self.ser.readline().decode().strip()
        return resp == "F"

    def close(self):
        if self.ser: self.ser.close()

# =====================================================
# Player
# =====================================================

class Player:
    def __init__(self, serial_conn, delays, frames_u8g2):
        self.serial = serial_conn
        self.delays = delays
        self.frames = frames_u8g2
        self.playing = False
        self.idx = 0
        self.speed = 1.0
        self.on_update = None

    def play(self):
        self.playing = True
        self.idx = 0

    def stop(self):
        self.playing = False
        self.idx = 0

    def goto(self, frame):
        self.idx = max(0, min(frame, len(self.frames) - 1)) if self.frames else 0

    async def tick(self):
        while True:
            if self.playing and self.frames:
                # Send frame and wait for Uno to confirm it rendered
                sent = self.serial.send_frame(self.frames[self.idx])
                if self.on_update:
                    self.on_update(self.idx, len(self.frames))
                self.idx = (self.idx + 1) % len(self.frames)
                # Wait the remaining delay after frame transfer
                delay = (self.delays[self.idx % len(self.delays)] / 1000.0) / self.speed
                elapsed = 0.005  # approximate transfer time
                remaining = max(0.001, delay - elapsed)
                await asyncio.sleep(remaining)
            else:
                await asyncio.sleep(0.05)

    def state(self):
        return {
            "playing": self.playing,
            "frame": self.idx,
            "totalFrames": len(self.frames),
            "speed": self.speed,
        }

# =====================================================
# WebSocket
# =====================================================

clients = set()
player = None

async def ws_handler(ws):
    global player, clients
    clients.add(ws)
    try:
        await ws.send(json.dumps({"type":"state","data":player.state()}))
        async for msg in ws:
            m = json.loads(msg)
            if m["cmd"]=="play": player.play()
            elif m["cmd"]=="stop": player.stop()
            elif m["cmd"]=="speed": player.speed = max(0.1,min(5.0,m["value"]))
            elif m["cmd"]=="goto": player.goto(m["frame"])
            state = json.dumps({"type":"state","data":player.state()})
            await asyncio.gather(*[c.send(state) for c in clients])
    finally:
        clients.discard(ws)

# =====================================================
# HTTP
# =====================================================

from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            html = (Path(__file__).parent / "dashboard.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type","text/html")
            self.end_headers()
            self.wfile.write(html)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *a): pass

# =====================================================
# Main
# =====================================================

def main():
    global player
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True)
    ap.add_argument("--baud", type=int, default=2000000)
    ap.add_argument("--http-port", type=int, default=8765)
    args = ap.parse_args()

    print(f"Loading {IDLE_H}...")
    delays, raw_frames = parse_qbit_frames(IDLE_H)
    print(f"Loaded {len(raw_frames)} frames")

    print("Pre-converting to U8G2 format...")
    frames = [qbit_to_u8g2(f) for f in raw_frames]
    print("Done.")

    ser = QBITSerial(args.port, args.baud)
    if not ser.connected:
        print("Cannot connect to Arduino!")
        sys.exit(1)

    player = Player(ser, delays, frames)
    player.play()

    httpd = HTTPServer(("0.0.0.0", args.http_port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"Dashboard: http://localhost:{args.http_port}")

    async def run():
        ws_serve = await websockets.serve(ws_handler, "0.0.0.0", args.http_port+1)
        print(f"WebSocket: ws://localhost:{args.http_port+1}")
        print("Ctrl+C to stop.\n")
        await player.tick()

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        player.stop()
        ser.close()

if __name__=="__main__":
    main()
