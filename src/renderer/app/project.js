'use strict';

// ------------------------------------------------------------------ eylemler
async function pickAndAdd() {
  const paths = await window.harman.pickFiles();
  if (paths.length) addFiles(paths);
}

function toggleHelp(show = el.help.hidden) { el.help.hidden = !show; }

// Giriş rehberi (tour.js): tanıtılan bölüm aydınlık kalır, geri kalanı kararır. İlk açılışta kendiliğinden
// başlar; atlanırsa Yardım menüsünden ya da kısayol penceresindeki "Rehberi başlat" düğmesinden açılır.
function markTourSeen() {
  try { localStorage.setItem('harman.welcomed', '1'); } catch { /* özel pencere */ }
}

async function startTour() {
  if (Tour.active) return;
  const st = await window.harman.envStatus();
  const check = (ok, title, note, extra = '') => `<li><span class="dot${ok ? '' : ' warn'}"></span><span>${title}<small>${note}</small>${extra}</span></li>`;
  const checks = `<ul class="checks">${[
    check(st.ffmpeg, 'ffmpeg', st.ffmpeg ? 'Bulundu: MP3 kaydetme ve tüm ses biçimleri çalışır.' : 'Bulunamadı. MP3 kaydetmek için gerekir; Terminal\'de şunu çalıştır:', st.ffmpeg ? '' : '<code>brew install ffmpeg</code>'),
    check(st.engine, 'Vokal / enstrüman ayırma', st.engine ? 'Kurulu.' : 'İlk kullanımda otomatik kurulur (yaklaşık 1 GB indirme, bir kez).'),
    check(st.tools, 'Tempo ve ton aracı', st.tools ? 'Kurulu.' : 'İlk kullanımda otomatik kurulur (küçük indirme, bir kez).'),
  ].join('')}</ul>`;
  const steps = [
    { title: 'Harman\'a hoş geldin', html: '<p>Şarkıları keserek, tempo ve tonlarını eşleştirerek ve yumuşak geçişlerle birleştirerek profesyonel görünümlü mix\'ler hazırla.</p><p>Kısa bir tur: yaklaşık bir dakika. İstediğin an atlayabilirsin; sonra <b>Yardım → Başlangıç Rehberi</b> ile tekrar açarsın.</p>' },
    { targets: ['#btn-add'], title: 'Şarkı ekle', html: '<p>Buradan ya da dosyaları pencereye sürükleyerek ekle (MP3, WAV, FLAC, M4A…). Her şarkı bir hatta gelir; tempo ve tonunu Harman kendisi analiz eder.</p><p>Birden çok şarkıyı ekleyince <b>Düzen → Şarkıları otomatik sırala ve karıştır</b> hepsini tek seferde dizer.</p>' },
    { targets: ['#timeline'], pad: 0, title: 'Zaman çizelgesi', html: '<p>Dört hat var. Parçaları sürükleyerek taşı, kenarlarından kes, <kbd>S</kbd> ile oynatma çizgisinden böl.</p><p>İki parçayı üst üste bindirip fade verirsen crossfade olur. Boş yerde sürükleyerek toplu seç, sağ tıkla menüleri aç.</p><p><kbd>M</kbd> oynatma çizgisine işaretçi koyar, <kbd>F2</kbd> seçili parçayı yeniden adlandırır. En altta alt çubuk seçili parçanın özetini gösterir.</p>' },
    { targets: ['.transport', '#lcd'], title: 'Oynatma ve sayaç', html: '<p><kbd>Boşluk</kbd> tıkladığın yerden çalar. Sayaca tıklayıp saniye yazarak istediğin yere git.</p><p><kbd>L</kbd> seçili parçayı ya da uyguladığın geçişi döngüde dinletir.</p>' },
    { targets: ['.zoom'], title: 'Yakınlaştırma', html: '<p><kbd>⌥</kbd> + kaydır ya da trackpad\'de sıkıştır. <kbd>⌘0</kbd> hepsini sığdırır.</p><p>Yakınlaştıkça vuruş çizgileri görünür; kesimleri vuruşa oturtmak kolaylaşır.</p>' },
    { targets: ['#inspector'], onEnter: () => document.body.classList.add('tour-demo-inspector'), onLeave: () => document.body.classList.remove('tour-demo-inspector'), title: 'Parça ayarları', html: '<p>Bir parçayı seçince burada: seviye, sol/sağ denge, bas ve tiz, BPM ve ton, başka bir parçaya tempo-ton eşleştirme, <b>Geçiş öner</b>, vokal/enstrüman ayırma ve fade.</p><p>Birden çok parça seçiliyse ayarlar hepsine birlikte uygulanır.</p>' },
    { targets: ['.switch-group', '#btn-export'], title: 'Kaydet ve dışa aktar', html: '<p>Normalize\'i aç ya da kapat ve <b>Mix\'i kaydet</b> düğmesine bas; MP3 mi WAV mı olacağını kaydetme penceresinde seçersin.</p><p><kbd>⌘S</kbd> projeni saklar; çalışırken 15 saniyede bir otomatik yedek alınır, beklenmedik kapanmada geri yüklenir.</p>' },
    { targets: ['#btn-help'], title: 'Kısayollar ve rehber', html: '<p>Tüm kısayollar ve hareketler burada (<kbd>⌘/</kbd>). Aynı pencerede <b>Rehberi başlat</b> düğmesi bu turu baştan açar; Yardım menüsünden de ulaşabilirsin.</p>' },
    { title: 'Kurulum durumu', html: `${checks}<p>Hepsi bu kadar. İyi karışımlar!</p>` },
  ];
  Tour.start(steps, {
    onEnd: (reason) => {
      markTourSeen();
      if (reason === 'skip') toast('Rehbere Yardım → Başlangıç Rehberi ya da ⌘/ penceresinden tekrar ulaşabilirsin');
    },
  });
}
$('help-tour').addEventListener('click', () => { toggleHelp(false); startTour(); });

// ------------------------------------------------------------------- proje
// Proje = .harman (JSON) + yanındaki .harman-data klasörü. Orijinal şarkılar dosya yoluyla bağlanır
// (kopyalanmaz); tempo/ton ile türetilmiş sesler ve ayrılmış parçalar 16-bit WAV olarak yan klasöre yazılır,
// böylece açınca yeniden ayırmak ya da işlemek gerekmez. Otomatik yedek aynı biçimi kullanır.
const PROJECT_VERSION = 1;
const AUTOSAVE_MS = 15000;

const project = {
  path: null,            // kayıtlı .harman dosyası (yoksa null)
  name: null,
  rev: 0,                // her değişiklikte artar
  savedRev: 0,           // son kayıtta/yedekte rev
  autosavedRev: 0,
  busy: false,           // kaydet/aç sürerken
  queue: Promise.resolve(),
  written: new Map(),    // klasör → yazılmış yan dosyalar
};
const bufferKeys = new WeakMap();   // AudioBuffer → yan dosya anahtarı
const stemKeys = new WeakMap();     // stems nesnesi → yan dosya anahtarı
const newKey = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const keyFor = (map, obj) => { if (!map.has(obj)) map.set(obj, newKey()); return map.get(obj); };
const writtenSet = (dir) => { if (!project.written.has(dir)) project.written.set(dir, new Set()); return project.written.get(dir); };

const isDirty = () => project.rev !== project.savedRev && (state.clips.length > 0 || !!project.path);
const projectLabel = () => project.name || (state.clips.length ? 'Adsız proje' : '');

function markDirty() {
  project.rev++;
  updateProjectUI();
}

function updateProjectUI() {
  const label = projectLabel();
  el.projectName.textContent = label ? `${label}${isDirty() ? ' •' : ''}` : '';
  el.projectName.title = project.path ? project.path : 'Henüz kaydedilmedi (⌘S ile kaydet)';
  el.projectName.hidden = !label;
  document.title = label ? `${label}${isDirty() ? ' •' : ''} — Harman` : 'Harman';
  window.harman.setTitle(document.title);
}

const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

// Bellekteki durumu JSON'a ve yazılacak yan dosya listesine çevirir.
function serializeProject() {
  const used = new Set();
  for (const clip of state.clips) {
    used.add(clip.srcId);
    const src = state.sources.get(clip.srcId);
    if (src.origin) used.add(src.origin.srcId);
  }
  const audio = {};
  const blobs = new Map();        // rel → () => ArrayBuffer
  const sources = [];
  for (const id of used) {
    const src = state.sources.get(id);
    const key = keyFor(bufferKeys, src.buffer);
    if (!audio[key]) {
      if (!src.origin && src.path) {
        audio[key] = { path: src.path };
      } else {
        const rel = `audio/${key}.wav`;
        audio[key] = { file: rel };
        blobs.set(rel, () => encodeWav(src.buffer));
      }
    }
    let stems = null;
    if (src.stems) {
      const sk = keyFor(stemKeys, src.stems);
      const names = Object.keys(src.stems);
      stems = { key: sk, names };
      for (const n of names) blobs.set(`stems/${sk}/${n}.wav`, () => encodeWav(src.stems[n].buffer));
    }
    sources.push({
      id, audio: key, stems,
      bpm: src.bpm ?? null, beatPhase: src.beatPhase ?? null, key: src.key ?? null,
      energy: src.energy ? Array.from(src.energy, (v) => round(v, 6)) : null, energyHop: src.energyHop ?? null,
      origin: src.origin ? { srcId: src.origin.srcId, rate: src.origin.rate, semis: src.origin.semis } : null,
    });
  }
  const data = {
    app: 'Harman', version: PROJECT_VERSION, savedAt: new Date().toISOString(),
    view: {
      pps: state.pps, scrollLeft: el.timeline.scrollLeft, playhead: state.playhead, marker: state.marker,
      trackOn: state.trackOn, normalize: state.normalize,
    },
    audio, sources,
    clips: state.clips.map((c) => Object.fromEntries(PARAM_KEYS.map((k) => [k, c[k]]))),
    markers: state.markers.map((m) => ({ t: m.t, name: m.name })),
  };
  return { data, blobs };
}

// JSON'u ve henüz yazılmamış yan dosyaları dir/file konumuna yazar; artık dosyaları siler.
async function writeProjectFiles(file, dir, extra = {}) {
  const { data, blobs } = serializeProject();
  Object.assign(data, extra);
  const done = writtenSet(dir);
  let i = 0;
  for (const [rel, encode] of blobs) {
    i++;
    if (done.has(rel)) continue;
    if (!(await window.harman.projectHasBlob(dir, rel))) {
      await window.harman.projectWriteBlob(dir, rel, encode());
    }
    done.add(rel);
    if (blobs.size > 8 && i % 4 === 0) await new Promise((r) => setTimeout(r)); // arayüze nefes aldır
  }
  await window.harman.projectWriteJson(file, JSON.stringify(data));
  await window.harman.projectPrune(dir, [...blobs.keys()]);
  for (const rel of [...done]) if (!blobs.has(rel)) done.delete(rel);
}

// Kaydet/aç/yedek işleri sırayla çalışır; ikisi aynı anda dosyaya yazmaz.
function enqueue(job) {
  const run = project.queue.then(job, job);
  project.queue = run.catch(() => {});
  return run;
}

async function saveProject(saveAs = false) {
  if (!state.clips.length && !project.path) { toast('Kaydedilecek bir şey yok'); return false; }
  let file = project.path;
  if (!file || saveAs) {
    file = await window.harman.projectSaveDialog(project.name || (state.clips[0] ? `${state.clips[0].name} mix` : 'Adsız proje'));
    if (!file) return false;
  }
  const rev = project.rev;
  try {
    toast('Kaydediliyor…');
    await enqueue(async () => {
      const dir = await window.harman.projectDataDir(file);
      await writeProjectFiles(file, dir);
    });
  } catch (err) {
    toast(`Kaydedilemedi: ${friendly(err.message)}`, true);
    return false;
  }
  project.path = file;
  project.name = file.split('/').pop().replace(/\.harman$/, '');
  project.savedRev = rev;
  updateProjectUI();
  window.harman.recentAdd(file).catch(() => {});
  window.harman.autosaveClear().catch(() => {});
  project.autosavedRev = rev;
  toast(`Kaydedildi: ${project.name}`);
  return true;
}

// Değişiklik varsa arka planda yedek yazar. Çökme ya da elektrik kesintisinde çalışma buradan geri gelir.
async function autosave() {
  if (project.busy || sep.running || !isDirty() || project.rev === project.autosavedRev) return;
  const rev = project.rev;
  try {
    await enqueue(async () => {
      const { dir, file } = await window.harman.autosavePaths();
      await writeProjectFiles(file, `${dir}/data`, { project: { path: project.path, name: project.name } });
    });
    project.autosavedRev = rev;
  } catch (err) {
    console.error('Otomatik yedek yazılamadı', err);
  }
}
setInterval(autosave, AUTOSAVE_MS);

// ---- açma
const decodeBytes = (bytes) => ctx.decodeAudioData(bytes);

// Proje JSON'unu belleğe yükler. Bir şey kalıcı olarak değişmeden önce her ses çözülür: yarıda hata olursa
// mevcut çalışma olduğu gibi kalır.
async function loadProject(data, dir, { path = null, name = null, dirty = false } = {}) {
  if (data.app !== 'Harman' || !Array.isArray(data.clips)) throw new Error('Bu bir Harman projesi değil');
  if (data.version > PROJECT_VERSION) throw new Error('Bu proje daha yeni bir Harman sürümüyle kaydedilmiş');
  const missing = [];
  const keys = Object.keys(data.audio);
  const buffers = new Map();       // audio anahtarı → { buffer, peaks, path }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const a = data.audio[key];
    setSepProgress({ text: 'Ses dosyaları yükleniyor', detail: `${i + 1} / ${keys.length}`, pct: (i / keys.length) * 100 });
    let buffer = null;
    let apath = a.path;
    try {
      if (a.file) {
        const bytes = await window.harman.projectReadBlob(dir, a.file);
        if (bytes) buffer = await decodeBytes(bytes);
      } else {
        try {
          buffer = await decodeFile(apath);
        } catch {
          const base = apath.split('/').pop();
          const found = await window.harman.locateFile(base);
          if (found) { apath = found; buffer = await decodeFile(found); }
        }
      }
    } catch (err) {
      console.error('Ses yüklenemedi', a, err);
    }
    if (buffer) buffers.set(key, { buffer, peaks: computePeaks(buffer), path: a.path ? apath : null });
    else missing.push(a.path ? a.path.split('/').pop() : 'türetilmiş ses');
  }

  const stemSets = new Map();      // stems anahtarı → { isim: { buffer, peaks } } | null
  const stemRefs = data.sources.filter((s) => s.stems).map((s) => s.stems);
  for (const ref of stemRefs) {
    if (stemSets.has(ref.key)) continue;
    setSepProgress({ text: 'Ayrılmış parçalar yükleniyor', pct: null });
    const set = {};
    let ok = true;
    for (const n of ref.names) {
      const bytes = await window.harman.projectReadBlob(dir, `stems/${ref.key}/${n}.wav`);
      if (!bytes) { ok = false; break; }
      const buffer = await decodeBytes(bytes);
      set[n] = { buffer, peaks: computePeaks(buffer) };
    }
    stemSets.set(ref.key, ok ? set : null);
  }

  // --- her şey çözüldü: şimdi mevcut durumu değiştir
  pause();
  state.clips.forEach((c) => c.el.remove());
  state.clips = [];
  state.sources.clear();
  state.undo = [];
  state.redo = [];
  state.pending = null;
  setSelection([]);
  tempo.refId = null;
  tempo.forClip = null;
  state.nextId = 1;
  state.loop = null;
  state.markers = [];

  const idMap = new Map();
  for (const s of data.sources) idMap.set(s.id, state.nextId++);
  let lostStems = false;
  for (const s of data.sources) {
    const b = buffers.get(s.audio);
    if (!b) continue;
    const stems = s.stems ? stemSets.get(s.stems.key) : null;
    if (s.stems && !stems) lostStems = true;
    if (stems) stemKeys.set(stems, s.stems.key);
    bufferKeys.set(b.buffer, s.audio);
    const src = {
      buffer: b.buffer, peaks: b.peaks, path: b.path, stems: stems || undefined,
      bpm: s.bpm ?? undefined, beatPhase: s.beatPhase ?? undefined, key: s.key ?? undefined,
      energy: s.energy ? Float32Array.from(s.energy) : undefined, energyHop: s.energyHop ?? undefined,
      analysis: s.bpm != null ? 'done' : undefined,
    };
    if (s.origin) {
      src.origin = { srcId: idMap.get(s.origin.srcId), rate: s.origin.rate, semis: s.origin.semis };
    } else {
      src.derived = new Map();
    }
    state.sources.set(idMap.get(s.id), src);
  }
  for (const [id, src] of state.sources) {
    if (!src.origin) continue;
    const root = state.sources.get(src.origin.srcId);
    if (!root) { state.sources.delete(id); continue; }
    root.derived.set(`${src.origin.rate.toFixed(5)}:${src.origin.semis}`, id);
  }

  const dropped = [];
  for (const p of data.clips) {
    const srcId = idMap.get(p.srcId);
    const src = state.sources.get(srcId);
    if (!src) { dropped.push(p.name); continue; }
    const clip = { ...p, id: state.nextId++, srcId, buffer: src.buffer, peaks: src.peaks };
    if (clip.stemGains && !src.stems) clip.stemGains = undefined;
    state.clips.push(clip);
    createClipElement(clip);
  }
  for (const [id, src] of state.sources) { if (src.analysis !== 'done') queueAnalysis(id); else addToLibrary(src); }

  state.markers = (data.markers || []).map((m) => ({ id: state.nextId++, t: m.t, name: m.name }));
  const v = data.view || {};
  state.trackOn = (v.trackOn || [true, true, true, true]).slice(0, TRACK_COUNT);
  trackChecks.forEach((c, i) => c.setAttribute('aria-checked', String(state.trackOn[i])));
  state.normalize = v.normalize !== false;
  el.normalize.setAttribute('aria-checked', String(state.normalize));
  state.playhead = v.playhead || 0;
  state.marker = v.marker || 0;
  state.clips.forEach((c) => c.el.classList.toggle('muted', !state.trackOn[c.track]));
  setZoom(v.pps || state.pps);
  layoutAll();
  el.timeline.scrollLeft = v.scrollLeft || 0;
  redrawVisible();
  updatePlayheadUI();

  project.path = path;
  project.name = name;
  project.written = new Map();
  const done = writtenSet(dir);
  for (const rel of Object.values(data.audio).map((a) => a.file).filter(Boolean)) done.add(rel);
  for (const ref of stemRefs) if (stemSets.get(ref.key)) for (const n of ref.names) done.add(`stems/${ref.key}/${n}.wav`);
  project.savedRev = project.rev;
  project.autosavedRev = project.rev;
  if (dirty) markDirty();
  updateProjectUI();

  const notes = [];
  if (dropped.length) notes.push(`${dropped.length} parça açılamadı (${[...new Set(dropped)].join(', ')})`);
  if (lostStems) notes.push('ayrılmış parçalar bulunamadı, yeniden ayırman gerekir');
  return notes;
}

async function openProjectFile(file, opts = {}) {
  const text = await window.harman.projectReadJson(file);
  const data = JSON.parse(text);
  const dir = opts.dir || (await window.harman.projectDataDir(file));
  let notes = [];
  const ok = await runBusy('Proje açılıyor', async () => {
    notes = await loadProject(data, dir, opts.keep ?? { path: file, name: file.split('/').pop().replace(/\.harman$/, '') });
  });
  if (ok && project.path) window.harman.recentAdd(project.path).catch(() => {});
  if (ok) toast(notes.length ? `Proje açıldı, ama ${notes.join('; ')}` : `Proje açıldı: ${project.name || 'Adsız proje'}`, notes.length > 0);
  return ok;
}

// Kaydedilmemiş değişiklik varsa sorar. true → devam edilebilir.
async function confirmDiscard(action) {
  if (!isDirty()) return true;
  const choice = await window.harman.confirmUnsaved(projectLabel(), action);
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveProject();
  return true;
}

// Verilen yoldaki projeyi açar (Son Açılanlar menüsü, Dock'a bırakma, çift tıklama).
async function openProjectPath(file) {
  if (!file || !(await confirmDiscard('açarken'))) return;
  try { await openProjectFile(file); } catch (err) { toast(`Proje açılamadı: ${friendly(err.message)}`, true); }
}
window.harman.onOpenProject(openProjectPath);

async function projectOpen() {
  const file = await window.harman.projectOpenDialog();
  if (!file) return;
  if (!(await confirmDiscard('açarken'))) return;
  try { await openProjectFile(file); } catch (err) { toast(`Proje açılamadı: ${friendly(err.message)}`, true); }
}

async function projectNew() {
  if (!state.clips.length && !project.path) return;
  if (!(await confirmDiscard('yeni proje açarken'))) return;
  pause();
  state.clips.forEach((c) => c.el.remove());
  state.clips = [];
  state.sources.clear();
  state.undo = [];
  state.redo = [];
  state.pending = null;
  setSelection([]);
  tempo.refId = null;
  tempo.forClip = null;
  state.playhead = 0;
  state.marker = 0;
  state.loop = null;
  state.markers = [];
  project.path = null;
  project.name = null;
  project.written = new Map();
  project.savedRev = project.rev = project.autosavedRev = 0;
  layoutAll();
  updateProjectUI();
  window.harman.autosaveClear().catch(() => {});
}

// Pencere kapanmak istediğinde (ya da uygulamadan çıkılırken) ana süreç sorar.
window.harman.onCloseRequest(async () => {
  try {
    if (!(await confirmDiscard('kapatırken'))) { window.harman.closeWindow(false); return; }
    await window.harman.autosaveClear();
  } catch (err) {
    console.error(err);
  }
  window.harman.closeWindow(true);
});

// Açılışta: önceki oturum düzgün kapanmadıysa yedekten geri yüklemeyi önerir.
async function offerRestore() {
  try {
    const text = await window.harman.autosavePeek();
    if (!text) return;
    const data = JSON.parse(text);
    if (!data.clips?.length) { window.harman.autosaveClear(); return; }
    const when = new Date(data.savedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    const label = data.project?.name || 'Adsız proje';
    const wanted = await window.harman.confirmRestore(`${label}: ${data.clips.length} parça, ${when} tarihinde yedeklendi.`);
    if (!wanted) { window.harman.autosaveClear(); return; }
    const { dir } = await window.harman.autosavePaths();
    const ok = await runBusy('Yedek geri yükleniyor', async () => {
      await loadProject(data, `${dir}/data`, { path: data.project?.path || null, name: data.project?.name || null, dirty: true });
    });
    if (ok) toast('Yedek geri yüklendi. ⌘S ile kaydet');
  } catch (err) {
    toast(`Yedek açılamadı: ${friendly(err.message)}`, true);
  }
}

const actions = {
  add: pickAndAdd,
  export: exportMix,
  'export-split': exportSplit,
  'export-stems': exportStems,
  'project-save': () => saveProject(),
  'project-save-as': () => saveProject(true),
  'project-open': projectOpen,
  'project-new': projectNew,
  undo, redo,
  split: splitSelected,
  duplicate: duplicateSelected,
  separate: openSeparate,
  copy: () => copySelected(),
  cut: () => cutSelected(),
  paste: () => pasteClips(),
  selectall: () => { setSelection(state.clips.map((c) => c.id)); syncSelectionUI(); },
  reset: () => { if (!el.insReset.disabled && selected()) el.insReset.click(); else toast('Bu parçada sıfırlanacak bir değişiklik yok'); },
  match: showMatchPanel,
  delete: deleteSelected,
  play: togglePlay,
  loop: toggleLoop,
  history: () => toggleHistory(true),
  'marker-add': () => addMarkerAt(state.playhead),
  'open-recent': (file) => openProjectPath(file),
  'step-back': () => movePlayhead(state.playhead - fineStep()),
  'step-forward': () => movePlayhead(state.playhead + fineStep()),
  'edge-back': () => jumpToEdge(-1),
  'edge-forward': () => jumpToEdge(1),
  'snap-beats': (value) => { state.snapBeats = value ?? !state.snapBeats; updateStatus(); toast(state.snapBeats ? 'Vuruşa yapışma açık' : 'Vuruşa yapışma kapalı'); },
  automix,
  start: () => { goTo(0); el.timeline.scrollLeft = 0; },
  end: () => goTo(projectEnd()),
  'zoom-in': () => zoomBy(1.4),
  'zoom-out': () => zoomBy(1 / 1.4),
  fit: fitAll,
  help: () => toggleHelp(),
  welcome: startTour,
};
