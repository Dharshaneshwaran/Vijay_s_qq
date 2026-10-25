import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Play, Pause, RotateCcw, AlarmClock, Timer as TimerIcon, Coffee } from 'lucide-react';
import type { Alarm, Settings } from '../types/electron';

const DAY_LABELS = ['S','M','T','W','T','F','S'];
const pad = (n: number) => String(n).padStart(2, '0');
const minutesToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const hhmmToMinutes = (v: string) => { const [h, m] = v.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

function Clock() {
 const [now, setNow] = useState(new Date());
 useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
 return <article className="card time-clock">
  <span className="eyebrow">LOCAL TIME</span>
  <div className="big-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
  <p>{now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
 </article>;
}

function Calendar() {
 const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
 const today = new Date();
 const first = new Date(cursor.y, cursor.m, 1);
 const startDay = first.getDay();
 const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
 const cells: (number | null)[] = [];
 for (let i = 0; i < startDay; i++) cells.push(null);
 for (let d = 1; d <= daysInMonth; d++) cells.push(d);
 const monthName = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
 const shift = (delta: number) => setCursor(c => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
 const isToday = (d: number) => d === today.getDate() && cursor.m === today.getMonth() && cursor.y === today.getFullYear();
 return <article className="card calendar">
  <div className="cal-head"><button onClick={() => shift(-1)} aria-label="Previous month">&lsaquo;</button><strong>{monthName}</strong><button onClick={() => shift(1)} aria-label="Next month">&rsaquo;</button></div>
  <div className="cal-grid">{DAY_LABELS.map((d, i) => <span className="cal-dow" key={i}>{d}</span>)}{cells.map((d, i) => <span key={i} className={`cal-cell${d && isToday(d) ? ' today' : ''}${d ? '' : ' empty'}`}>{d ?? ''}</span>)}</div>
 </article>;
}

function Alarms({ alarms }: { alarms: Alarm[] }) {
 const [time, setTime] = useState('07:00');
 const [label, setLabel] = useState('');
 const [days, setDays] = useState<number[]>([]);
 const toggleDay = (d: number) => setDays(cur => cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort());
 const add = async () => { await window.qbit?.addAlarm({ label: label.trim(), time: hhmmToMinutes(time), days }); setLabel(''); setDays([]); };
 return <article className="card alarms">
  <h3><AlarmClock size={16}/> Alarms</h3>
  <div className="alarm-form">
   <input aria-label="Alarm time" type="time" value={time} onChange={e => setTime(e.target.value)}/>
   <input aria-label="Alarm label" placeholder="Label (optional)" maxLength={60} value={label} onChange={e => setLabel(e.target.value)}/>
   <div className="day-picker">{DAY_LABELS.map((d, i) => <button key={i} className={days.includes(i) ? 'on' : ''} type="button" onClick={() => toggleDay(i)} title={`Repeat ${d}`}>{d}</button>)}</div>
   <button className="primary" type="button" onClick={add}><Plus size={14}/> Add</button>
  </div>
  <div className="alarm-list">
   {alarms.length === 0 ? <p className="muted-note">No alarms set. One-shot alarms disable themselves after ringing.</p> : [...alarms].sort((a, b) => a.time - b.time).map(a => <div className={`alarm-row${a.enabled ? '' : ' off'}`} key={a.id}>
    <strong>{minutesToHHMM(a.time)}</strong>
    <span className="alarm-meta">{a.label || 'Alarm'}<br/><small>{a.days.length ? a.days.map(d => DAY_LABELS[d]).join(' ') : 'Once'}</small></span>
    <label className="switch"><input type="checkbox" checked={a.enabled} onChange={e => void window.qbit?.updateAlarm({ id: a.id, enabled: e.target.checked })}/></label>
    <button className="icon-button" aria-label="Delete alarm" onClick={() => void window.qbit?.deleteAlarm(a.id)}><Trash2 size={15}/></button>
   </div>)}
  </div>
 </article>;
}

function Countdown({ sound }: { sound: (s: 'click'|'happy'|'chime'|'alarm') => void }) {
 const [remaining, setRemaining] = useState(5 * 60);
 const [running, setRunning] = useState(false);
 const ref = useRef<ReturnType<typeof setInterval>>(undefined);
 useEffect(() => {
  if (!running) { clearInterval(ref.current); return; }
  ref.current = setInterval(() => setRemaining(r => { if (r <= 1) { setRunning(false); sound('alarm'); return 0; } return r - 1; }), 1000);
  return () => clearInterval(ref.current);
 }, [running, sound]);
 const preset = (s: number) => { setRunning(false); setRemaining(s); };
 const mm = Math.floor(remaining / 60), ss = remaining % 60;
 return <article className="card timer">
  <h3><TimerIcon size={16}/> Timer</h3>
  <div className="timer-face">{pad(mm)}:{pad(ss)}</div>
  <div className="timer-presets">{[1,5,10,25].map(m => <button key={m} onClick={() => preset(m * 60)}>{m}m</button>)}</div>
  <div className="timer-controls">
   <button className="primary" onClick={() => setRunning(r => !r)} disabled={remaining === 0}>{running ? <><Pause size={14}/> Pause</> : <><Play size={14}/> Start</>}</button>
   <button onClick={() => preset(5 * 60)}><RotateCcw size={14}/> Reset</button>
  </div>
 </article>;
}

function Pomodoro({ settings, sound }: { settings: Settings; sound: (s: 'click'|'happy'|'chime'|'alarm') => void }) {
 const workSecs = settings.pomodoroWork * 60, breakSecs = settings.pomodoroBreak * 60;
 const [phase, setPhase] = useState<'work' | 'break'>('work');
 const [remaining, setRemaining] = useState(workSecs);
 const [running, setRunning] = useState(false);
 const [cycles, setCycles] = useState(0);
 const ref = useRef<ReturnType<typeof setInterval>>(undefined);
 // Reset when phase durations change and the timer is idle.
 useEffect(() => { if (!running) setRemaining(phase === 'work' ? workSecs : breakSecs); }, [workSecs, breakSecs, phase, running]);
 useEffect(() => {
  if (!running) { clearInterval(ref.current); return; }
  ref.current = setInterval(() => setRemaining(r => {
   if (r > 1) return r - 1;
   sound('chime');
   if (phase === 'work') { setCycles(c => c + 1); setPhase('break'); return breakSecs; }
   setPhase('work'); return workSecs;
  }), 1000);
  return () => clearInterval(ref.current);
 }, [running, phase, workSecs, breakSecs, sound]);
 const mm = Math.floor(remaining / 60), ss = remaining % 60;
 const reset = () => { setRunning(false); setPhase('work'); setRemaining(workSecs); setCycles(0); };
 return <article className={`card pomodoro ${phase}`}>
  <h3><Coffee size={16}/> Pomodoro</h3>
  <span className="pomo-phase">{phase === 'work' ? 'Focus' : 'Break'} - {cycles} completed</span>
  <div className="timer-face">{pad(mm)}:{pad(ss)}</div>
  <div className="timer-controls">
   <button className="primary" onClick={() => setRunning(r => !r)}>{running ? <><Pause size={14}/> Pause</> : <><Play size={14}/> Start</>}</button>
   <button onClick={reset}><RotateCcw size={14}/> Reset</button>
  </div>
 </article>;
}

export default function TimeFocus({ alarms, settings, sound }: { alarms: Alarm[]; settings: Settings; sound: (s: 'click'|'happy'|'chime'|'alarm') => void }) {
 const memoAlarms = useMemo(() => alarms, [alarms]);
 return <div className="timefocus-grid">
  <Clock/>
  <Calendar/>
  <Alarms alarms={memoAlarms}/>
  <Countdown sound={sound}/>
  <Pomodoro settings={settings} sound={sound}/>
 </div>;
}
