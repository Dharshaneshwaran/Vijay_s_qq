import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../../electron/types';
import type { Expression, State, Stats, DeviceState } from '../types/electron';

const initial: State = { reminders: [], alarms: [], settings: DEFAULT_SETTINGS };

export function useQbit() {
 const [state, setState] = useState(initial);
 const [stats, setStats] = useState<Stats | null>(null);
 const [expression, setExpression] = useState<Expression>('idle');
 const [notice, setNotice] = useState('');
 const [error, setError] = useState('');
 const [visible, setVisible] = useState(true);
 const [device, setDevice] = useState<DeviceState | null>(null);

 const settings = useRef(state.settings);
 const audio = useRef<AudioContext | null>(null);
 const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 settings.current = state.settings;

 const sound = useCallback((kind: 'click'|'happy'|'chime'|'alarm') => {
  if (settings.current.muted || settings.current.volume === 0) return;
  try {
   const ctx = audio.current ??= new AudioContext(); void ctx.resume();
   const notes = kind === 'alarm' ? [660,880,660,880] : kind === 'happy' ? [523,659,784] : kind === 'chime' ? [659,988] : [440];
   notes.forEach((hz,i) => { const osc = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + i*.13; osc.type = 'sine'; osc.frequency.value = hz; gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(settings.current.volume*.2,start+.01); gain.gain.exponentialRampToValueAtTime(.001,start+.22); osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start+.24); });
  } catch { /* Sound may be unavailable on remote desktops. */ }
 }, []);

 useEffect(() => {
  const api = window.qbit; if (!api) return;
  let live = true, stateEvent = false, expressionEvent = false, statsEvent = false, visibilityEvent = false, deviceEvent = false;
  const showNotice = (text: string) => { setNotice(text); clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(''), 12000); if (location.hash === '#widget') sound('alarm'); };
  const off = [
   api.onState(s => { stateEvent = true; settings.current = s.settings; setState(s); }),
   api.onStats(s => { statsEvent = true; setStats(s); }),
   api.onExpression(e => { expressionEvent = true; setExpression(e); }),
   api.onVisibility(v => { visibilityEvent = true; setVisible(v); }),
   api.onDevice(d => { deviceEvent = true; setDevice(d); }),
   api.onReminder(r => showNotice(r.text)),
   api.onAlarm(a => showNotice(a.label || 'Alarm'))
  ];
  void api.getState().then(s => { if (live && !stateEvent) { settings.current = s.settings; setState(s); } }).catch(e => { if (live) setError(String(e)); });
  void api.getStats().then(s => { if (live && !statsEvent) setStats(s); }).catch(() => {});
  void api.getDevice().then(d => { if (live && !deviceEvent) setDevice(d); }).catch(() => {});
  void api.getRuntime().then(r => { if (live) { if (!expressionEvent) setExpression(r.expression); if (!visibilityEvent) setVisible(r.visible); } }).catch(() => {});
  return () => { live = false; off.forEach(fn => fn()); clearTimeout(timer.current); };
 }, [sound]);

 const run = async (action: () => Promise<unknown> | undefined) => { setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
 const react = () => { void run(() => window.qbit?.interact()); };

 return { state, stats, expression, notice, error, sound, react, run, visible, device };
}
