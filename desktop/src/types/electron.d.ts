import type { State, Settings, Reminder, Stats, Runtime, Expression, CursorOffset } from '../../electron/types';
export type { State, Settings, Reminder, Stats, Expression, GPU, CursorOffset } from '../../electron/types';
declare global { interface Window { qbit?: {
 getState(): Promise<State>; getRuntime(): Promise<Runtime>; getStats(): Promise<Stats>;
 addReminder(r: { text: string; at: number }): Promise<void>; deleteReminder(id: string): Promise<void>; setSettings(s: Partial<Settings>): Promise<void>;
 openDashboard(): Promise<void>; minimizeWidget(): Promise<void>; toggleWidget(): Promise<void>; resetWidget(): Promise<void>; interact(): Promise<void>;
 onState(fn: (s: State) => void): () => void; onReminder(fn: (r: Reminder) => void): () => void; onStats(fn: (s: Stats) => void): () => void;
 onExpression(fn: (s: Expression) => void): () => void; onCursor(fn: (s: CursorOffset) => void): () => void; onVisibility(fn: (visible: boolean) => void): () => void;
}; } }
