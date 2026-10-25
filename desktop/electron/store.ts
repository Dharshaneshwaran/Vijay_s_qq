import Store from 'electron-store';
import { DEFAULT_SETTINGS, type State } from './types.js';
export const store = new Store<State & { widgetPosition: { x: number; y: number } | null }>({ defaults: { widgetPosition: null, reminders: [], settings: DEFAULT_SETTINGS } });
export const state = (): State => ({ reminders: store.get('reminders'), settings: { ...DEFAULT_SETTINGS, ...store.get('settings') } });
