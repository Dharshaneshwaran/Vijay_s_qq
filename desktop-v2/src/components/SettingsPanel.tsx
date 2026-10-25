import type { Settings, Stats } from '../types/electron';
import { EXPRESSIONS } from '../../electron/types';
export default function SettingsPanel({settings,update,sound,stats,visible,toggle,reset}:{settings:Settings;update:(s:Partial<Settings>)=>void;sound:(s:'click'|'happy'|'chime'|'alarm')=>void;stats:Stats|null;visible:boolean;toggle:()=>void;reset:()=>void}) {
 const switches = [
  ['Sound effects','Little beeps for little moments.',!settings.muted,(value:boolean)=>update({muted:!value})],
  ['Always on top','Keep your companion in view.',settings.alwaysOnTop,(value:boolean)=>update({alwaysOnTop:value})],
  ['Adaptive expressions','Respond to real laptop activity.',settings.adaptiveExpressions,(value:boolean)=>update({adaptiveExpressions:value})],
  ['Cursor tracking','Follow your cursor across the desktop.',settings.cursorTracking,(value:boolean)=>update({cursorTracking:value})],
  ['Tray animation','A gentle blink near the clock.',settings.trayAnimation,(value:boolean)=>update({trayAnimation:value})],
  ['Pause animations','Keep faces still without pausing reminders.',settings.animationsPaused,(value:boolean)=>update({animationsPaused:value})],
  ['Auto-connect device','Reconnect to the ESP32-CAM on startup.',settings.deviceAutoConnect,(value:boolean)=>update({deviceAutoConnect:value})],
  ['Send moods to device','Mirror QBIT\u2019s mood on the OLED.',settings.sendMoodsToDevice,(value:boolean)=>update({sendMoodsToDevice:value})],
  ['Send weather to device','Push sunny / monsoon + rain to the OLED.',settings.sendWeatherToDevice,(value:boolean)=>update({sendWeatherToDevice:value})]
 ] as const;
 return <article className="card settings"><h3>Make yourself at home</h3>
  {switches.map(([title,description,value,onChange])=><label className="setting-row" key={title}><div><strong>{title}</strong><p>{description}</p></div><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>)}
  <label className="setting-row"><strong>Volume</strong><input type="range" min="0" max="1" step=".05" value={settings.volume} onChange={e=>update({volume:Number(e.target.value)})}/></label>
  <label className="setting-row"><strong>Expression intensity</strong><input type="range" min=".3" max="1.5" step=".1" value={settings.expressionIntensity} onChange={e=>update({expressionIntensity:Number(e.target.value)})}/></label>
  <label className="setting-row"><strong>Widget size - {Math.round(settings.widgetSize)} px</strong><input type="range" min="180" max="280" step="10" value={settings.widgetSize} onChange={e=>update({widgetSize:Number(e.target.value)})}/></label>
  <label className="setting-row"><strong>Pomodoro focus - {settings.pomodoroWork} min</strong><input type="range" min="5" max="60" step="5" value={settings.pomodoroWork} onChange={e=>update({pomodoroWork:Number(e.target.value)})}/></label>
  <label className="setting-row"><strong>Pomodoro break - {settings.pomodoroBreak} min</strong><input type="range" min="1" max="30" step="1" value={settings.pomodoroBreak} onChange={e=>update({pomodoroBreak:Number(e.target.value)})}/></label>
  <label className="setting-row"><div><strong>Resting expression</strong><p>Used when adaptive expressions are off.</p></div><select value={settings.expression} onChange={e=>update({expression:e.target.value as Settings['expression']})}>{EXPRESSIONS.map(x=><option key={x}>{x}</option>)}</select></label>
  <label className="setting-row"><strong>GPU for activity</strong><select value={settings.preferredGpu} onChange={e=>update({preferredGpu:e.target.value})}><option value="">Automatic (busiest GPU)</option>{stats?.gpus?.map(g=><option key={g.id} value={g.id}>{g.model}</option>)}{settings.preferredGpu&&!stats?.gpus.some(g=>g.id===settings.preferredGpu)&&<option value={settings.preferredGpu}>Selected GPU unavailable</option>}</select></label>
  <div className="sound-tests"><button onClick={toggle}>{visible?'Hide QBIT':'Show QBIT'}</button><button onClick={reset}>Reset widget position</button>{(['click','happy','chime','alarm'] as const).map(s=><button key={s} onClick={()=>sound(s)}>Test {s}</button>)}</div>
 </article>;
}
