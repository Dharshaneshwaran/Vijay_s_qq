// ---------------------------------------------------------------------------
// device.ts - Bluetooth (SPP serial) link to the ESP32-CAM Smart Hub.
//
// The firmware (firmware_esp32cam/src/main.cpp) talks a tiny newline-terminated
// protocol at 9600 baud and prints "READY" on boot. We open the paired
// Bluetooth serial port, watch for READY, parse incoming lines, and expose
// helpers to push desktop state down to the OLED.
//
// Protocol accepted by the firmware (one command per line):
//   BT1 / BT0              bluetooth icon on/off
//   B<percent>,<0|1>       battery percent + charging flag
//   R1 / R0                rain flag
//   C<text>                clipboard scroll text
//   A<text>                alert text (5s, sets ALERT face)
//   D<text>                dashboard text (8s)
//   M<text>                clipboard text + COOL face
//   W1 / W2                weather: 1 = sunny, 2 = monsoon
//   E<0-9>                 set emotion (0 Happy .. 9 Alert)
//   P                      run the demo
// ---------------------------------------------------------------------------
import { randomUUID } from 'node:crypto';
import { SerialPort, ReadlineParser } from 'serialport';
import type { DeviceState, DeviceTransport, SerialPortInfo, Expression, DeviceLogEntry } from './types.js';

const BAUD = 9600;
const READY_TIMEOUT = 5000;
const MAX_LOG = 50;

// The firmware now renders all 14 Electron expressions in the SAME order as the
// desktop's EXPRESSIONS array, so the E<n> command is a direct 1:1 index:
//   0 idle, 1 happy, 2 curious, 3 sleepy, 4 focused, 5 excited, 6 surprised,
//   7 worried, 8 stressed, 9 exhausted, 10 playful, 11 alert, 12 charging, 13 thinking.
export const EXPRESSION_TO_EMOTION: Record<Expression, number> = {
 idle: 0,
 happy: 1,
 curious: 2,
 sleepy: 3,
 focused: 4,
 excited: 5,
 surprised: 6,
 worried: 7,
 stressed: 8,
 exhausted: 9,
 playful: 10,
 alert: 11,
 charging: 12,
 thinking: 13
};

export function classifyTransport(info: { path: string; pnpId?: string; manufacturer?: string }): DeviceTransport {
 const haystack = `${info.path} ${info.pnpId ?? ''} ${info.manufacturer ?? ''}`.toLowerCase();
 if (/bthenum|bluetooth|rfcomm|\/dev\/rfcomm|\/dev\/tty\.[\w-]*bluetooth/.test(haystack)) return 'bluetooth';
 if (/usb|ttyusb|ttyacm|acm|ch340|cp210|ftdi|silabs|wch|\/dev\/cu\.|\/dev\/tty\.usb/.test(haystack)) return 'usb';
 return 'unknown';
}

export class DeviceLink {
 private port: SerialPort | null = null;
 private parser: ReadlineParser | null = null;
 private readyTimer: ReturnType<typeof setTimeout> | undefined;
 private state: DeviceState = {
  status: 'disconnected', port: null, transport: 'unknown', baud: BAUD,
  handshake: false, lastRx: null, lastError: null, ports: [], log: []
 };
 // Remember the last value pushed so we avoid spamming the slow 9600-baud link.
 private lastSent = new Map<string, string>();

 constructor(private onChange: (state: DeviceState) => void) {}

 getState(): DeviceState { return { ...this.state, ports: [...this.state.ports], log: [...this.state.log] }; }

 private emit() { this.onChange(this.getState()); }

 private log(direction: DeviceLogEntry['direction'], line: string) {
  const entry: DeviceLogEntry = { id: randomUUID(), at: Date.now(), direction, line };
  this.state.log = [...this.state.log.slice(-(MAX_LOG - 1)), entry];
 }

 async listPorts(): Promise<SerialPortInfo[]> {
  this.state.status = this.port ? this.state.status : 'scanning';
  this.emit();
  let raw: Awaited<ReturnType<typeof SerialPort.list>> = [];
  try { raw = await SerialPort.list(); }
  catch (error) { this.state.lastError = error instanceof Error ? error.message : String(error); }
  let ports: SerialPortInfo[] = raw.map(p => ({
   path: p.path,
   manufacturer: p.manufacturer ?? null,
   serialNumber: p.serialNumber ?? null,
   pnpId: p.pnpId ?? null,
   friendlyName: (p as { friendlyName?: string }).friendlyName ?? null,
   transport: classifyTransport({ path: p.path, pnpId: p.pnpId, manufacturer: p.manufacturer })
  }));

  // On Linux, Bluetooth SPP shows up as /dev/rfcommN created by an rfcomm bind.
  // SerialPort.list() enumerates udev tty devices and usually does NOT include
  // rfcomm nodes, so probe for them explicitly and add any that exist.
  if (process.platform === 'linux') {
   try {
    const fs = await import('node:fs');
    const existing = new Set(ports.map(p => p.path));
    for (const entry of fs.readdirSync('/dev')) {
     if (/^rfcomm\d+$/.test(entry)) {
      const path = `/dev/${entry}`;
      if (!existing.has(path)) {
       ports.push({ path, manufacturer: 'Bluetooth SPP', serialNumber: null, pnpId: null, friendlyName: 'Bluetooth serial (rfcomm)', transport: 'bluetooth' });
      }
     }
    }
   } catch { /* /dev not readable - ignore */ }
   // Hide the noisy built-in motherboard UARTs (/dev/ttyS0..N) that are never
   // the device and only fail with "permission denied" when clicked.
   ports = ports.filter(p => !/^\/dev\/ttyS\d+$/.test(p.path));
  }

  // Surface the likely device first: Bluetooth, then USB, then the rest.
  const rank = (t: SerialPortInfo['transport']) => t === 'bluetooth' ? 0 : t === 'usb' ? 1 : 2;
  ports.sort((a, b) => rank(a.transport) - rank(b.transport) || a.path.localeCompare(b.path));

  this.state.ports = ports;
  if (!this.port) this.state.status = 'disconnected';
  this.emit();
  return ports;
 }

 /** Pick the best candidate port: prefer Bluetooth, then USB, then anything. */
 bestPort(ports: SerialPortInfo[]): SerialPortInfo | null {
  return ports.find(p => p.transport === 'bluetooth')
   ?? ports.find(p => p.transport === 'usb')
   ?? ports[0]
   ?? null;
 }

 async connect(path: string): Promise<void> {
  await this.disconnect();
  const transport = this.state.ports.find(p => p.path === path)?.transport ?? 'unknown';
  this.state.status = 'connecting';
  this.state.port = path;
  this.state.transport = transport;
  this.state.handshake = false;
  this.state.lastError = null;
  this.lastSent.clear();
  this.log('info', `Opening ${path} @ ${BAUD} baud`);
  this.emit();

  await new Promise<void>((resolve, reject) => {
   // Bluetooth SPP ports are fragile: when the OS virtual serial port is opened
   // with DTR/RTS asserted (the serialport default) many stacks tear the RFCOMM
   // channel straight back down -> "connect then instantly disconnect". We open
   // with hardware flow control off, then immediately clear DTR & RTS so no
   // control-line toggle reaches the link.
   const port = new SerialPort({ path, baudRate: BAUD, autoOpen: false, rtscts: false, xon: false, xoff: false });
   port.open(err => {
    if (err) {
     this.state.status = 'disconnected';
     this.state.port = null;
     this.state.lastError = err.message;
     this.log('info', `Open failed: ${err.message}`);
     this.emit();
     reject(err);
     return;
    }
    this.port = port;
    // Clear control lines so Bluetooth SPP does not drop the connection.
    port.set({ dtr: false, rts: false }, () => { /* best-effort; some SPP ports reject set() */ });
    this.parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    this.parser.on('data', (line: string) => this.handleLine(line));
    port.on('close', () => this.handleClose());
    port.on('error', e => { this.state.lastError = e.message; this.log('info', `Error: ${e.message}`); this.emit(); });
    this.state.status = 'connected';
    this.log('info', 'Port open - waiting for READY handshake');
    this.emit();
    // If the board was already running before we opened, it won't re-print
    // READY. After a grace period mark the link usable regardless.
    this.readyTimer = setTimeout(() => {
     if (!this.state.handshake) this.log('info', 'No READY handshake (device may already be running - press reset to re-handshake)');
     this.emit();
    }, READY_TIMEOUT);
    resolve();
   });
  });
 }

 private handleLine(raw: string) {
  const line = raw.replace(/[\r\n]+$/, '');
  if (!line) return;
  this.state.lastRx = Date.now();
  this.log('rx', line);
  if (line.includes('READY')) {
   this.state.handshake = true;
   clearTimeout(this.readyTimer);
  }
  this.emit();
 }

 private handleClose() {
  clearTimeout(this.readyTimer);
  this.parser = null;
  this.port = null;
  this.state.status = 'disconnected';
  this.state.handshake = false;
  this.log('info', 'Port closed');
  this.emit();
 }

 async disconnect(): Promise<void> {
  clearTimeout(this.readyTimer);
  const port = this.port;
  if (!port) return;
  await new Promise<void>(resolve => { port.close(() => resolve()); });
  // handleClose() runs via the 'close' event; ensure state is settled.
  this.port = null;
  this.parser = null;
 }

 get connected(): boolean { return !!this.port && this.state.status === 'connected'; }

 private writeLine(line: string): boolean {
  if (!this.port || !this.port.writable) return false;
  this.port.write(line + '\n');
  this.log('tx', line);
  this.emit();
  return true;
 }

 /** Raw command (used by the Device tab test buttons). */
 send(line: string): boolean { return this.writeLine(line); }

 /** De-duplicated send keyed by a channel, to spare the 9600-baud link. */
 private sendIfChanged(key: string, line: string) {
  if (this.lastSent.get(key) === line) return;
  if (this.writeLine(line)) this.lastSent.set(key, line);
 }

 setBluetoothIcon(up: boolean) { this.sendIfChanged('bt', up ? 'BT1' : 'BT0'); }
 setBattery(percent: number, charging: boolean) { this.sendIfChanged('bat', `B${Math.round(percent)},${charging ? 1 : 0}`); }
 setRain(raining: boolean) { this.sendIfChanged('rain', raining ? 'R1' : 'R0'); }
 setEmotion(expression: Expression) { this.sendIfChanged('emotion', `E${EXPRESSION_TO_EMOTION[expression]}`); }
 setWeather(mode: 'sunny' | 'monsoon') { this.sendIfChanged('weather', mode === 'sunny' ? 'W1' : 'W2'); }
 /** Custom OLED face geometry: FG<eyeW>,<eyeH>,<radius>,<gap>,<mouth>. */
 setFace(eyeW: number, eyeH: number, radius: number, gap: number, mouth: number) {
  this.sendIfChanged('face', `FG${Math.round(eyeW)},${Math.round(eyeH)},${Math.round(radius)},${Math.round(gap)},${Math.round(mouth)}`);
 }

 /** Alerts always go through (they are event-driven, not state). */
 alert(text: string) { this.writeLine('A' + text.slice(0, 100)); }
 dashboard(text: string) { this.writeLine('D' + text.slice(0, 100)); }

 clearLog() { this.state.log = []; this.emit(); }
}
