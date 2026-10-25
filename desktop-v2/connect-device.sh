#!/usr/bin/env bash
# connect-device.sh - bind the QBIT-Hub Bluetooth SPP to /dev/rfcomm0 and launch
# the app. Newer BlueZ (5.87+) removed the `rfcomm` command, so we use a tiny
# ioctl helper (rfcomm-bind) built from rfcomm-bind.c.
#
# Usage:  ./connect-device.sh [MAC] [channel]
# Default MAC is the QBIT-Hub paired on this machine.
set -e

MAC="${1:-2C:BC:BB:A9:86:8A}"
CHANNEL="${2:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
HELPER="$HERE/rfcomm-bind"
SRC="$HERE/rfcomm-bind.c"

# Build the helper once if missing.
if [ ! -x "$HELPER" ]; then
  echo "Building rfcomm-bind helper..."
  gcc -O2 -o "$HELPER" "$SRC" -lbluetooth
fi

# Bind if /dev/rfcomm0 is not already present.
if [ ! -e /dev/rfcomm0 ]; then
  echo "Binding $MAC (channel $CHANNEL) -> /dev/rfcomm0 (needs sudo)..."
  sudo "$HELPER" 0 "$MAC" "$CHANNEL"
  sudo chmod 666 /dev/rfcomm0
else
  echo "/dev/rfcomm0 already exists."
fi

echo "Ready. /dev/rfcomm0:"
ls -la /dev/rfcomm0

# Launch the app (comment out if you start it yourself).
cd "$HERE"
npm start
