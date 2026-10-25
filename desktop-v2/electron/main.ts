import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { randomUUID } from 'node:crypto';
import { store, state } from './store.js';
import { createWidget, showDashboard, dashboard, widget, broadcast, minimizeWidget, toggleWidget, resetWidgetPosition, resizeWidget } from './windows.js';
import { createTray, updateTrayStats, updateTrayMood, refreshTraySettings } from './tray.js';
import { monitorBattery, monitorHardware, systemStats } from './system.js';
import { checkReminders, checkAlarms } from './reminders.js';
import { EXPRESSIONS, type Expression, type Settings, type Alarm, type WeatherSnapshot, type DeviceState } from './types.js';
import { monitorCursor } from './cursorMonitor.js';
import { ExpressionEngine } from './expressionEngine.js';
import { DeviceLink } from './device.js';

export const expressionEngine = new ExpressionEngine();
export let currentExpression: Expression = 'idle';

if (!app.requestSingleInstanceLock()) app.quit();
else {
 app.on('second-instance', () => { if (app.isReady()) showDashboard(); });
 void app.whenReady().then(() => {
  app.setAppUserModelId('com.qbit.hub');
  let settings = state().settings;
  let weather: WeatherSnapshot | null = null;

  createWidget(settings.alwaysOnTop); showDashboard();

  // --- Device link (ESP32-CAM over Bluetooth serial) ---
  let deviceState: DeviceState;
  const device = new DeviceLink(s => { deviceState = s; broadcast('device', s); });
  deviceState = device.getState();

  const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => {
   const win = BrowserWindow.fromWebContents(event.sender);
   if (!win || (win !== widget && win !== dashboard) || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted IPC sender');
  };
  const handle = (channel: string, callback: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown) =>
   ipcMain.handle(channel, (event, ...args) => { trusted(event); return callback(event, ...args); });

  // Push current desktop state down to the OLED (respecting user toggles).
  const pushToDevice = () => {
   if (!device.connected) return;
   device.setBluetoothIcon(true);
   device.setFace(settings.faceEyeW, settings.faceEyeH, settings.faceRadius, settings.faceGap, settings.faceMouth);
   const battery = systemStats().battery;
   if (battery) device.setBattery(battery.percent, battery.isCharging);
   if (settings.sendMoodsToDevice) device.setEmotion(currentExpression);
   if (settings.sendWeatherToDevice && weather) {
    device.setRain(weather.isRaining);
    device.setWeather(weather.isRaining ? 'monsoon' : 'sunny');
   }
  };

  const updateExpression = () => {
   const expression = expressionEngine.expression(settings);
   if (expression !== currentExpression) {
    currentExpression = expression;
    broadcast('expression', expression);
    if (settings.sendMoodsToDevice) { try { pushToDevice(); } catch { /* link may have dropped */ } }
   }
   updateTrayMood(expression, settings);
  };

  const sync = () => {
   const snapshot = state(); settings = snapshot.settings;
   broadcast('state', snapshot); refreshTraySettings(); cursor.reconcile(); updateExpression();
  };

  let rendererReady = false;
  const check = () => {
   if (!rendererReady) return;
   checkReminders(r => { expressionEngine.trigger('reminder'); updateExpression(); broadcast('reminder', r); if (device.connected) try { device.alert(r.text); } catch { /* ignore */ } sync(); });
   checkAlarms(a => { expressionEngine.trigger('reminder'); updateExpression(); broadcast('alarm', a); if (device.connected) try { device.alert(a.label || 'Alarm'); } catch { /* ignore */ } sync(); });
  };

  // --- core IPC ---
  handle('state:get', event => { if (event.sender === widget.webContents) { rendererReady = true; check(); } return state(); });
  handle('runtime:get', () => ({ expression: currentExpression, visible: widget.isVisible() && !widget.isMinimized() }));
  handle('stats:get', () => systemStats());

  // --- reminders ---
  handle('reminder:add', (_e, input: unknown) => {
   const r = input as { text?: unknown; at?: unknown };
   if (!r || typeof r.text !== 'string' || !r.text.trim() || r.text.length > 200 || typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at <= Date.now()) throw new Error('Choose a future date and enter up to 200 characters.');
   store.set('reminders', [...store.get('reminders'), { id: randomUUID(), text: r.text.trim(), at: r.at, completed: false }]); sync();
  });
  handle('reminder:delete', (_e, id: unknown) => { if (typeof id !== 'string') return; store.set('reminders', store.get('reminders').filter(r => r.id !== id)); sync(); });

  // --- alarms ---
  handle('alarm:add', (_e, input: unknown) => {
   const a = input as { label?: unknown; time?: unknown; days?: unknown };
   if (!a || typeof a.time !== 'number' || !Number.isFinite(a.time) || a.time < 0 || a.time > 1439) throw new Error('Choose a valid time.');
   const days = Array.isArray(a.days) ? a.days.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6) : [];
   const label = typeof a.label === 'string' ? a.label.slice(0, 60) : '';
   const alarm: Alarm = { id: randomUUID(), label, time: Math.round(a.time), days, enabled: true, lastFired: null };
   store.set('alarms', [...store.get('alarms'), alarm]); sync();
  });
  handle('alarm:update', (_e, input: unknown) => {
   const patch = input as Partial<Alarm> & { id?: unknown };
   if (!patch || typeof patch.id !== 'string') return;
   store.set('alarms', store.get('alarms').map(a => {
    if (a.id !== patch.id) return a;
    const next: Alarm = { ...a };
    if (typeof patch.label === 'string') next.label = patch.label.slice(0, 60);
    if (typeof patch.time === 'number' && patch.time >= 0 && patch.time <= 1439) next.time = Math.round(patch.time);
    if (Array.isArray(patch.days)) next.days = patch.days.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6);
    if (typeof patch.enabled === 'boolean') { next.enabled = patch.enabled; if (patch.enabled) next.lastFired = null; }
    return next;
   })); sync();
  });
  handle('alarm:delete', (_e, id: unknown) => { if (typeof id !== 'string') return; store.set('alarms', store.get('alarms').filter(a => a.id !== id)); sync(); });

  // --- settings ---
  handle('settings:set', (_e, input: unknown) => {
   if (!input || typeof input !== 'object') return;
   const patch = input as Partial<Settings>, next = { ...state().settings };
   for (const key of ['muted','alwaysOnTop','animationsPaused','cursorTracking','adaptiveExpressions','trayAnimation','deviceAutoConnect','sendMoodsToDevice','sendWeatherToDevice'] as const) { if (typeof patch[key] === 'boolean') next[key] = patch[key] as boolean; }
   for (const [key, min, max] of [['volume',0,1],['expressionIntensity',.3,1.5],['widgetSize',180,280],['pomodoroWork',1,120],['pomodoroBreak',1,60],['faceEyeW',8,50],['faceEyeH',6,50],['faceRadius',0,20],['faceGap',30,90],['faceMouth',0,3]] as const) { const value = patch[key]; if (typeof value === 'number' && Number.isFinite(value)) (next[key] as number) = Math.max(min, Math.min(max, value)); }
   if (typeof patch.preferredGpu === 'string' && patch.preferredGpu.length <= 512) next.preferredGpu = patch.preferredGpu;
   if (typeof patch.devicePort === 'string' && patch.devicePort.length <= 512) next.devicePort = patch.devicePort;
   if (typeof patch.weatherLabel === 'string' && patch.weatherLabel.length <= 120) next.weatherLabel = patch.weatherLabel;
   if (patch.weatherLatitude === null || (typeof patch.weatherLatitude === 'number' && Number.isFinite(patch.weatherLatitude))) next.weatherLatitude = patch.weatherLatitude ?? null;
   if (patch.weatherLongitude === null || (typeof patch.weatherLongitude === 'number' && Number.isFinite(patch.weatherLongitude))) next.weatherLongitude = patch.weatherLongitude ?? null;
   if (typeof patch.expression === 'string' && (EXPRESSIONS as readonly string[]).includes(patch.expression)) next.expression = patch.expression;
   const changedSize = next.widgetSize !== state().settings.widgetSize;
   store.set('settings', next); widget.setAlwaysOnTop(next.alwaysOnTop);
   if (changedSize) resizeWidget(next.widgetSize);
   // Push updated face geometry to the OLED immediately (deduped in device.ts).
   if (device.connected) { try { device.setFace(next.faceEyeW, next.faceEyeH, next.faceRadius, next.faceGap, next.faceMouth); } catch { /* ignore */ } }
   sync();
  });

  // --- windows ---
  handle('dashboard:open', showDashboard);
  handle('widget:minimize', event => { if (event.sender === widget.webContents) minimizeWidget(); });
  handle('widget:toggle', toggleWidget); handle('widget:reset', resetWidgetPosition);
  handle('widget:interact', () => { expressionEngine.trigger('click'); updateExpression(); });

  // --- device IPC ---
  handle('device:get', () => device.getState());
  handle('device:list', () => device.listPorts());
  handle('device:connect', async (_e, path: unknown) => {
   if (typeof path !== 'string' || !path) throw new Error('No port selected.');
   await device.connect(path);
   store.set('settings', { ...state().settings, devicePort: path }); settings = state().settings;
   try { pushToDevice(); } catch { /* ignore */ }
   return device.getState();
  });
  handle('device:disconnect', async () => { await device.disconnect(); return device.getState(); });
  handle('device:send', (_e, line: unknown) => { if (typeof line !== 'string' || !line) return false; return device.send(line.slice(0, 120)); });
  handle('device:clearLog', () => { device.clearLog(); return device.getState(); });

  // --- weather report from renderer ---
  handle('weather:report', (_e, input: unknown) => {
   const s = input as Partial<WeatherSnapshot> | null;
   if (!s || typeof s !== 'object') return;
   weather = {
    label: typeof s.label === 'string' ? s.label : '',
    temperature: typeof s.temperature === 'number' ? s.temperature : null,
    apparent: typeof s.apparent === 'number' ? s.apparent : null,
    humidity: typeof s.humidity === 'number' ? s.humidity : null,
    precipitation: typeof s.precipitation === 'number' ? s.precipitation : null,
    weatherCode: typeof s.weatherCode === 'number' ? s.weatherCode : null,
    windSpeed: typeof s.windSpeed === 'number' ? s.windSpeed : null,
    isRaining: !!s.isRaining,
    time: Date.now()
   };
   if (settings.sendWeatherToDevice) { try { pushToDevice(); } catch { /* ignore */ } }
  });

  createTray(showDashboard, toggleWidget, () => { store.set('settings', { ...state().settings, animationsPaused: !state().settings.animationsPaused }); sync(); });

  const publishStats = () => {
   const stats = systemStats();
   expressionEngine.update(stats, settings);
   updateExpression();
   broadcast('stats', stats);
   updateTrayStats(stats);
   if (device.connected && stats.battery) { try { device.setBattery(stats.battery.percent, stats.battery.isCharging); } catch { /* ignore */ } }
  };

  const cursor = monitorCursor(widget, () => settings, visible => broadcast('visibility', visible));
  const stopHardware = monitorHardware(publishStats), stopBattery = monitorBattery(publishStats);
  const reminders = setInterval(check, 1000), expressions = setInterval(updateExpression, 250);
  powerMonitor.on('resume', check);

  // Auto-connect to a previously-used / best Bluetooth port on startup.
  void (async () => {
   if (!settings.deviceAutoConnect) { await device.listPorts(); return; }
   const ports = await device.listPorts();
   const target = ports.find(p => p.path === settings.devicePort) ?? device.bestPort(ports);
   if (target) { try { await device.connect(target.path); pushToDevice(); } catch { /* user can connect manually */ } }
  })();

  app.on('before-quit', () => {
   clearInterval(reminders); clearInterval(expressions);
   stopHardware(); stopBattery(); cursor.stop();
   void device.disconnect();
   powerMonitor.removeListener('resume', check);
  });
 });
 app.on('window-all-closed', () => {});
 app.on('activate', () => { if (app.isReady()) showDashboard(); });
}
