const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const engine = require('./engine');
const tempo = require('./tempo');

app.setName('Harman');

const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'aiff', 'wma'];
const FFMPEG_PATHS = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];

function findFfmpeg() {
  return FFMPEG_PATHS.find((p) => !p.includes('/') || fs.existsSync(p));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(findFfmpeg(), ['-y', '-loglevel', 'error', ...args], (err, _out, stderr) => {
      if (err) reject(new Error(err.code === 'ENOENT' ? 'ffmpeg bulunamadı (brew install ffmpeg)' : stderr || err.message));
      else resolve();
    });
  });
}

function tempFile(ext) {
  return path.join(os.tmpdir(), `harman-${process.pid}-${Date.now()}.${ext}`);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 800,
    minWidth: 960,
    minHeight: 560,
    backgroundColor: '#121317',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Menü; tıklamalar arayüze "menu" olayı olarak gider. registerAccelerator:false olanlar
// yalnızca kısayolu göstermek içindir, tuşu arayüz kendisi dinler.
function buildMenu() {
  const send = (id) => () => BrowserWindow.getAllWindows()[0]?.webContents.send('menu', id);
  const item = (label, id, accelerator, extra = {}) => ({ label, accelerator, click: send(id), ...extra });
  const display = { registerAccelerator: false };
  const sep = { type: 'separator' };

  const template = [
    {
      label: 'Harman',
      submenu: [
        { role: 'about', label: 'Harman Hakkında' },
        sep,
        { role: 'hide', label: 'Harman\'ı Gizle' },
        { role: 'hideOthers', label: 'Diğerlerini Gizle' },
        { role: 'unhide', label: 'Tümünü Göster' },
        sep,
        { role: 'quit', label: 'Harman\'dan Çık' },
      ],
    },
    {
      label: 'Dosya',
      submenu: [
        item('Şarkı Ekle…', 'add', 'CmdOrCtrl+O'),
        item('Mix\'i Kaydet…', 'export', 'CmdOrCtrl+E'),
        sep,
        { role: 'close', label: 'Pencereyi Kapat' },
      ],
    },
    {
      label: 'Düzen',
      submenu: [
        item('Geri Al', 'undo', 'CmdOrCtrl+Z'),
        item('Yinele', 'redo', 'Shift+CmdOrCtrl+Z'),
        sep,
        item('Kes', 'cut', 'CmdOrCtrl+X'),
        item('Kopyala', 'copy', 'CmdOrCtrl+C'),
        item('Yapıştır', 'paste', 'CmdOrCtrl+V'),
        item('Tümünü Seç', 'selectall', 'CmdOrCtrl+A'),
        sep,
        item('Oynatma Çizgisinden Böl', 'split', 'S', display),
        item('Çoğalt', 'duplicate', 'CmdOrCtrl+D'),
        item('Vokal / Enstrüman Ayır…', 'separate', 'Shift+CmdOrCtrl+S'),
        item('Tempo ve Tonu Eşleştir…', 'match', 'Shift+CmdOrCtrl+M'),
        item('Şarkıyı Sıfırla…', 'reset', null),
        item('Sil', 'delete', 'Backspace', display),
      ],
    },
    {
      label: 'Oynatma',
      submenu: [
        item('Oynat / Duraklat', 'play', 'Space', display),
        item('Başa Dön', 'start', 'Return', display),
        item('Sona Git', 'end', 'End', display),
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        item('Yakınlaştır', 'zoom-in', 'CmdOrCtrl+='),
        item('Uzaklaştır', 'zoom-out', 'CmdOrCtrl+-'),
        item('Tümünü Sığdır', 'fit', 'CmdOrCtrl+0'),
        sep,
        { role: 'togglefullscreen', label: 'Tam Ekran' },
        ...(app.isPackaged ? [] : [sep, { role: 'toggleDevTools', label: 'Geliştirici Araçları' }]),
      ],
    },
    {
      label: 'Pencere',
      submenu: [
        { role: 'minimize', label: 'Simge Durumuna Küçült' },
        { role: 'zoom', label: 'Büyüt' },
      ],
    },
    {
      label: 'Yardım',
      submenu: [item('Klavye Kısayolları', 'help', 'CmdOrCtrl+/')],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('pick-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Ses dosyası ekle',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Ses dosyaları', extensions: AUDIO_EXTS }],
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('read-file', async (_e, filePath) => {
  const buf = await fs.promises.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

// Chromium'un çözemediği formatlar için: ffmpeg ile WAV'a çevirip döndürür.
ipcMain.handle('convert-to-wav', async (_e, filePath) => {
  const out = tempFile('wav');
  try {
    await runFfmpeg(['-i', filePath, '-ar', '44100', '-ac', '2', out]);
    const buf = await fs.promises.readFile(out);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } finally {
    fs.promises.rm(out, { force: true });
  }
});

// Biçim ayrı bir ayar değil: kaydetme penceresindeki dosya türünden (MP3 / WAV) ya da yazılan
// uzantıdan anlaşılır. Uzantı yoksa MP3.
const { resolveSaveTarget } = require('./saveformat');

ipcMain.handle('save-mix', async (_e, { wav, defaultName }) => {
  const { canceled, filePath: chosen } = await dialog.showSaveDialog({
    title: 'Mix\'i kaydet',
    defaultPath: path.join(app.getPath('music'), `${defaultName}.mp3`),
    filters: [
      { name: 'MP3 (küçük dosya, arabada dinlemek için)', extensions: ['mp3'] },
      { name: 'WAV (kayıpsız)', extensions: ['wav'] },
    ],
  });
  if (canceled || !chosen) return null;

  const { filePath, format } = resolveSaveTarget(chosen);
  const data = Buffer.from(wav);
  if (format === 'wav') {
    await fs.promises.writeFile(filePath, data);
    return filePath;
  }
  const tmp = tempFile('wav');
  try {
    await fs.promises.writeFile(tmp, data);
    await runFfmpeg(['-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '320k', filePath]);
  } finally {
    fs.promises.rm(tmp, { force: true });
  }
  return filePath;
});

// Vokal / enstrüman ayırma. İlerleme olayları isteği yapan pencereye gider.
const progressSender = (event, channel) => (payload) => {
  if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
};
// Yazı kutusundayken Kes/Kopyala/Yapıştır/Tümünü Seç o kutuya uygulanır.
ipcMain.handle('native-edit', (e, cmd) => {
  const wc = e.sender;
  ({ copy: () => wc.copy(), cut: () => wc.cut(), paste: () => wc.paste(), selectAll: () => wc.selectAll() })[cmd]?.();
});
ipcMain.handle('engine-status', () => engine.status());
ipcMain.handle('engine-install', (e) => engine.install(progressSender(e, 'engine-progress')));
ipcMain.handle('separate', (e, { filePath, model }) => engine.separate(filePath, model, progressSender(e, 'separate-progress')));
ipcMain.handle('separate-cancel', () => engine.cancel());
ipcMain.handle('tools-status', () => tempo.status());
ipcMain.handle('tools-install', (e) => tempo.install(progressSender(e, 'engine-progress')));
ipcMain.handle('stretch', (_e, args) => tempo.stretch(args));
ipcMain.handle('write-temp-wav', (_e, wav) => tempo.writeTempWav(wav));
ipcMain.handle('cleanup-dir', (_e, dir) => engine.cleanup(dir));
app.on('before-quit', () => engine.cancel());

app.whenReady().then(() => {
  // Geliştirme modunda Dock'ta da Harman ikonu görünsün.
  const devIcon = path.join(__dirname, '..', 'build', 'icon-1024.png');
  if (process.platform === 'darwin' && !app.isPackaged && fs.existsSync(devIcon)) app.dock.setIcon(devIcon);

  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
