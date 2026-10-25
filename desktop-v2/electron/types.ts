// ---------------------------------------------------------------------------
// Shared types. The expression list, Settings base keys, DEFAULT_SETTINGS and
// the system/stats/battery shapes are ported verbatim from the original
// desktop app so the ExpressionEngine and system monitors keep working as-is.
// New QBIT Hub features add extra Settings keys and new data shapes below.
// ---------------------------------------------------------------------------

export const EXPRESSIONS = ['idle','happy','curious','sleepy','focused','excited','surprised','worried','stressed','exhausted','playful','alert','charging','thinking'] as const;
export type Expression = typeof EXPRESSIONS[number];

export interface Reminder { id: string; text: string; at: number; completed: boolean }

// ---------------------------------------------------------------------------
// Time & Productivity
// ---------------------------------------------------------------------------
export interface Alarm {
 id: string;
 label: string;
 /** Minutes since midnight, 0-1439. */
 time: number;
 /** Days of week the alarm repeats on (0 = Sunday .. 6 = Saturday). Empty = one-shot. */
 days: number[];
 enabled: boolean;
 /** For one-shot alarms, the epoch ms boundary already fired to avoid re-firing within the same minute. */
 lastFired: number | null;
}

// ---------------------------------------------------------------------------
// Settings - original keys preserved, new keys appended.
// ---------------------------------------------------------------------------
export interface Settings {
 muted: boolean;
 volume: number;
 alwaysOnTop: boolean;
 expression: Expression;
 animationsPaused: boolean;
 cursorTracking: boolean;
 adaptiveExpressions: boolean;
 trayAnimation: boolean;
 expressionIntensity: number;
 widgetSize: number;
 preferredGpu: string;
 // --- New: Weather ---
 weatherLatitude: number | null;
 weatherLongitude: number | null;
 weatherLabel: string;
 // --- New: Device (ESP32-CAM over Bluetooth) ---
 devicePort: string;
 deviceAutoConnect: boolean;
 sendMoodsToDevice: boolean;
 sendWeatherToDevice: boolean;
 // --- New: Productivity ---
 pomodoroWork: number;   // minutes
 pomodoroBreak: number;  // minutes
}

export const DEFAULT_SETTINGS: Settings = {
 muted: false,
 volume: .35,
 alwaysOnTop: true,
 expression: 'idle',
 animationsPaused: false,
 cursorTracking: true,
 adaptiveExpressions: true,
 trayAnimation: true,
 expressionIntensity: 1,
 widgetSize: 180,
 preferredGpu: '',
 weatherLatitude: null,
 weatherLongitude: null,
 weatherLabel: '',
 devicePort: '',
 deviceAutoConnect: true,
 sendMoodsToDevice: true,
 sendWeatherToDevice: true,
 pomodoroWork: 25,
 pomodoroBreak: 5
};

export interface State { reminders: Reminder[]; alarms: Alarm[]; settings: Settings }

export interface Battery { percent: number; isCharging: boolean; acConnected: boolean; timeRemaining: number | null }
export interface GPU { id: string; model: string; vendor: string; type: 'Integrated' | 'Dedicated' | 'Unknown'; utilization: number | null; memoryUsed: number | null; memoryTotal: number | null }
export interface Stats { cpu: number | null; cpuName: string; logicalProcessors: number | null; used: number; total: number; available: number; ramPercent: number | null; gpus: GPU[]; platform: string; battery: Battery | null; time: number }
export interface Runtime { expression: Expression; visible: boolean }
export interface CursorOffset { x: number; y: number }

// ---------------------------------------------------------------------------
// Device link (ESP32-CAM over Bluetooth SPP serial, 9600 baud)
// ---------------------------------------------------------------------------
export type DeviceStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';
export type DeviceTransport = 'bluetooth' | 'usb' | 'unknown';

export interface SerialPortInfo {
 path: string;
 manufacturer: string | null;
 serialNumber: string | null;
 pnpId: string | null;
 friendlyName: string | null;
 transport: DeviceTransport;
}

export interface DeviceLogEntry { id: string; at: number; direction: 'tx' | 'rx' | 'info'; line: string }

export interface DeviceState {
 status: DeviceStatus;
 port: string | null;
 transport: DeviceTransport;
 baud: number;
 /** Whether the firmware's "READY" handshake line was observed since opening. */
 handshake: boolean;
 lastRx: number | null;
 lastError: string | null;
 ports: SerialPortInfo[];
 log: DeviceLogEntry[];
}

// ---------------------------------------------------------------------------
// Weather (populated in the renderer via Open-Meteo, cached here for the
// device bridge and UI). The renderer is the source of truth for fetching.
// ---------------------------------------------------------------------------
export interface WeatherSnapshot {
 label: string;
 temperature: number | null;
 apparent: number | null;
 humidity: number | null;
 precipitation: number | null;
 weatherCode: number | null;
 windSpeed: number | null;
 isRaining: boolean;
 time: number;
}
