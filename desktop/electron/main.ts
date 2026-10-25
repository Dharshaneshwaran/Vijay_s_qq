import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { randomUUID } from 'node:crypto';
import { store, state } from './store.js';
import { createWidget, showDashboard, dashboard, widget, broadcast, minimizeWidget, toggleWidget, resetWidgetPosition, resizeWidget } from './windows.js';
import { createTray, updateTrayStats, updateTrayMood, refreshTraySettings } from './tray.js';
import { monitorBattery, monitorHardware, systemStats } from './system.js';
import { checkReminders } from './reminders.js';
import { EXPRESSIONS, type Expression, type Settings } from './types.js';
import { monitorCursor } from './cursorMonitor.js';
import { ExpressionEngine } from './expressionEngine.js';
export const expressionEngine = new ExpressionEngine();
export let currentExpression: Expression = 'idle';
if (!app.requestSingleInstanceLock()) app.quit();
else {
 app.on('second-instance', () => { if (app.isReady()) showDashboard(); });
 void app.whenReady().then(() => {
  app.setAppUserModelId('com.qbit.companion');
  let settings = state().settings;
  createWidget(settings.alwaysOnTop); showDashboard();
  const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => {
   const win = BrowserWindow.fromWebContents(event.sender);
   if (!win || (win !== widget && win !== dashboard) || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted IPC sender');
  };
  const handle = (channel: string, callback: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown) => ipcMain.handle(channel, (event, ...args) => { trusted(event); return callback(event, ...args); });
  const updateExpression = () => {
   const expression = expressionEngine.expression(settings);
   if (expression !== currentExpression) { currentExpression = expression; broadcast('expression', expression); }
   updateTrayMood(expression, settings);
  };
  const sync = () => { const snapshot = state(); settings = snapshot.settings; broadcast('state', snapshot); refreshTraySettings(); cursor.reconcile(); updateExpression(); };
  let rendererReady = false;
  const check = () => { if (rendererReady) checkReminders(r => { expressionEngine.trigger('reminder'); updateExpression(); broadcast('reminder', r); sync(); }); };
  handle('state:get', event => { if (event.sender === widget.webContents) { rendererReady = true; check(); } return state(); });
  handle('runtime:get', () => ({ expression: currentExpression, visible: widget.isVisible() && !widget.isMinimized() }));
  handle('stats:get', () => systemStats());
  handle('reminder:add', (_e, input: unknown) => {
   const r = input as { text?: unknown; at?: unknown };
   if (!r || typeof r.text !== 'string' || !r.text.trim() || r.text.length > 200 || typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at <= Date.now()) throw new Error('Choose a future date and enter up to 200 characters.');
   store.set('reminders', [...store.get('reminders'), { id: randomUUID(), text: r.text.trim(), at: r.at, completed: false }]); sync();
  });
  handle('reminder:delete', (_e, id: unknown) => { if (typeof id !== 'string') return; store.set('reminders', store.get('reminders').filter(r => r.id !== id)); sync(); });
  handle('settings:set', (_e, input: unknown) => {
   if (!input || typeof input !== 'object') return;
   const patch = input as Partial<Settings>, next = { ...state().settings };
   for (const key of ['muted','alwaysOnTop','animationsPaused','cursorTracking','adaptiveExpressions','trayAnimation'] as const) { if (typeof patch[key] === 'boolean') next[key] = patch[key]; }
   for (const [key, min, max] of [['volume',0,1],['expressionIntensity',.3,1.5],['widgetSize',180,280]] as const) { const value = patch[key]; if (typeof value === 'number' && Number.isFinite(value)) next[key] = Math.max(min, Math.min(max, value)); }
   if (typeof patch.preferredGpu === 'string' && patch.preferredGpu.length <= 512) next.preferredGpu = patch.preferredGpu;
   if (typeof patch.expression === 'string' && (EXPRESSIONS as readonly string[]).includes(patch.expression)) next.expression = patch.expression;
   const changedSize = next.widgetSize !== state().settings.widgetSize;
   store.set('settings', next); widget.setAlwaysOnTop(next.alwaysOnTop);
   if (changedSize) resizeWidget(next.widgetSize);
   sync();
  });
  handle('dashboard:open', showDashboard);
  handle('widget:minimize', event => { if (event.sender === widget.webContents) minimizeWidget(); });
  handle('widget:toggle', toggleWidget); handle('widget:reset', resetWidgetPosition);
  handle('widget:interact', () => { expressionEngine.trigger('click'); updateExpression(); });
  createTray(showDashboard, toggleWidget, () => { store.set('settings', { ...state().settings, animationsPaused: !state().settings.animationsPaused }); sync(); });
  const publishStats = () => { const stats = systemStats(); expressionEngine.update(stats, settings); updateExpression(); broadcast('stats', stats); updateTrayStats(stats); };
  const cursor = monitorCursor(widget, () => settings, visible => broadcast('visibility', visible));
  const stopHardware = monitorHardware(publishStats), stopBattery = monitorBattery(publishStats);
  const reminders = setInterval(check, 1000), expressions = setInterval(updateExpression, 250);
  powerMonitor.on('resume', check);
  app.on('before-quit', () => { clearInterval(reminders); clearInterval(expressions); stopHardware(); stopBattery(); cursor.stop(); powerMonitor.removeListener('resume', check); });
 });
 app.on('window-all-closed', () => {});
 app.on('activate', () => { if (app.isReady()) showDashboard(); });
}



