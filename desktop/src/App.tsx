import { useEffect, useState } from 'react';
import { LayoutDashboard, Bell, SlidersHorizontal, Activity, ArrowUpRight, Volume2, VolumeX, Sparkles, Minus } from 'lucide-react';
import QbitFace from './components/QbitFace';
import ReminderForm from './components/ReminderForm';
import ReminderList from './components/ReminderList';
import SystemStats from './components/SystemStats';
import SettingsPanel from './components/SettingsPanel';
import { useQbit } from './hooks/useQbit';
const tabs = [{ name: 'Overview', icon: LayoutDashboard }, { name: 'Reminders', icon: Bell }, { name: 'System', icon: Activity }, { name: 'Settings', icon: SlidersHorizontal }];
export default function App() {
 const q = useQbit(), [tab, setTab] = useState('Overview'), [clock, setClock] = useState(new Date());
 const widget = location.hash === '#widget';
 useEffect(() => { document.documentElement.classList.toggle('widget-mode', widget); document.body.classList.toggle('widget-mode', widget); const id = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(id); }, [widget]);
 const play = () => { q.react(); q.sound('happy'); };
 const update = (patch: Parameters<NonNullable<Window['qbit']>['setSettings']>[0]) => { void q.run(() => window.qbit?.setSettings(patch)); };
 const list = <ReminderList reminders={q.state.reminders} remove={id => { void q.run(() => window.qbit?.deleteReminder(id)); }}/>;
 if (widget) return <div className="widget" style={{'--widget-scale':q.state.settings.widgetSize/180} as import('react').CSSProperties}><button className="widget-minimize" aria-label="Minimize QBIT" title="Minimize QBIT" onClick={() => void q.run(() => window.qbit?.minimizeWidget())}><Minus size={13}/></button><div className="drag-handle" title="Drag to move QBIT"><span/><span/><span/></div><QbitFace expression={q.expression} onClick={play} intensity={q.state.settings.expressionIntensity} cursorTracking={q.state.settings.cursorTracking} paused={q.state.settings.animationsPaused || (widget && !q.visible)}/>{q.notice ? <p className="widget-notice" role="alert">{q.notice}</p> : <button className="widget-open" onClick={() => void window.qbit?.openDashboard()}>Open QBIT <ArrowUpRight size={12}/></button>}</div>;
 return <div className="shell"><aside><div className="brand"><span className="brand-icon">q</span>QBIT<span className="version">desktop</span></div><p className="sidebar-label">YOUR LITTLE COMPANION</p><nav>{tabs.map(({name, icon: Icon}) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => {setTab(name); q.sound('click');}}><Icon size={18}/>{name}{name === 'Reminders' && <span className="count">{q.state.reminders.filter(r => !r.completed).length}</span>}</button>)}</nav><div className="sidebar-bottom"><span className="status-dot"/> {window.qbit ? 'Happily running' : 'Browser preview'}<p>A little company. A little focus.</p></div></aside><main><header><div><span className="eyebrow">A LITTLE SPACE FOR YOU & QBIT</span><h1>{tab === 'Overview' ? 'Hello, human.' : tab}</h1><p>{tab === 'Overview' ? 'Your day, with a little more company.' : tab === 'Reminders' ? 'The little things, remembered.' : tab === 'System' ? 'A quiet look under the hood.' : 'Small touches that feel like you.'}</p></div><div className="clock"><strong>{clock.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong><span>{clock.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})}</span></div></header>{!window.qbit && <div className="banner">Design preview - Launch with Electron to save reminders and view system metrics.</div>}{q.error && <div className="banner error" role="alert">{q.error}</div>}{q.notice && <div className="banner" role="alert"><Bell size={18}/>{q.notice}</div>}
 {tab === 'Overview' && <><section className="hero card"><div><span className="pill"><span className="status-dot"/> HERE TO KEEP YOU COMPANY</span><h2>Small friend.<br/>Softer workdays.</h2><p>I will keep an eye on the time.<br/>You take care of the good stuff.</p><button className="primary" onClick={() => setTab('Reminders')}>Set a reminder <ArrowUpRight size={16}/></button></div><div className="hero-pet"><QbitFace expression={q.expression} onClick={play} intensity={q.state.settings.expressionIntensity} cursorTracking={q.state.settings.cursorTracking} paused={q.state.settings.animationsPaused || (widget && !q.visible)}/><span>Give me a little tap <Sparkles size={12}/></span></div></section><div className="section-title"><h3>On your horizon</h3><button onClick={() => setTab('Reminders')}>View all <ArrowUpRight size={14}/></button></div><section className="card compact">{list}</section><div className="mini-footer"><span><span className="status-dot"/> QBIT is feeling {q.expression}</span><button onClick={() => update({muted: !q.state.settings.muted})}>{q.state.settings.muted ? <VolumeX size={16}/> : <Volume2 size={16}/>} Sound {q.state.settings.muted ? 'off' : 'on'}</button></div></>}
 {tab === 'Reminders' && <><article className="card"><h3>A note for later</h3><ReminderForm add={async (text, at) => { if (!window.qbit) throw new Error('Open the Electron app to save reminders.'); await window.qbit.addReminder({text, at}); q.sound('chime'); }}/></article><section className="card reminder-card">{list}</section></>}
 {tab === 'System' && <SystemStats stats={q.stats}/>}{tab === 'Settings' && <SettingsPanel settings={q.state.settings} update={update} sound={q.sound} stats={q.stats} visible={q.visible} toggle={() => void q.run(() => window.qbit?.toggleWidget())} reset={() => void q.run(() => window.qbit?.resetWidget())}/>}<footer>QBIT <span>Made for the small moments.</span></footer></main></div>;
}







