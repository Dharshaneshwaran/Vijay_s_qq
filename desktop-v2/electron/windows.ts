import { app, BrowserWindow, Menu, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, store } from './store.js';
const directory = path.dirname(fileURLToPath(import.meta.url));
export let widget: BrowserWindow;
export let dashboard: BrowserWindow | null = null;
function load(win: BrowserWindow, mode: string) {
 if (process.argv.includes('--dev')) void win.loadURL(`http://127.0.0.1:5173/#${mode}`);
 else void win.loadFile(path.join(directory, '../dist/index.html'), { hash: mode });
 win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
 win.webContents.on('will-navigate', e => e.preventDefault());
}
const preferences = () => ({ preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true });
export function visiblePosition(position: { x: number; y: number }, size: number, areas: Electron.Rectangle[]) {
 const contains = (a: Electron.Rectangle) => position.x >= a.x && position.y >= a.y && position.x + size <= a.x + a.width && position.y + size <= a.y + a.height;
 if (areas.some(contains)) return position;
 const nearest = [...areas].sort((a, b) => {
  const distance = (r: Electron.Rectangle) => Math.hypot(Math.max(r.x - position.x, 0, position.x - (r.x + r.width)), Math.max(r.y - position.y, 0, position.y - (r.y + r.height)));
  return distance(a) - distance(b);
 })[0];
 if (!nearest) return position;
 return { x: Math.round(Math.max(nearest.x, Math.min(position.x, nearest.x + Math.max(0, nearest.width - size)))), y: Math.round(Math.max(nearest.y, Math.min(position.y, nearest.y + Math.max(0, nearest.height - size)))) };
}
function savePosition() {
 if (!widget || widget.isDestroyed() || widget.isMinimized()) return;
 const [x, y] = widget.getPosition(); store.set('widgetPosition', { x, y });
}
export function resetWidgetPosition() {
 const area = screen.getPrimaryDisplay().workArea, [size] = widget.getSize();
 widget.setPosition(area.x + Math.max(0, area.width - size - 24), area.y + Math.max(0, area.height - size - 24));
 savePosition();
}
export function createWidget(top: boolean) {
 const area = screen.getPrimaryDisplay().workArea, size = state().settings.widgetSize;
 const saved = store.get('widgetPosition');
 const position = visiblePosition(saved ?? { x: area.x + area.width - size - 24, y: area.y + area.height - size - 24 }, size, screen.getAllDisplays().map(d => d.workArea));
 widget = new BrowserWindow({ title: 'QBIT', width: size, height: size, ...position, frame: false, transparent: true, resizable: false, movable: true, minimizable: true, alwaysOnTop: top, skipTaskbar: false, webPreferences: { ...preferences(), backgroundThrottling: false } });
 let quitting = false;
 app.on('before-quit', () => { quitting = true; });
 widget.on('close', event => { if (!quitting) { event.preventDefault(); hideWidget(); } });


 let moving: ReturnType<typeof setTimeout>;
 widget.on('move', () => { clearTimeout(moving); moving = setTimeout(savePosition, 350); });
 widget.on('moved', () => { clearTimeout(moving); savePosition(); });
 let recoverOnRestore = false;
 const recover = () => {
  if (widget.isMinimized()) { recoverOnRestore = true; return; }
  const [x, y] = widget.getPosition(), [width] = widget.getSize();
  const next = visiblePosition({ x, y }, width, screen.getAllDisplays().map(d => d.workArea));
  if (next.x !== x || next.y !== y) widget.setPosition(next.x, next.y);
  savePosition();
 };
 widget.on('restore', () => { if (recoverOnRestore) { recoverOnRestore = false; recover(); } });
 screen.on('display-added', recover); screen.on('display-removed', recover); screen.on('display-metrics-changed', recover);
 widget.on('closed', () => { clearTimeout(moving); screen.removeListener('display-added', recover); screen.removeListener('display-removed', recover); screen.removeListener('display-metrics-changed', recover); });
 app.on('before-quit', savePosition);
 widget.webContents.on('context-menu', () => widgetContextMenu().popup({ window: widget }));
 load(widget, 'widget');
}
export function resizeWidget(size: number) { widget.setSize(Math.round(size), Math.round(size)); }
export function hideWidget() { savePosition(); widget.hide(); widget.setSkipTaskbar(true); }
export function showWidget() { widget.setSkipTaskbar(false); if (widget.isMinimized()) widget.restore(); widget.show(); widget.focus(); }
export function toggleWidget() { if (widget.isVisible() && !widget.isMinimized()) hideWidget(); else showWidget(); }
export function minimizeWidget() { savePosition(); widget.minimize(); }
export function widgetContextMenu() { return Menu.buildFromTemplate([
 { label: 'Open Control Center', click: showDashboard },
 { label: 'Minimize QBIT', click: minimizeWidget },
 { label: 'Quit QBIT', click: () => app.quit() }
]); }
export function showDashboard() {
 if (dashboard && !dashboard.isDestroyed()) { dashboard.show(); dashboard.focus(); return; }
 dashboard = new BrowserWindow({ width: 1040, height: 740, minWidth: 860, minHeight: 620, title: 'QBIT Hub', backgroundColor: '#F7F8FA', autoHideMenuBar: true, webPreferences: preferences() });
 load(dashboard, 'dashboard'); dashboard.on('closed', () => { dashboard = null; });
}
export function broadcast(channel: string, payload: unknown) { BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload)); }




