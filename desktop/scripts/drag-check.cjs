const { app, screen, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const data = path.join(root, '.tools', 'drag-check');
fs.mkdirSync(data, { recursive: true }); app.setPath('userData', data);
const delay = ms => new Promise(r => setTimeout(r, ms));
const timeout = setTimeout(() => app.exit(1), 30000);
(async () => {
 await app.whenReady();
 const windows = await import(pathToFileURL(path.join(root, 'dist-electron/windows.js')));
 const { store, state } = await import(pathToFileURL(path.join(root, 'dist-electron/store.js')));
 ipcMain.handle('state:get', () => state());
 ipcMain.handle('stats:get', () => null); ipcMain.handle('runtime:get', () => ({ expression: 'idle', visible: true }));
 const expectedPosition = store.get('widgetPosition');
 windows.createWidget(true);
 const win = windows.widget;
 await new Promise(r => win.webContents.once('did-finish-load', r));
 await delay(600);
 if(process.argv.includes('--verify-position')) { assert.ok(expectedPosition); const actual=win.getPosition(); assert.ok(Math.abs(actual[0]-expectedPosition.x)<=1 && Math.abs(actual[1]-expectedPosition.y)<=1); console.log('PASS: separate application restart restores saved desktop position.'); clearTimeout(timeout); app.quit(); return; }
 const area = screen.getPrimaryDisplay().workArea;
 win.setPosition(area.x + 100, area.y + 100); win.show(); win.focus();
 await delay(250);
 const before = win.getPosition();
 const handle = await win.webContents.executeJavaScript('(() => { const r = document.querySelector(".drag-handle").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
 console.log("Drag geometry", before, handle, win.getBounds(), screen.getPrimaryDisplay().scaleFactor); fs.writeFileSync(path.join(data, "before.png"), (await win.webContents.capturePage()).toPNG());
 const from = screen.dipToScreenPoint({ x: Math.round(before[0] + handle.x), y: Math.round(before[1] + handle.y) });
 const originalCursor = screen.getCursorScreenPoint(), cursor = screen.dipToScreenPoint(originalCursor);
 console.log("Physical pointer target", from);
 const code = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class QbitMouse { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint data, UIntPtr extra); }'
[QbitMouse]::SetProcessDPIAware() | Out-Null
[QbitMouse]::SetCursorPos(${from.x}, ${from.y}) | Out-Null
Start-Sleep -Milliseconds 150
try {
 [QbitMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 100
 for ($i=1; $i -le 12; $i++) { [QbitMouse]::SetCursorPos((${from.x} + $i*8), (${from.y} + $i*5)) | Out-Null; Start-Sleep -Milliseconds 25 }
} finally { [QbitMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero); [QbitMouse]::SetCursorPos(${cursor.x}, ${cursor.y}) | Out-Null }`;
 const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { windowsHide: true, timeout: 15000 });
 await delay(600);
 console.log(result.stdout, result.stderr); const after = win.getPosition();
 assert.ok(after[0] - before[0] > 30 && after[1] - before[1] > 20, `Actual native mouse drag failed: ${before} -> ${after}`);

 assert.deepEqual(store.get('widgetPosition'), { x: after[0], y: after[1] });
 const restored = windows.visiblePosition(store.get('widgetPosition'), 180, screen.getAllDisplays().map(d => d.workArea));
 assert.deepEqual(restored, { x: after[0], y: after[1] });
 assert.deepEqual(windows.visiblePosition({ x: -1200, y: 80 }, 180, [{ x: -1920, y: 0, width: 1920, height: 1080 }]), { x: -1200, y: 80 });
 const recovered = windows.visiblePosition({ x: -1200, y: 80 }, 180, [{ x: 0, y: 0, width: 1920, height: 1080 }]);
 assert.equal(recovered.x, 0);
 console.log(`PASS: actual Windows mouse drag ${before} -> ${after}, saved position, negative monitor coordinates and disconnected-monitor recovery.`);
 clearTimeout(timeout); app.quit();
})().catch(e => { console.error(e); clearTimeout(timeout); app.exit(1); });





