import { Notification } from 'electron';
import { store } from './store.js';
import type { Reminder, Alarm } from './types.js';

// --- Reminders: fire once at/after their timestamp, then mark completed. ---
export function checkReminders(onFire: (r: Reminder) => void) {
 const reminders = store.get('reminders');
 const due = reminders.filter(r => !r.completed && r.at <= Date.now());
 if (!due.length) return;
 const ids = new Set(due.map(r => r.id));
 store.set('reminders', reminders.map(r => ids.has(r.id) ? { ...r, completed: true } : r));
 for (const reminder of due) {
  if (Notification.isSupported()) new Notification({ title: 'QBIT reminder', body: reminder.text, silent: true }).show();
  onFire(reminder);
 }
}

// --- Alarms: fire at a minute-of-day, optionally repeating on given weekdays. ---
export function checkAlarms(onFire: (a: Alarm) => void, now = new Date()) {
 const alarms = store.get('alarms');
 if (!alarms.length) return;
 const minuteOfDay = now.getHours() * 60 + now.getMinutes();
 const weekday = now.getDay();
 // Boundary at the start of the current minute - used to ensure each alarm
 // fires at most once per minute even though the scheduler ticks every second.
 const minuteBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0).getTime();

 let changed = false;
 const next = alarms.map(alarm => {
  if (!alarm.enabled || alarm.time !== minuteOfDay) return alarm;
  const repeats = alarm.days.length > 0;
  if (repeats && !alarm.days.includes(weekday)) return alarm;
  if ((alarm.lastFired ?? -1) >= minuteBoundary) return alarm; // already fired this minute

  if (Notification.isSupported()) new Notification({ title: 'QBIT alarm', body: alarm.label || 'Alarm', silent: true }).show();
  onFire(alarm);
  changed = true;
  // One-shot alarms disable themselves after firing; repeating alarms stay on.
  return { ...alarm, lastFired: minuteBoundary, enabled: repeats };
 });

 if (changed) store.set('alarms', next);
}
