# QBIT Hub (desktop-v2)

A brand-new Electron + React desktop companion for the **QBIT / ESP32-CAM Smart Hub**.

It reuses the original QBIT **face animations** and the `electron/` **emotion engine**
(unchanged), and adds four feature areas:

- 🕒 **Time & Productivity** — big clock, month calendar, alarms (one-shot or repeating),
  countdown timer, and a Pomodoro cycle with configurable focus/break lengths.
- 🌦️ **Weather** — current conditions, feels-like, humidity, wind, a 5-day forecast and
  rain alerts, powered by **Open-Meteo** (no API key).
- 💻 **System Monitor** — CPU, RAM, GPU, and laptop battery, with resource readouts.
- 🧑‍💻 **Device** — shows how your **ESP32-CAM is connected over Bluetooth**, lists serial
  ports, lets you connect/disconnect, streams a live TX/RX log, and exposes quick
  commands that drive the OLED firmware protocol.
- 🧑‍💻 **GitHub Developer Hub** — **deferred to phase 2** (the sidebar shows a disabled
  "GitHub — soon" entry).

This project lives beside the original app and does **not** modify `../desktop`.

---

## 1. Requirements

- Node.js 18+ and npm
- An ESP32-CAM flashed with `../firmware_esp32cam` (you handle the upload)
- Bluetooth on your laptop (the firmware link uses a Bluetooth **SPP serial port**)

## 2. Install & run

```bash
cd desktop-v2
npm install
npm run dev      # vite + electron in watch mode
```

Production build and launch:

```bash
npm run build    # tsc (renderer) + vite build + tsc (electron) + copy preload
npm start        # launches Electron against the built output
```

### Native modules note

`serialport` ships prebuilt binaries for common platforms, so a normal `npm install`
is usually enough. If your package manager blocks lifecycle scripts (some hardened npm
setups do), approve and finish them once:

```bash
npm install-scripts approve electron @serialport/bindings-cpp esbuild
npm rebuild electron esbuild @serialport/bindings-cpp
```

If you repackage with a different Electron ABI and hit a serialport load error, rebuild
the native binding against Electron:

```bash
npx @electron/rebuild -f -w @serialport/bindings-cpp
```

## 3. Pairing the ESP32-CAM over Bluetooth

1. Flash the firmware from `../firmware_esp32cam` and power the board. On boot it prints
   `READY` on its serial line at **9600 baud** and shows the "Dhashini Smart Hub" splash.
2. **Pair the device in your operating system's Bluetooth settings.** Pairing exposes a
   serial (SPP) port:
   - **Windows:** a `COMx` port (its `pnpId` contains `BTHENUM`).
   - **Linux:** typically `/dev/rfcomm0` (you may need `sudo rfcomm bind` depending on
     your stack).
   - **macOS:** a `/dev/tty.*` / `/dev/cu.*` Bluetooth device.
3. Open QBIT Hub → **Device** tab → **Scan ports**. The app labels each port's transport
   (Bluetooth / USB / Unknown). Click **Connect** on the ESP32-CAM's port.
4. On connect the app sends `BT1` (Bluetooth icon on) and starts mirroring state. If the
   board was already running before you connected it will not re-send `READY`; the status
   card shows "No READY yet" — press the board's reset to re-handshake if you want it.

**Auto-connect:** enabled by default (Settings → "Auto-connect device"). On startup the
app reconnects to the last-used port, else the best Bluetooth port it can find.

## 4. What the app pushes to the device

Pushes are de-duplicated (only sent on change) to spare the slow 9600-baud link. Toggles
live in **Settings**:

| Source                        | Sent to firmware        | Setting toggle            |
|-------------------------------|-------------------------|---------------------------|
| QBIT's current mood           | `E0`–`E9` (emotion)     | Send moods to device      |
| Battery percent + charging    | `B<percent>,<0\|1>`     | (always, while connected) |
| Weather: clear vs rainy       | `W1` sunny / `W2` monsoon | Send weather to device  |
| Weather: rain flag            | `R1` / `R0`             | Send weather to device    |
| Reminder / alarm fires        | `A<text>` (alert, 5 s)  | (always, while connected) |
| Link up / down                | `BT1` / `BT0`           | (always)                  |

### Expression → firmware emotion map

The desktop has 14 expressions; the OLED firmware has 10. They map as:

| Desktop expression | Firmware emotion | Index |
|--------------------|------------------|:-----:|
| happy, playful     | Happy            | 0     |
| idle, curious, thinking | Normal      | 1     |
| exhausted          | Sad              | 2     |
| stressed           | Angry            | 3     |
| charging           | Charging         | 4     |
| sleepy             | Sleepy           | 5     |
| excited            | Excited          | 6     |
| worried            | Worried          | 7     |
| focused            | Cool             | 8     |
| surprised, alert   | Alert            | 9     |

## 5. Full firmware serial protocol (reference)

Each command is a single newline-terminated line at **9600 baud**. The **Device → Quick
commands** panel sends these directly so you can test the board:

| Command            | Effect on the OLED                                   |
|--------------------|------------------------------------------------------|
| `BT1` / `BT0`      | Bluetooth icon on / off                              |
| `B<percent>,<0\|1>`| Battery percent + charging flag                      |
| `R1` / `R0`        | Rain flag on / off                                   |
| `C<text>`          | Clipboard scroll text (10 s)                         |
| `A<text>`          | Alert text (5 s, Alert face)                         |
| `D<text>`          | Dashboard text (8 s)                                 |
| `M<text>`          | Clipboard text + Cool face                           |
| `W1`               | Sunny weather animation (Excited)                    |
| `W2`               | Monsoon weather animation (Worried)                  |
| `E<0-9>`           | Set emotion directly                                 |
| `P`                | Run the built-in demo (cycles all 10 emotions)       |

## 6. Emotion engine (reused, unchanged)

The mood shown on the animated face comes straight from the original
`electron/expressionEngine.ts`:

- Activity score = `cpu*0.45 + ram*0.25 + gpu*0.30` (normalized when no GPU), sampled with
  hysteresis and an 8-second minimum mood duration.
- Priority: battery ≤ 5 % (discharging) → `exhausted` · reminder/alarm (12 s) → `alert` ·
  click (3 s) → `playful` · charge start (4 s) → `charging` · battery ≤ 20 % → `worried` ·
  otherwise the hardware-activity band · otherwise the resting expression from Settings.

## 7. Project layout

```
desktop-v2/
├─ electron/                 # main process (TypeScript, compiled to dist-electron/)
│  ├─ types.ts               # shared types (+ Alarm, DeviceState, WeatherSnapshot …)
│  ├─ expressionEngine.ts    # emotion engine (verbatim from original)
│  ├─ system.ts              # CPU/RAM/GPU/battery pollers (verbatim)
│  ├─ cursorMonitor.ts       # widget gaze tracking (verbatim)
│  ├─ store.ts               # electron-store persistence (+ alarms)
│  ├─ reminders.ts           # reminder + alarm schedulers
│  ├─ device.ts              # Bluetooth serial link + firmware protocol  ← new
│  ├─ windows.ts             # widget + control-center windows
│  ├─ tray.ts                # tray icon with live mood/stats
│  ├─ preload.cjs            # context-isolated IPC bridge
│  └─ main.ts                # IPC wiring, schedulers, device push
├─ src/                      # renderer (React + Vite)
│  ├─ components/            # QbitFace, SystemStats, TimeFocus, WeatherPanel,
│  │                         # DevicePanel, SettingsPanel, Reminder*  …
│  ├─ hooks/                 # useQbit, useCursorTracking
│  ├─ styles/                # global.css, expressions.css (faces), features.css
│  └─ App.tsx                # sidebar shell + tabs
└─ ...
```

## 8. Phase 2 — GitHub Developer Hub

Intentionally deferred. The planned scope: issues, pull requests, review requests,
mentions, and build-failure alerts, with alerts surfaced through QBIT's face (`alert`)
and pushed to the OLED via `A<text>` / `D<text>`. The sidebar reserves a disabled
"GitHub — soon" slot for it.
