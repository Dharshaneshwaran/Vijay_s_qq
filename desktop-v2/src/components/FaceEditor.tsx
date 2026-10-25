import { RotateCcw, Send, Smile } from 'lucide-react';
import type { Settings } from '../types/electron';

const MOUTHS = ['None', 'Smile', 'Flat', 'Open'];

// Live SVG preview that mirrors the firmware's drawFace() geometry on a
// 128x64 OLED canvas. Eyes are rounded rects centred around x=64.
function Preview({ eyeW, eyeH, radius, gap, mouth }: { eyeW: number; eyeH: number; radius: number; gap: number; mouth: number }) {
 const cx = 64, clx = cx - gap / 2, crx = cx + gap / 2, ey = 32, my = 52;
 const eye = (x: number) => <rect x={x - eyeW / 2} y={ey - eyeH / 2} width={eyeW} height={eyeH} rx={radius} ry={radius} fill="#71dbd7"/>;
 let mouthEl = null;
 if (mouth === 1) mouthEl = <path d={`M54 ${my} L58 ${my + 4} L70 ${my + 4} L74 ${my}`} stroke="#71dbd7" strokeWidth={2} fill="none" strokeLinecap="round"/>;
 else if (mouth === 2) mouthEl = <line x1={54} y1={my + 2} x2={74} y2={my + 2} stroke="#71dbd7" strokeWidth={2} strokeLinecap="round"/>;
 else if (mouth === 3) mouthEl = <circle cx={64} cy={my + 1} r={5} stroke="#71dbd7" strokeWidth={2} fill="none"/>;
 return <div className="face-preview">
  <svg viewBox="0 0 128 64" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Live OLED face preview">
   <rect x={0} y={0} width={128} height={64} rx={6} fill="#0b1016"/>
   <text x={2} y={10} fontSize={8} fill="#8aa0a6" fontFamily="monospace">100%</text>
   {eye(clx)}{eye(crx)}{mouthEl}
  </svg>
  <span className="preview-caption">Live preview - matches the OLED (128x64)</span>
 </div>;
}

export default function FaceEditor({ settings, update, connected }: { settings: Settings; update: (s: Partial<Settings>) => void; connected: boolean }) {
 const g = { eyeW: settings.faceEyeW, eyeH: settings.faceEyeH, radius: settings.faceRadius, gap: settings.faceGap, mouth: settings.faceMouth };

 const reset = () => update({ faceEyeW: 26, faceEyeH: 36, faceRadius: 12, faceGap: 48, faceMouth: 1 });
 // Settings changes are auto-pushed to the device by main.ts; this button is an
 // explicit re-send for convenience / after reconnect.
 const sendNow = () => update({ faceEyeW: g.eyeW });

 const sliders: [keyof Settings, string, number, number, number][] = [
  ['faceEyeW', 'Eye width', 8, 50, g.eyeW],
  ['faceEyeH', 'Eye height', 6, 50, g.eyeH],
  ['faceRadius', 'Eye roundness', 0, 20, g.radius],
  ['faceGap', 'Eye spacing', 30, 90, g.gap]
 ];

 return <div className="face-editor-grid">
  <article className="card face-preview-card">
   <h3><Smile size={16}/> Face editor</h3>
   <p className="muted-note">Shape QBIT's resting face. Changes apply to the idle / happy / charging look and push to the OLED live{connected ? '' : ' once the device is connected'}.</p>
   <Preview {...g}/>
  </article>

  <article className="card face-controls-card">
   <h3>Geometry</h3>
   {sliders.map(([key, label, min, max, val]) => <label className="face-row" key={key}>
    <div className="face-row-head"><strong>{label}</strong><span>{val} px</span></div>
    <input type="range" min={min} max={max} step={1} value={val} onChange={e => update({ [key]: Number(e.target.value) } as Partial<Settings>)}/>
   </label>)}
   <label className="face-row">
    <div className="face-row-head"><strong>Mouth</strong><span>{MOUTHS[g.mouth]}</span></div>
    <div className="mouth-picker">{MOUTHS.map((m, i) => <button key={m} className={g.mouth === i ? 'on' : ''} onClick={() => update({ faceMouth: i })}>{m}</button>)}</div>
   </label>
   <div className="face-actions">
    <button className="primary" onClick={sendNow} disabled={!connected} title={connected ? 'Re-send to device' : 'Connect the device first'}><Send size={14}/> Send to device</button>
    <button onClick={reset}><RotateCcw size={14}/> Reset</button>
   </div>
   {!connected && <p className="muted-note">Device offline - your design is saved and will apply automatically on reconnect.</p>}
  </article>
 </div>;
}
