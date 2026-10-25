import type { State, Settings, Reminder, Alarm, Stats, Runtime, Expression, CursorOffset, DeviceState, WeatherSnapshot, SerialPortInfo } from '../../electron/types';
export type { State, Settings, Reminder, Alarm, Stats, Expression, GPU, CursorOffset, DeviceState, DeviceStatus, DeviceTransport, SerialPortInfo, DeviceLogEntry, WeatherSnapshot } from '../../electron/types';

declare global {
 interface Window {
  qbit?: {
   getState(): Promise<State>;
   getRuntime(): Promise<Runtime>;
   getStats(): Promise<Stats>;
   addReminder(r: { text: string; at: number }): Promise<void>;
   deleteReminder(id: string): Promise<void>;
   addAlarm(a: { label: string; time: number; days: number[] }): Promise<void>;
   updateAlarm(a: Partial<Alarm> & { id: string }): Promise<void>;
   deleteAlarm(id: string): Promise<void>;
   setSettings(s: Partial<Settings>): Promise<void>;
   openDashboard(): Promise<void>;
   minimizeWidget(): Promise<void>;
   toggleWidget(): Promise<void>;
   resetWidget(): Promise<void>;
   interact(): Promise<void>;
   getDevice(): Promise<DeviceState>;
   listPorts(): Promise<SerialPortInfo[]>;
   connectDevice(path: string): Promise<DeviceState>;
   disconnectDevice(): Promise<DeviceState>;
   sendDevice(line: string): Promise<boolean>;
   clearDeviceLog(): Promise<DeviceState>;
   reportWeather(snapshot: WeatherSnapshot): Promise<void>;
   onState(fn: (s: State) => void): () => void;
   onReminder(fn: (r: Reminder) => void): () => void;
   onAlarm(fn: (a: Alarm) => void): () => void;
   onStats(fn: (s: Stats) => void): () => void;
   onExpression(fn: (s: Expression) => void): () => void;
   onCursor(fn: (s: CursorOffset) => void): () => void;
   onVisibility(fn: (visible: boolean) => void): () => void;
   onDevice(fn: (s: DeviceState) => void): () => void;
  };
 }
}
