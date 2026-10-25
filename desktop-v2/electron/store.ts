import Store from 'electron-store';
import { DEFAULT_SETTINGS, type State } from './types.js';

type Persisted = State & { widgetPosition: { x: number; y: number } | null };

export const store = new Store<Persisted>({
 defaults: { widgetPosition: null, reminders: [], alarms: [], settings: DEFAULT_SETTINGS }
});

export const state = (): State => ({
 reminders: store.get('reminders'),
 alarms: store.get('alarms'),
 // Spread defaults first so any newly-added Settings keys get sane values for
 // users upgrading from an older persisted store.
 settings: { ...DEFAULT_SETTINGS, ...store.get('settings') }
});
