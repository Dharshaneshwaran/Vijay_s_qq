import { useState } from 'react';
import { Bluetooth, Usb, RefreshCw, Plug, PlugZap, Send, Trash2, Cpu, Radio } from 'lucide-react';
import type { DeviceState, DeviceTransport } from '../types/electron';

const statusLabel: Record<DeviceState['status'], string> = {
 disconnected: 'Disconnected', scanning: 'Scanning...', connecting: 'Connecting...', connected: 'Connected'
};

function TransportIcon({ t }: { t: DeviceTransport }) {
 if (t === 'bluetooth') return <Bluetooth size={14}/>;
 if (t === 'usb') return <Usb size={14}/>;
 return <Radio size={14}/>;
}

// Firmware expression indices (E0-E13) for the quick-test buttons - matches
// the desktop EXPRESSIONS order exactly.
const EMOTIONS = ['idle','happy','curious','sleepy','focused','excited','surprised','worried','stressed','exhausted','playful','alert','charging','thinking'];

export default function DevicePanel({ device }: { device: DeviceState | null }) {
 const [custom, setCustom] = useState('');
 const [busy, setBusy] = useState(false);

 const d = device;
 const connected = d?.status === 'connected';

 const list = async () => { setBusy(true); try { await window.qbit?.listPorts(); } finally { setBusy(false); } };
 const connect = async (path: string) => { setBusy(true); try { await window.qbit?.connectDevice(path); } finally { setBusy(false); } };
 const disconnect = async () => { setBusy(true); try { await window.qbit?.disconnectDevice(); } finally { setBusy(false); } };
 const send = (line: string) => { void window.qbit?.sendDevice(line); };
 // Send the current time (and short date) to the OLED: T<HH:MM|Sun 25 Oct>
 const sendTime = () => {
  const now = new Date();
  const hhmm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  send(`T${hhmm}|${date}`);
 };

 return <div className="device-grid">
  <article className={`card device-status ${connected ? 'online' : 'offline'}`}>
   <div className="device-head">
    <span className="eyebrow"><Cpu size={13}/> ESP32-CAM SMART HUB</span>
    <span className={`device-badge ${d?.status ?? 'disconnected'}`}><span className="status-dot"/>{statusLabel[d?.status ?? 'disconnected']}</span>
   </div>
   <dl className="device-facts">
    <div><dt>Port</dt><dd>{d?.port ?? '-'}</dd></div>
    <div><dt>Transport</dt><dd className="with-icon">{d ? <TransportIcon t={d.transport}/> : null} {d?.transport === 'bluetooth' ? 'Bluetooth SPP' : d?.transport === 'usb' ? 'USB serial' : d?.port ? 'Unknown' : '-'}</dd></div>
    <div><dt>Baud</dt><dd>{d?.baud ?? 9600}</dd></div>
    <div><dt>Handshake</dt><dd>{connected ? (d?.handshake ? 'READY received' : 'No READY yet') : '-'}</dd></div>
    <div><dt>Last RX</dt><dd>{d?.lastRx ? new Date(d.lastRx).toLocaleTimeString() : '-'}</dd></div>
   </dl>
   {d?.lastError && <p role="alert" className="error">{d.lastError}</p>}
   <div className="device-actions">
    <button onClick={() => void list()} disabled={busy}><RefreshCw size={14}/> Scan ports</button>
    {connected
     ? <button className="primary" onClick={() => void disconnect()} disabled={busy}><PlugZap size={14}/> Disconnect</button>
     : <span className="muted-note">Pair the ESP32-CAM in your OS Bluetooth settings first, then pick its serial port below.</span>}
   </div>
  </article>

  <article className="card device-ports">
   <h3>Available ports</h3>
   {!d?.ports.length ? <p className="muted-note">No serial ports found. Pair the device over Bluetooth (it exposes an SPP serial port), then press Scan.</p>
    : <div className="port-list">{d.ports.map(p => <div className={`port-row${d.port === p.path ? ' active' : ''}`} key={p.path}>
      <TransportIcon t={p.transport}/>
      <div className="port-info"><strong>{p.path}</strong><small>{p.friendlyName || p.manufacturer || p.pnpId || p.transport}</small></div>
      <button className="primary" onClick={() => void connect(p.path)} disabled={busy || d.port === p.path && connected}><Plug size={13}/> {d.port === p.path && connected ? 'Linked' : 'Connect'}</button>
     </div>)}</div>}
  </article>

  <article className="card device-commands">
   <h3>Quick commands</h3>
   <p className="muted-note">These write directly to the OLED firmware protocol (9600 baud).</p>
   <div className="cmd-group"><span>Expressions (E0-E13)</span><div className="cmd-buttons">{EMOTIONS.map((name, i) => <button key={i} onClick={() => send(`E${i}`)} disabled={!connected}>{name}</button>)}</div></div>
   <div className="cmd-group"><span>Weather & rain</span><div className="cmd-buttons">
    <button onClick={() => send('W1')} disabled={!connected}>Sunny (W1)</button>
    <button onClick={() => send('W2')} disabled={!connected}>Monsoon (W2)</button>
    <button onClick={() => send('R1')} disabled={!connected}>Rain on (R1)</button>
    <button onClick={() => send('R0')} disabled={!connected}>Rain off (R0)</button>
   </div></div>
   <div className="cmd-group"><span>Other</span><div className="cmd-buttons">
    <button onClick={sendTime} disabled={!connected}>Show time</button>
    <button onClick={() => send('BT1')} disabled={!connected}>BT icon on</button>
    <button onClick={() => send('BT0')} disabled={!connected}>BT icon off</button>
    <button onClick={() => send('A Hello from QBIT')} disabled={!connected}>Test alert</button>
    <button onClick={() => send('P')} disabled={!connected}>Run demo (P)</button>
   </div></div>
   <div className="cmd-custom">
    <input placeholder="Raw line e.g. D Build passed" maxLength={120} value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { send(custom.trim()); setCustom(''); } }}/>
    <button className="primary" disabled={!connected || !custom.trim()} onClick={() => { send(custom.trim()); setCustom(''); }}><Send size={14}/> Send</button>
   </div>
  </article>

  <article className="card device-log">
   <div className="log-head"><h3>Link log</h3><button className="icon-button" aria-label="Clear log" onClick={() => void window.qbit?.clearDeviceLog()}><Trash2 size={14}/></button></div>
   <div className="log-lines">
    {!d?.log.length ? <p className="muted-note">No traffic yet.</p> : [...d.log].reverse().map(e => <div className={`log-line ${e.direction}`} key={e.id}>
     <span className="log-time">{new Date(e.at).toLocaleTimeString()}</span>
     <span className="log-dir">{e.direction === 'tx' ? '>>' : e.direction === 'rx' ? '<<' : '--'}</span>
     <span className="log-text">{e.line}</span>
    </div>)}
   </div>
  </article>
 </div>;
}
