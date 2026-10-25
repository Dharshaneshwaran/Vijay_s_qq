const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('qbit', {
 getState: () => ipcRenderer.invoke('state:get'), getRuntime: () => ipcRenderer.invoke('runtime:get'), getStats: () => ipcRenderer.invoke('stats:get'),
 addReminder: value => ipcRenderer.invoke('reminder:add', value), deleteReminder: id => ipcRenderer.invoke('reminder:delete', id),
 setSettings: value => ipcRenderer.invoke('settings:set', value), openDashboard: () => ipcRenderer.invoke('dashboard:open'),
 minimizeWidget: () => ipcRenderer.invoke('widget:minimize'), toggleWidget: () => ipcRenderer.invoke('widget:toggle'), resetWidget: () => ipcRenderer.invoke('widget:reset'), interact: () => ipcRenderer.invoke('widget:interact'),
 onState: callback => subscribe('state', callback), onReminder: callback => subscribe('reminder', callback), onStats: callback => subscribe('stats', callback), onExpression: callback => subscribe('expression', callback), onCursor: callback => subscribe('cursor', callback), onVisibility: callback => subscribe('visibility', callback)
});
