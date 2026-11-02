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
  saveMix: (wav, defaultName, format, kbps) => ipcRenderer.invoke('save-mix', { wav, defaultName, format, kbps }),
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
  projectSaveDialog: (name) => ipcRenderer.invoke('project-save-dialog', name),
  projectOpenDialog: () => ipcRenderer.invoke('project-open-dialog'),
  projectDataDir: (projectPath) => ipcRenderer.invoke('project-data-dir', projectPath),
  projectWriteJson: (file, text) => ipcRenderer.invoke('project-write-json', { file, text }),
  projectReadJson: (file) => ipcRenderer.invoke('project-read-json', file),
  projectWriteBlob: (dir, rel, bytes) => ipcRenderer.invoke('project-write-blob', { dir, rel, bytes }),
  projectReadBlob: (dir, rel) => ipcRenderer.invoke('project-read-blob', { dir, rel }),
  projectHasBlob: (dir, rel) => ipcRenderer.invoke('project-has-blob', { dir, rel }),
  projectPrune: (dir, keep) => ipcRenderer.invoke('project-prune', { dir, keep }),
  autosavePaths: () => ipcRenderer.invoke('autosave-paths'),
  autosavePeek: () => ipcRenderer.invoke('autosave-peek'),
  autosaveClear: () => ipcRenderer.invoke('autosave-clear'),
  locateFile: (name) => ipcRenderer.invoke('locate-file', name),
  confirmUnsaved: (name, action) => ipcRenderer.invoke('confirm-unsaved', { name, action }),
  confirmRestore: (info) => ipcRenderer.invoke('confirm-restore', info),
  closeWindow: (ok) => ipcRenderer.invoke('close-window', ok),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  onCloseRequest: (cb) => { ipcRenderer.on('close-request', () => cb()); },
  onFilesDropped: (cb) => { dropHandler = cb; },
  onMenu: (cb) => { ipcRenderer.on('menu', (_e, id) => cb(id)); },
});
