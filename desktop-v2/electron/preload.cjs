const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
 const listener = (_event, value) => callback(value);
 ipcRenderer.on(channel, listener);
 return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('qbit', {
 // --- core state / stats / runtime ---
 getState: () => ipcRenderer.invoke('state:get'),
 getRuntime: () => ipcRenderer.invoke('runtime:get'),
 getStats: () => ipcRenderer.invoke('stats:get'),
 // --- reminders ---
 addReminder: value => ipcRenderer.invoke('reminder:add', value),
 deleteReminder: id => ipcRenderer.invoke('reminder:delete', id),
 // --- alarms ---
 addAlarm: value => ipcRenderer.invoke('alarm:add', value),
 updateAlarm: value => ipcRenderer.invoke('alarm:update', value),
 deleteAlarm: id => ipcRenderer.invoke('alarm:delete', id),
 // --- settings / windows ---
 setSettings: value => ipcRenderer.invoke('settings:set', value),
 openDashboard: () => ipcRenderer.invoke('dashboard:open'),
 minimizeWidget: () => ipcRenderer.invoke('widget:minimize'),
 toggleWidget: () => ipcRenderer.invoke('widget:toggle'),
 resetWidget: () => ipcRenderer.invoke('widget:reset'),
 interact: () => ipcRenderer.invoke('widget:interact'),
 // --- device (ESP32-CAM over Bluetooth) ---
 getDevice: () => ipcRenderer.invoke('device:get'),
 listPorts: () => ipcRenderer.invoke('device:list'),
 connectDevice: path => ipcRenderer.invoke('device:connect', path),
 disconnectDevice: () => ipcRenderer.invoke('device:disconnect'),
 sendDevice: line => ipcRenderer.invoke('device:send', line),
 clearDeviceLog: () => ipcRenderer.invoke('device:clearLog'),
 // --- weather (renderer fetches, reports a snapshot to the main process) ---
 reportWeather: snapshot => ipcRenderer.invoke('weather:report', snapshot),
 // --- event subscriptions ---
 onState: callback => subscribe('state', callback),
 onReminder: callback => subscribe('reminder', callback),
 onAlarm: callback => subscribe('alarm', callback),
 onStats: callback => subscribe('stats', callback),
 onExpression: callback => subscribe('expression', callback),
 onCursor: callback => subscribe('cursor', callback),
 onVisibility: callback => subscribe('visibility', callback),
 onDevice: callback => subscribe('device', callback)
});
