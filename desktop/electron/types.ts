export const EXPRESSIONS = ['idle','happy','curious','sleepy','focused','excited','surprised','worried','stressed','exhausted','playful','alert','charging','thinking'] as const;
export type Expression = typeof EXPRESSIONS[number];
export interface Reminder { id: string; text: string; at: number; completed: boolean }
export interface Settings { muted: boolean; volume: number; alwaysOnTop: boolean; expression: Expression; animationsPaused: boolean; cursorTracking: boolean; adaptiveExpressions: boolean; trayAnimation: boolean; expressionIntensity: number; widgetSize: number; preferredGpu: string }
export const DEFAULT_SETTINGS: Settings = { muted: false, volume: .35, alwaysOnTop: true, expression: 'idle', animationsPaused: false, cursorTracking: true, adaptiveExpressions: true, trayAnimation: true, expressionIntensity: 1, widgetSize: 180, preferredGpu: '' };
export interface State { reminders: Reminder[]; settings: Settings }
export interface Battery { percent: number; isCharging: boolean; acConnected: boolean; timeRemaining: number | null }
export interface GPU { id: string; model: string; vendor: string; type: 'Integrated' | 'Dedicated' | 'Unknown'; utilization: number | null; memoryUsed: number | null; memoryTotal: number | null }
export interface Stats { cpu: number | null; cpuName: string; logicalProcessors: number | null; used: number; total: number; available: number; ramPercent: number | null; gpus: GPU[]; platform: string; battery: Battery | null; time: number }
export interface Runtime { expression: Expression; visible: boolean }
export interface CursorOffset { x: number; y: number }
