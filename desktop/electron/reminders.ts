import { Notification } from 'electron';
import { store } from './store.js';
import type { Reminder } from './types.js';
export function checkReminders(onFire: (r: Reminder) => void) { const reminders = store.get('reminders'); const due = reminders.filter(r => !r.completed && r.at <= Date.now()); if (!due.length) return; const ids = new Set(due.map(r => r.id)); store.set('reminders', reminders.map(r => ids.has(r.id) ? { ...r, completed: true } : r)); for (const reminder of due) { if (Notification.isSupported()) new Notification({ title: 'QBIT reminder', body: reminder.text, silent: true }).show(); onFire(reminder); } }
