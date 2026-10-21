const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('palmier', Object.freeze({
  getStatus: () => ipcRenderer.invoke('palmier:status'),
  importMedia: () => ipcRenderer.invoke('palmier:import'),
  importPaths: (paths) => ipcRenderer.invoke('palmier:import-paths', paths),
  mediaFiles: (files) => Array.from(files, (file) => webUtils.getPathForFile(file)).filter(Boolean),
  saveProject: (project, saveAs = false) => ipcRenderer.invoke('palmier:save', project, saveAs),
  openProject: () => ipcRenderer.invoke('palmier:open'),
  render: (project, mode) => ipcRenderer.invoke('palmier:render', project, mode),
  cancelRender: () => ipcRenderer.invoke('palmier:cancel'),
  revealFile: (filePath) => ipcRenderer.invoke('palmier:reveal', filePath),
  setDirty: (dirty) => ipcRenderer.send('palmier:dirty', dirty === true),
  onRenderProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('palmier:progress', listener);
    return () => ipcRenderer.removeListener('palmier:progress', listener);
  },
}));
