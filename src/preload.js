const { contextBridge, ipcRenderer, webUtils } = require('electron');

let dropHandler = null;

// Sürükle-bırak: gerçek dosya yolları yalnızca burada (preload) okunabilir.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('drop-active');
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) document.body.classList.remove('drop-active');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('drop-active');
  const paths = [...e.dataTransfer.files].map((f) => webUtils.getPathForFile(f)).filter(Boolean);
  if (paths.length && dropHandler) dropHandler(paths);
});

contextBridge.exposeInMainWorld('harman', {
  nativeEdit: (cmd) => ipcRenderer.invoke('native-edit', cmd),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  convertToWav: (filePath) => ipcRenderer.invoke('convert-to-wav', filePath),
  saveMix: (wav, defaultName) => ipcRenderer.invoke('save-mix', { wav, defaultName }),
  engineStatus: () => ipcRenderer.invoke('engine-status'),
  installEngine: () => ipcRenderer.invoke('engine-install'),
  onEngineProgress: (cb) => { ipcRenderer.on('engine-progress', (_e, p) => cb(p)); },
  separate: (filePath, model) => ipcRenderer.invoke('separate', { filePath, model }),
  onSeparateProgress: (cb) => { ipcRenderer.on('separate-progress', (_e, p) => cb(p)); },
  cancelSeparate: () => ipcRenderer.invoke('separate-cancel'),
  toolsStatus: () => ipcRenderer.invoke('tools-status'),
  installTools: () => ipcRenderer.invoke('tools-install'),
  stretch: (wav, stretch, semitones) => ipcRenderer.invoke('stretch', { wav, stretch, semitones }),
  writeTempWav: (wav) => ipcRenderer.invoke('write-temp-wav', wav),
  cleanupDir: (dir) => ipcRenderer.invoke('cleanup-dir', dir),
  onFilesDropped: (cb) => { dropHandler = cb; },
  onMenu: (cb) => { ipcRenderer.on('menu', (_e, id) => cb(id)); },
});
