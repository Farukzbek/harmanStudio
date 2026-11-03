const { app, BrowserWindow, Menu, dialog, ipcMain, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const engine = require('./engine');
const tempo = require('./tempo');
const projectFile = require('./projectfile');

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

// Pencere boyutu ve konumu hatırlanır; ekran artık yoksa (harici monitör çıkarıldı) varsayılana dönülür.
const boundsFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y >= a.y - 10 && b.y + 60 < a.y + a.height;
    });
    return visible ? b : null;
  } catch { return null; }
}

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved?.width ?? 1320,
    height: saved?.height ?? 800,
    ...(saved ? { x: saved.x, y: saved.y } : {}),
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

  let boundsTimer = null;
  const saveBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
      try { fs.writeFileSync(boundsFile(), JSON.stringify(win.getBounds())); } catch { /* yazılamazsa önemli değil */ }
    }, 400);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // Kaydedilmemiş çalışma varsa pencere hemen kapanmaz: arayüz sorar (Kaydet / Kaydetme / Vazgeç).
  // Sayfa yüklenmediyse ya da çöktüyse kapatmayı engellemeyiz.
  win.on('close', (e) => {
    if (win.forceClose || win.webContents.isLoading() || win.webContents.isCrashed()) return;
    e.preventDefault();
    win.quitRequested = quitting;
    quitting = false;
    win.webContents.send('close-request');
  });
}

let quitting = false;
app.on('before-quit', () => { quitting = true; });

// Menü; tıklamalar arayüze "menu" olayı olarak gider. registerAccelerator:false olanlar
// yalnızca kısayolu göstermek içindir, tuşu arayüz kendisi dinler.
// Son açılan / kaydedilen projeler (en yeni başta). Dock ikonundaki "Son Kullanılanlar" listesine de eklenir.
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function readRecent() {
  try {
    const list = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string' && fs.existsSync(p)).slice(0, 10) : [];
  } catch { return []; }
}
function addRecent(file) {
  const list = [file, ...readRecent().filter((p) => p !== file)].slice(0, 10);
  try { fs.writeFileSync(recentFile(), JSON.stringify(list)); } catch { /* yazılamazsa önemli değil */ }
  app.addRecentDocument(file);
  buildMenu();
}
const menuState = { snapBeats: true };

function buildMenu() {
  const send = (id) => (menuItem) => {
    if (id === 'snap-beats') menuState.snapBeats = menuItem.checked;
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu', id, menuItem?.checked);
  };
  const recent = readRecent();
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
        item('Yeni Proje', 'project-new', 'CmdOrCtrl+N'),
        item('Proje Aç…', 'project-open', 'Alt+CmdOrCtrl+O'),
        item('Projeyi Kaydet', 'project-save', 'CmdOrCtrl+S'),
        item('Projeyi Farklı Kaydet…', 'project-save-as', 'Alt+CmdOrCtrl+S'),
        {
          label: 'Son Açılanlar',
          enabled: recent.length > 0,
          submenu: [
            ...recent.map((file) => ({
              label: path.basename(file).replace(/\.harman$/, ''),
              toolTip: file,
              click: () => BrowserWindow.getAllWindows()[0]?.webContents.send('menu', 'open-recent', file),
            })),
            sep,
            { label: 'Listeyi Temizle', click: () => { try { fs.rmSync(recentFile(), { force: true }); } catch { /* yok */ } app.clearRecentDocuments(); buildMenu(); } },
          ],
        },
        sep,
        item('Şarkı Ekle…', 'add', 'CmdOrCtrl+O'),
        item('Mix\'i Kaydet…', 'export', 'CmdOrCtrl+E'),
        item('Mix\'i Parçalara Bölerek Kaydet…', 'export-split', null),
        item('Ses Parçalarını Ayrı Kaydet…', 'export-stems', null),
        sep,
        { role: 'close', label: 'Pencereyi Kapat' },
      ],
    },
    {
      label: 'Düzen',
      submenu: [
        item('Geri Al', 'undo', 'CmdOrCtrl+Z'),
        item('Yinele', 'redo', 'Shift+CmdOrCtrl+Z'),
        item('Geri Alma Geçmişi…', 'history', null),
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
        item('Şarkıları Otomatik Sırala ve Karıştır…', 'automix', null),
        item('Şarkıyı Sıfırla…', 'reset', null),
        item('Sil', 'delete', 'Backspace', display),
      ],
    },
    {
      label: 'Oynatma',
      submenu: [
        item('Oynat / Duraklat', 'play', 'Space', display),
        item('Seçili Parçayı Döngüde Dinle', 'loop', 'L', display),
        item('İnce Adım Geri', 'step-back', 'CmdOrCtrl+Left', display),
        item('İnce Adım İleri', 'step-forward', 'CmdOrCtrl+Right', display),
        item('Önceki Parça Kenarı', 'edge-back', 'Alt+Left', display),
        item('Sonraki Parça Kenarı', 'edge-forward', 'Alt+Right', display),
        item('İşaretçi Ekle', 'marker-add', 'M', display),
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
        item('Vuruşa Yapış', 'snap-beats', null, { type: 'checkbox', checked: menuState.snapBeats }),
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
      submenu: [item('Başlangıç Rehberi', 'welcome', null), item('Klavye Kısayolları', 'help', 'CmdOrCtrl+/')],
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

ipcMain.handle('save-mix', async (_e, { wav, defaultName, format: preferred = 'mp3', kbps = 320 }) => {
  const mp3Filter = { name: `MP3 (${kbps || 320} kbps)`, extensions: ['mp3'] };
  const wavFilter = { name: 'WAV (kayıpsız)', extensions: ['wav'] };
  const { canceled, filePath: chosen } = await dialog.showSaveDialog({
    title: 'Mix\'i kaydet',
    defaultPath: path.join(app.getPath('music'), `${defaultName}.${preferred === 'wav' ? 'wav' : 'mp3'}`),
    filters: preferred === 'wav' ? [wavFilter, mp3Filter] : [mp3Filter, wavFilter],
  });
  if (canceled || !chosen) return null;

  const { filePath, format } = resolveSaveTarget(chosen, preferred);
  const data = Buffer.from(wav);
  if (format === 'wav') {
    await fs.promises.writeFile(filePath, data);
    return filePath;
  }
  const tmp = tempFile('wav');
  try {
    await fs.promises.writeFile(tmp, data);
    await runFfmpeg(['-i', tmp, '-codec:a', 'libmp3lame', '-b:a', `${kbps || 320}k`, filePath]);
  } finally {
    fs.promises.rm(tmp, { force: true });
  }
  return filePath;
});

// Parça kütüphanesi: analiz edilen şarkıların BPM / ton bilgisi (dosya yoluyla). Uyumlu şarkı önerisi için.
const libraryFile = () => path.join(app.getPath('userData'), 'library.json');
function readLibrary() {
  try {
    const data = JSON.parse(fs.readFileSync(libraryFile(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}
ipcMain.handle('library-upsert', (_e, entry) => {
  if (!entry || typeof entry.path !== 'string' || !(entry.bpm > 0)) return;
  const lib = readLibrary();
  lib[entry.path] = { path: entry.path, name: String(entry.name || path.basename(entry.path)), bpm: entry.bpm, key: entry.key, dur: entry.dur, at: Date.now() };
  const keys = Object.keys(lib);
  if (keys.length > 3000) for (const k of keys.sort((a, b) => lib[a].at - lib[b].at).slice(0, keys.length - 3000)) delete lib[k];
  try { fs.writeFileSync(libraryFile(), JSON.stringify(lib)); } catch { /* yazılamazsa önemli değil */ }
});
// Okunamayan dosyalar hatırlanır: klasör tekrar eklenince aynı dosyalar yeniden denenmez.
const failedFile = () => path.join(app.getPath('userData'), 'library-failed.json');
const readFailed = () => { try { const l = JSON.parse(fs.readFileSync(failedFile(), 'utf8')); return Array.isArray(l) ? l : []; } catch { return []; } };
ipcMain.handle('library-mark-failed', (_e, file) => {
  const list = readFailed();
  if (typeof file === 'string' && !list.includes(file)) {
    list.push(file);
    try { fs.writeFileSync(failedFile(), JSON.stringify(list.slice(-2000))); } catch { /* yazılamazsa önemli değil */ }
  }
});
ipcMain.handle('library-failed-list', () => readFailed());
ipcMain.handle('library-list', () => Object.values(readLibrary()).filter((e) => fs.existsSync(e.path)));

// Kütüphaneye eklemek için klasör seçtirir ve içindeki (alt klasörler dahil) ses dosyalarını listeler.
async function listAudio(dir, out = [], depth = 0) {
  if (depth > 6 || out.length >= 800) return out;
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await listAudio(full, out, depth + 1);
    else if (AUDIO_EXTS.includes(path.extname(e.name).slice(1).toLowerCase())) out.push(full);
    if (out.length >= 800) break;
  }
  return out;
}
ipcMain.handle('library-pick-folder', async (e) => {
  // HARMAN_LIB_DIR yalnızca test içindir (diyalogu atlar).
  const { canceled, filePaths } = process.env.HARMAN_LIB_DIR ? { canceled: false, filePaths: [process.env.HARMAN_LIB_DIR] } : await dialog.showOpenDialog(winOf(e), {
    title: 'Müzik klasörünü seç', defaultPath: app.getPath('music'), properties: ['openDirectory'], buttonLabel: 'Klasörü ekle',
  });
  if (canceled || !filePaths[0]) return null;
  return { dir: filePaths[0], files: await listAudio(filePaths[0]) };
});

// Birden çok dosyayı bir klasöre yazar (bölünmüş mix, ayrı ses parçaları). Klasörü kullanıcı seçer.
const safeName = (name) => String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Dosya';
ipcMain.handle('save-batch', async (e, { files, format, kbps, title }) => {
  // HARMAN_BATCH_DIR yalnızca test içindir (diyalogu atlar).
  const { canceled, filePaths } = process.env.HARMAN_BATCH_DIR ? { canceled: false, filePaths: [process.env.HARMAN_BATCH_DIR] } : await dialog.showOpenDialog(winOf(e), {
    title: title || 'Klasör seç',
    defaultPath: app.getPath('music'),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Buraya kaydet',
  });
  if (canceled || !filePaths[0]) return null;
  const dir = filePaths[0];
  const used = new Set();
  for (const f of files) {
    let base = safeName(f.name);
    for (let n = 2; used.has(base.toLowerCase()); n++) base = `${safeName(f.name)} (${n})`;
    used.add(base.toLowerCase());
    const data = Buffer.from(f.wav);
    if (format === 'wav') {
      await fs.promises.writeFile(path.join(dir, `${base}.wav`), data);
    } else {
      const tmp = tempFile('wav');
      try {
        await fs.promises.writeFile(tmp, data);
        await runFfmpeg(['-i', tmp, '-codec:a', 'libmp3lame', '-b:a', `${kbps || 320}k`, path.join(dir, `${base}.mp3`)]);
      } finally {
        fs.promises.rm(tmp, { force: true });
      }
    }
  }
  return { dir, count: files.length };
});
ipcMain.handle('choose-format', async (e, { message, detail }) => {
  if (process.env.HARMAN_TEST_FORMAT) return process.env.HARMAN_TEST_FORMAT;   // yalnızca test içindir
  const { response } = await dialog.showMessageBox(winOf(e), { type: 'question', message, detail, buttons: ['MP3', 'WAV', 'Vazgeç'], defaultId: 0, cancelId: 2 });
  return ['mp3', 'wav', null][response];
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
ipcMain.handle('env-status', () => ({
  ffmpeg: FFMPEG_PATHS.some((p) => p.includes('/') && fs.existsSync(p)),
  engine: engine.status().installed,
  tools: tempo.status().installed,
}));
ipcMain.handle('engine-install', (e) => engine.install(progressSender(e, 'engine-progress')));
ipcMain.handle('separate', (e, { filePath, model }) => engine.separate(filePath, model, progressSender(e, 'separate-progress')));
ipcMain.handle('separate-cancel', () => engine.cancel());
ipcMain.handle('tools-status', () => tempo.status());
ipcMain.handle('tools-install', (e) => tempo.install(progressSender(e, 'engine-progress')));
ipcMain.handle('stretch', (_e, args) => tempo.stretch(args));
ipcMain.handle('write-temp-wav', (_e, wav) => tempo.writeTempWav(wav));
ipcMain.handle('cleanup-dir', (_e, dir) => engine.cleanup(dir));
app.on('before-quit', () => engine.cancel());

// .harman dosyasına çift tıklama / Dock'a bırakma / komut satırı: pencere hazırsa hemen, değilse hazır olunca açılır.
let pendingOpen = process.argv.find((a, i) => i > 0 && a.endsWith('.harman') && fs.existsSync(a)) || null;
let rendererReady = false;
app.on('open-file', (e, file) => {
  e.preventDefault();
  const win = BrowserWindow.getAllWindows()[0];
  if (win && rendererReady) {
    win.webContents.send('open-project', file);
    if (win.isMinimized()) win.restore();
    win.focus();
  } else {
    pendingOpen = file;
  }
});
ipcMain.handle('take-pending-open', () => {
  rendererReady = true;
  const file = pendingOpen;
  pendingOpen = null;
  return file;
});
ipcMain.handle('recent-add', (_e, file) => addRecent(file));

// ---------------------------------------------------------------- proje dosyaları
const projectFilters = [{ name: 'Harman projesi', extensions: ['harman'] }];
const projectsDir = () => path.join(app.getPath('documents'), 'Harman Projeleri');
const autosaveDir = () => path.join(app.getPath('userData'), 'autosave');
const autosaveFile = () => path.join(autosaveDir(), 'project.json');
const winOf = (e) => BrowserWindow.fromWebContents(e.sender);

ipcMain.handle('project-save-dialog', async (e, defaultName) => {
  await fs.promises.mkdir(projectsDir(), { recursive: true });
  const { canceled, filePath } = await dialog.showSaveDialog(winOf(e), {
    title: 'Projeyi kaydet',
    defaultPath: path.join(projectsDir(), `${defaultName}.harman`),
    filters: projectFilters,
  });
  if (canceled || !filePath) return null;
  return filePath.endsWith('.harman') ? filePath : `${filePath}.harman`;
});
ipcMain.handle('project-open-dialog', async (e) => {
  await fs.promises.mkdir(projectsDir(), { recursive: true });
  const { canceled, filePaths } = await dialog.showOpenDialog(winOf(e), {
    title: 'Proje aç',
    defaultPath: projectsDir(),
    properties: ['openFile'],
    filters: projectFilters,
  });
  return canceled ? null : filePaths[0];
});
ipcMain.handle('project-data-dir', (_e, projectPath) => projectFile.dataDirOf(projectPath));
ipcMain.handle('project-write-json', (_e, { file, text }) => projectFile.writeAtomic(file, text));
ipcMain.handle('project-read-json', (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('project-write-blob', (_e, { dir, rel, bytes }) => projectFile.writeBlob(dir, rel, bytes));
ipcMain.handle('project-read-blob', (_e, { dir, rel }) => projectFile.readBlob(dir, rel));
ipcMain.handle('project-has-blob', (_e, { dir, rel }) => projectFile.exists(dir, rel));
ipcMain.handle('project-prune', (_e, { dir, keep }) => projectFile.prune(dir, keep));

// Otomatik yedek: çalışma sürerken düzenli yazılır; temiz kapanışta ya da kayıttan sonra silinir.
ipcMain.handle('autosave-paths', () => ({ dir: autosaveDir(), file: autosaveFile() }));
ipcMain.handle('autosave-peek', async () => {
  try { return await fs.promises.readFile(autosaveFile(), 'utf8'); } catch { return null; }
});
ipcMain.handle('autosave-clear', () => fs.promises.rm(autosaveDir(), { recursive: true, force: true }));

// Dosyası bulunamayan şarkı için yeni konum seçtirir.
ipcMain.handle('locate-file', async (e, name) => {
  const { response } = await dialog.showMessageBox(winOf(e), {
    type: 'warning',
    message: `"${name}" bulunamadı`,
    detail: 'Dosya taşınmış ya da silinmiş olabilir. Yeni konumunu gösterirsen proje onunla devam eder.',
    buttons: ['Dosyayı Göster…', 'Bu Parçayı Atla'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(winOf(e), {
    title: `"${name}" dosyasını göster`,
    properties: ['openFile'],
    filters: [{ name: 'Ses dosyaları', extensions: AUDIO_EXTS }],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('confirm-unsaved', async (e, { name, action }) => {
  const { response } = await dialog.showMessageBox(winOf(e), {
    type: 'warning',
    message: `"${name}" projesindeki değişiklikler kaydedilsin mi?`,
    detail: `Kaydetmezsen ${action} sırasında yapılan değişiklikler kaybolur.`,
    buttons: ['Kaydet', 'Kaydetme', 'Vazgeç'],
    defaultId: 0,
    cancelId: 2,
  });
  return ['save', 'discard', 'cancel'][response];
});
ipcMain.handle('confirm-action', async (e, { message, detail, ok }) => {
  const { response } = await dialog.showMessageBox(winOf(e), {
    type: 'question', message, detail, buttons: [ok, 'Vazgeç'], defaultId: 0, cancelId: 1,
  });
  return response === 0;
});
ipcMain.handle('confirm-restore', async (e, info) => {
  const { response } = await dialog.showMessageBox(winOf(e), {
    type: 'question',
    message: 'Önceki oturumdan kaydedilmemiş bir çalışma bulundu',
    detail: `${info}\n\nGeri yüklemek ister misin?`,
    buttons: ['Geri Yükle', 'Sil'],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
});
ipcMain.handle('close-window', (e, ok) => {
  const win = winOf(e);
  if (!win) return;
  if (!ok) { win.quitRequested = false; return; }
  win.forceClose = true;
  const quit = win.quitRequested;
  win.close();
  if (quit) app.quit();
});
ipcMain.handle('set-title', (e, title) => winOf(e)?.setTitle(title));

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
