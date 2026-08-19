const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveApiKeys: (apiKeys, model) => ipcRenderer.invoke('save-api-keys', apiKeys, model),
    getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    onShowSettings: (callback) => ipcRenderer.on('show-settings', () => callback()),
});
