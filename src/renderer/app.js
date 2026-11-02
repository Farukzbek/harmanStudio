'use strict';

// ---------------------------------------------------------------- sabitler
const SAMPLE_RATE = 44100;
const TRACK_COUNT = 4;
const TRACK_NAMES = ['1', '2', '3', '4'];
const TRACK_HUES = [205, 28, 160, 275];
const CLIP_HUES = [205, 28, 160, 275, 350, 48, 190, 310];     // parça rengi seçenekleri (yan panel)
const GUTTER = 64;
const TRACK_H = 88;             // css --track-h ile aynı              // hat etiketlerinin genişliği (px)
const HEADER_H = 18;            // parça başlık şeridi (px)
const RULER_H = 28;
const PEAK_BUCKET = 256;        // dalga formu için 256 örnekte bir tepe değeri
const MIN_CLIP = 0.05;          // saniye
const MAX_FADE = 20;            // saniye
const DECLICK = 0.003;          // kesim noktalarında tık sesini önleyen mikro fade
const FADE_STEPS = 16;          // eşit güç eğrisini bu kadar parçada yaklaşıklarız
const SNAP_PX = 8;
const PPS_MIN = 0.5;            // yakınlık: saniye başına piksel
const PPS_MAX = 240;
const UNDO_LIMIT = 100;
const PARAM_KEYS = ['id', 'srcId', 'name', 'track', 'start', 'offset', 'dur', 'fadeIn', 'fadeOut', 'gain', 'stemGains', 'pan', 'stemPans', 'stemRamps', 'eqLow', 'eqHigh', 'bassSwap', 'hue', 'mute', 'solo'];
const STEM_ORDER = ['vocals', 'instrumental', 'drums', 'bass', 'guitar', 'piano', 'other'];
const STEM_LABELS = {
  vocals: 'Vokal', instrumental: 'Enstrüman', drums: 'Davul', bass: 'Bas',
  guitar: 'Gitar', piano: 'Piyano', other: 'Diğer sesler',
};
// [büyük çizgi aralığı (sn), iki büyük çizgi arasındaki küçük çizgi sayısı]
const RULER_STEPS = [[0.5, 5], [1, 5], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6], [60, 6], [120, 4], [300, 5], [600, 5], [1800, 6]];

const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });

// ----------------------------------------------------------------- durum
const state = {
  clips: [],
  sources: new Map(),           // srcId → { buffer, peaks, path, stems? }; geri alma için tutulur
  selectedId: null,             // birincil seçili klip (yan panel bunu gösterir)
  selection: new Set(),         // seçili tüm klipler (toplu seçim)
  trackOn: [true, true, true, true],   // hat çalsın mı (kutucuk)
  pps: 20,
  playhead: 0,                  // saniye
  marker: 0,                    // son tıklanan yer: Boşluk hep buradan başlatır
  playing: null,                // { sources, startPlayhead, base }
  nextId: 1,
  undo: [],
  redo: [],
  pending: null,                // süren bir düzenlemenin başlangıç görüntüsü
  normalize: true,
  snapBeats: true,              // kırpma ve bölmede vuruşa yapış (Görünüm menüsü)
  markers: [],                  // [{ id, t, name }] isimli noktalar (cetvelde bayrak olarak görünür)
  loop: null,                   // { from, to } saniye: çalarken bu aralık tekrarlanır
};
const keys = { ctrl: false };   // gerçek Ctrl tuşu (trackpad sıkıştırmasından ayırt etmek için)

const $ = (id) => document.getElementById(id);
const el = {
  timeline: $('timeline'), ruler: $('ruler'), rulerCanvas: $('ruler-canvas'), tracks: $('tracks'),
  playhead: $('playhead'), empty: $('empty'), time: $('time'), timeMin: $('time-min'), total: $('total'), toast: $('toast'),
  zoom: $('zoom'), btnPlay: $('btn-play'), btnStart: $('btn-start'), btnAdd: $('btn-add'),
  btnExport: $('btn-export'), normalize: $('normalize'),
  insEmpty: $('inspector-empty'), insBody: $('inspector-body'), insName: $('ins-name'), insChip: $('ins-chip'),
  insStart: $('ins-start'), insDur: $('ins-dur'),
  insGain: $('ins-gain'), insGainVal: $('ins-gain-val'),
  insFadeIn: $('ins-fadein'), insFadeInVal: $('ins-fadein-val'),
  insFadeOut: $('ins-fadeout'), insFadeOutVal: $('ins-fadeout-val'),
  help: $('help'), bubble: $('bubble'), insReset: $('ins-reset'),
  insPan: $('ins-pan'), insPanVal: $('ins-pan-val'),
  stemsNone: $('stems-none'), stemsReady: $('stems-ready'), stemsList: $('stems-list'),
  sep: $('sep'), sepClip: $('sep-clip'), sepModels: $('sep-models'), sepNote: $('sep-note'),
  sepChoose: $('sep-choose'), sepRun: $('sep-run'), sepPhase: $('sep-phase'),
  sepBar: $('sep-bar'), sepDetail: $('sep-detail'), sepStart: $('sep-start'), sepStop: $('sep-stop'),
  sepTitle: $('sep-title'),
  tempoStatus: $('tempo-status'), tempoReady: $('tempo-ready'),
  bpmInput: $('bpm-input'), bpmTap: $('bpm-tap'), bpmHalf: $('bpm-half'), bpmDouble: $('bpm-double'),
  keyTonic: $('key-tonic'), keyMode: $('key-mode'), keyCode: $('key-code'),
  matchBox: $('match-box'), matchRef: $('match-ref'),
  matchTempo: $('match-tempo'), matchTempoText: $('match-tempo-text'),
  matchKey: $('match-key'), matchKeyText: $('match-key-text'),
  semiMinus: $('semi-minus'), semiPlus: $('semi-plus'), matchWarn: $('match-warn'),
  matchApply: $('match-apply'), matchAlign: $('match-align'), matchReset: $('match-reset'),
  projectName: $('project-name'), history: $('history'), historyList: $('history-list'), meterBar: $('st-meter-bar'), peakText: $('st-peak'), meter: $('st-meter'), libFind: $('lib-find'), libList: $('lib-list'), libHint: $('lib-hint'), transTemplate: $('trans-template'), tplSave: $('trans-template-save'), tplDel: $('trans-template-del'), tplForm: $('trans-template-form'), tplName: $('trans-template-name'), tplOk: $('trans-template-ok'), insMute: $('ins-mute'), insSolo: $('ins-solo'), stProject: $('st-project'), stSelection: $('st-selection'), stModes: $('st-modes'), insColors: $('ins-colors'), loopBand: $('loop-band'), insMulti: $('ins-multi'), insBass: $('ins-bass'), insBassVal: $('ins-bass-val'), insTreble: $('ins-treble'), insTrebleVal: $('ins-treble-val'), insSwap: $('ins-swap'), transBass: $('trans-bass'), insLevel: $('ins-level'), transBeats: $('trans-beats'), transFind: $('trans-find'), transList: $('trans-list'),
};

// ------------------------------------------------------- ayrılmış ses parçaları
const sourceOf = (clip) => state.sources.get(clip.srcId);

// Her parçanın kendi kaynak kaydı olur: bölünen, çoğaltılan, yapıştırılan parçalar artık "aynı şarkı"
// sayılmaz. BPM/ton düzeltmesi, vokal ayırma sonucu ve tempo/ton türevleri parça başınadır.
// Ses verisi (AudioBuffer) paylaşılır, yani bellekte ikinci kopya oluşmaz.
function cloneSource(srcId) {
  const src = state.sources.get(srcId);
  const copy = (entry) => {
    const id = state.nextId++;
    const clone = { ...entry, derived: undefined };
    state.sources.set(id, clone);
    return [id, clone];
  };
  if (!src.origin) {
    const [id, clone] = copy(src);
    clone.derived = new Map();
    return id;
  }
  // Türetilmiş (tempo/ton değişmiş) kaynak: orijinalini de klonla, yeni türev ona bağlansın.
  const [rootId, rootClone] = copy(state.sources.get(src.origin.srcId));
  rootClone.derived = new Map();
  const [id, clone] = copy(src);
  clone.origin = { ...src.origin, srcId: rootId };
  rootClone.derived.set(`${src.origin.rate.toFixed(5)}:${src.origin.semis}`, id);
  return id;
}
const hasStems = (clip) => !!clip.stemGains && !!sourceOf(clip)?.stems;
const stemGain = (clip, name) => clip.stemGains?.[name] ?? 1;
function stemNames(clip) {
  const stems = sourceOf(clip)?.stems;
  if (!stems) return [];
  const names = Object.keys(stems);
  return [...STEM_ORDER.filter((n) => names.includes(n)), ...names.filter((n) => !STEM_ORDER.includes(n))];
}

const BUCKET_SEC = PEAK_BUCKET / SAMPLE_RATE;
const stemPan = (clip, name) => clip.stemPans?.[name] ?? 0;
const stemRamps = (clip, name) => clip.stemRamps?.[name] || [];
const STEM_COLORS = {
  vocals: '#ff9f6e', drums: '#6fd49a', bass: '#6fb6ff', other: '#d6a2ff',
  instrumental: '#d6a2ff', guitar: '#ffd166', piano: '#ff8fb1',
};

// Zamanlı geçişler. Her geçiş şarkının start → end saniyeleri arasında bir değeri from'dan to'ya
// doğrusal olarak götürür. Seviye (from/to, 0..1) ve yön (panFrom/panTo, -1 sol … +1 sağ) bağımsızdır;
// bir geçişte ikisi birden ya da yalnızca biri olabilir.
// Eğri: ilk geçişten önce ilk "from" değerinde durur, geçişler arasında bir öncekinin "to" değerinde
// kalır, son geçişten sonra son "to" değerinde kalır. Geçiş yoksa taban (kaydırıcı) değeri geçerlidir.
function buildCurve(ramps, fromKey, toKey, base) {
  const pts = [];
  let prev = null;
  for (const r of ramps) {
    if (r[toKey] === undefined) continue;
    const from = r[fromKey] ?? prev ?? base;
    if (prev === null) {
      pts.push({ t: Math.min(0, r.start), v: from });
    } else if (Math.abs(from - prev) > 1e-6 && r.start - 0.01 > pts[pts.length - 1].t) {
      pts.push({ t: r.start - 0.01, v: prev });      // önceki değeri geçişin hemen öncesine kadar tut
    }
    pts.push({ t: r.start, v: from }, { t: r.end, v: r[toKey] });
    prev = r[toKey];
  }
  return pts;
}

function curveAt(pts, t, base) {
  if (!pts.length) return base;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    }
  }
  return pts[pts.length - 1].v;
}

const hasLevelRamps = (clip, name) => stemRamps(clip, name).some((r) => r.to !== undefined);
const hasPanRamps = (clip, name) => stemRamps(clip, name).some((r) => r.panTo !== undefined);
const levelCurve = (clip, name) => buildCurve(stemRamps(clip, name), 'from', 'to', stemGain(clip, name));
const panCurve = (clip, name) => buildCurve(stemRamps(clip, name), 'panFrom', 'panTo', stemPan(clip, name));
const stemLevelAt = (clip, name, srcT) => curveAt(levelCurve(clip, name), srcT, stemGain(clip, name));

// Ekrandaki dalga formu: açık olan parçaların (seviye ve geçişleriyle) birleşimi.
function clipPeaks(clip) {
  if (!hasStems(clip)) return clip.peaks;
  const names = stemNames(clip);
  const key = `${clip.srcId}:` + names.map((n) => `${stemGain(clip, n)}|${JSON.stringify(stemRamps(clip, n))}`).join(',');
  if (clip.peakKey === key) return clip.mixPeaks;
  const stems = sourceOf(clip).stems;
  const out = new Float32Array(clip.peaks.length);
  for (const n of names) {
    const g = stemGain(clip, n);
    const ramped = hasLevelRamps(clip, n);
    if (!g && !ramped) continue;
    const p = stems[n].peaks;
    const curve = ramped ? levelCurve(clip, n) : null;
    for (let i = 0; i < out.length; i++) {
      const level = ramped ? curveAt(curve, i * BUCKET_SEC, g) : g;
      const v = (p[i] || 0) * level;
      out[i] += v * v;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(out[i]);
  clip.peakKey = key;
  clip.mixPeaks = out;
  return out;
}

const clipEnd = (c) => c.start + c.dur;
// Parçanın rengi: elle seçilmediyse hattınki.
const clipHue = (clip) => clip.hue ?? TRACK_HUES[clip.track];
// Sessize alma ve solo (parça başına): solo varsa yalnızca solo'lu parçalar duyulur.
const anySolo = () => state.clips.some((c) => c.solo);
const isAudible = (clip) => !clip.mute && (!anySolo() || !!clip.solo);
const selected = () => state.clips.find((c) => c.id === state.selectedId) || null;
const projectEnd = () => state.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
// Teknik hata iletilerini anlaşılır Türkçeye çevirir; tanınmayanlar olduğu gibi kalır.
function friendly(message) {
  const m = String(message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const rules = [
    [/ENOENT|no such file/i, 'Dosya bulunamadı. Taşınmış ya da silinmiş olabilir.'],
    [/ENOSPC|no space left/i, 'Diskte yeterli boş yer yok. Yer açıp tekrar dene.'],
    [/EACCES|EPERM|permission denied/i, 'Dosyaya erişim izni yok. Konumu ya da izinleri kontrol et.'],
    [/out of memory|MemoryError|Cannot allocate|kIOGPU|insufficient memory/i, 'Bellek yetmedi. Diğer uygulamaları kapatıp tekrar dene ya da daha hızlı bir model seç.'],
    [/ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|getaddrinfo|network|Could not resolve/i, 'İnternet bağlantısı gerekiyor (ilk kurulumda indirme yapılır). Bağlantını kontrol edip tekrar dene.'],
    [/Unable to decode audio data|EncodingError/i, 'Bu ses dosyası çözülemedi: bozuk ya da desteklenmeyen bir biçim olabilir. ffmpeg kuruluysa tekrar dene.'],
    [/ffmpeg/i, m],
  ];
  const hit = rules.find(([re]) => re.test(m));
  const text = hit ? hit[1] : m;
  return hit && text !== m && m.length < 200 ? `${text} (${m})` : text;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function formatTime(t, decimals = 1) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, '0')}`;
}

let toastTimer = null;
function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.className = 'toast' + (isError ? ' error' : '');
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 6000 : 2200);
}

// ------------------------------------------------------------ geri al / yinele
const snapshot = () => JSON.stringify({ c: state.clips.map((c) => Object.fromEntries(PARAM_KEYS.map((k) => [k, c[k]]))), m: state.markers });

function commitUndo(before) {
  markDirty();
  state.undo.push(before);
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  state.redo.length = 0;
}

// Bir düzenleme hareketi başlarken çağrılır; bittiğinde endEdit() değişiklik olduysa kaydeder.
function beginEdit() { if (state.pending === null) state.pending = snapshot(); }
function endEdit() {
  if (state.pending === null) return;
  if (state.pending !== snapshot()) commitUndo(state.pending);
  state.pending = null;
}
function mutate(fn) { beginEdit(); fn(); endEdit(); }

// Birden çok düzenlemeyi (ör. tempo + konum + fade) tek geri alma adımına toplar.
async function groupUndo(fn) {
  const depth = state.undo.length;
  const before = snapshot();
  try {
    await fn();
  } finally {
    if (state.undo.length > depth) {
      state.undo.length = depth;
      if (snapshot() !== before) commitUndo(before);
    }
  }
}

function restore(snap) {
  state.clips.forEach((c) => c.el.remove());
  const data = JSON.parse(snap);
  state.markers = data.m || [];
  state.clips = data.c.map((p) => {
    const src = state.sources.get(p.srcId);
    const clip = { ...p, buffer: src.buffer, peaks: src.peaks };
    createClipElement(clip);
    return clip;
  });
  state.selection = new Set([...state.selection].filter((id) => state.clips.some((c) => c.id === id)));
  if (!state.selection.has(state.selectedId)) state.selectedId = [...state.selection][0] ?? null;
  layoutAll();
  onEdited();
}

function undo({ quiet = false } = {}) {
  if (!state.undo.length) return quiet || toast('Geri alınacak bir şey yok');
  state.redo.push(snapshot());
  markDirty();
  restore(state.undo.pop());
  if (!quiet) toast('Geri alındı');
}

function redo({ quiet = false } = {}) {
  if (!state.redo.length) return quiet || toast('Yinelenecek bir şey yok');
  state.undo.push(snapshot());
  markDirty();
  restore(state.redo.pop());
  if (!quiet) toast('Yinelendi');
}

// ------------------------------------------------------------ ses yükleme
function computePeaks(buffer) {
  const n = Math.ceil(buffer.length / PEAK_BUCKET);
  const peaks = new Float32Array(n);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      let max = 0;
      const end = Math.min(data.length, (i + 1) * PEAK_BUCKET);
      for (let j = i * PEAK_BUCKET; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      if (max > peaks[i]) peaks[i] = max;
    }
  }
  return peaks;
}

async function decodeFile(path) {
  const raw = await window.harman.readFile(path);
  try {
    return await ctx.decodeAudioData(raw.slice(0));
  } catch {
    // Chromium çözemezse ffmpeg ile WAV'a çevirip tekrar dene.
    const wav = await window.harman.convertToWav(path);
    return ctx.decodeAudioData(wav);
  }
}

async function addFiles(paths) {
  for (const path of paths) {
    const name = path.split('/').pop().replace(/\.[^.]+$/, '');
    toast(`Yükleniyor: ${name}`);
    try {
      addClip(name, await decodeFile(path), path);
    } catch (err) {
      toast(`"${name}" açılamadı: ${friendly(err.message)}`, true);
    }
  }
}

function addClip(name, buffer, path = null) {
  let clipSrc = null;
  mutate(() => {
    const srcId = state.nextId++;
    clipSrc = srcId;
    const peaks = computePeaks(buffer);
    state.sources.set(srcId, { buffer, peaks, path });
    // Parçalar 1/2 numaralı hatlara sırayla, bir öncekinin bittiği yere konur.
    // Üst üste bindirip geçiş yapmak için sola sürüklemek yeterli.
    const clip = {
      id: state.nextId++, srcId, name, buffer, peaks,
      track: state.clips.length % 2, start: state.clips.length ? projectEnd() : 0,
      offset: 0, dur: buffer.duration, fadeIn: 0, fadeOut: 0, gain: 1,
    };
    state.clips.push(clip);
    createClipElement(clip);
    setSelection([clip.id]);
  });
  queueAnalysis(clipSrc);
  layoutAll();
  toast(`Eklendi: ${name}`);
}

// ------------------------------------------------------- zaman çizelgesi UI
const trackChecks = [];

function buildTracks() {
  el.tracks.replaceChildren();
  trackChecks.length = 0;
  for (let i = 0; i < TRACK_COUNT; i++) {
    const track = document.createElement('div');
    track.className = 'track';
    const label = document.createElement('div');
    label.className = 'track-label';
    const wrap = document.createElement('div');
    wrap.className = 'badge-wrap';
    const badge = document.createElement('span');
    badge.textContent = TRACK_NAMES[i];
    badge.style.setProperty('--hue', TRACK_HUES[i]);
    // Sağ alttaki küçük kutucuk: işaretliyse bu hattaki parçalar çalar, değilse sessiz kalır.
    const check = document.createElement('button');
    check.className = 'track-check';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', 'true');
    check.title = `${TRACK_NAMES[i]}. hat çalsın (kapatırsan bu hattaki parçalar sessiz kalır)`;
    check.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.4l2.3 2.3 4.7-5"/></svg>';
    check.addEventListener('pointerdown', (e) => e.stopPropagation());
    check.addEventListener('click', () => toggleTrack(i));
    trackChecks.push(check);
    wrap.append(badge, check);
    label.appendChild(wrap);
    const lane = document.createElement('div');
    lane.className = 'track-lane';
    track.append(label, lane);
    el.tracks.appendChild(track);
  }
}

function toggleTrack(i) {
  state.trackOn[i] = !state.trackOn[i];
  markDirty();
  trackChecks[i].setAttribute('aria-checked', String(state.trackOn[i]));
  updateStatus();
  state.clips.forEach((c) => { if (c.track === i) c.el.classList.toggle('muted', !state.trackOn[i]); });
  // Çalarken yeniden başlatmadan yumuşakça aç/kapat.
  state.playing?.trackNodes[i].gain.setTargetAtTime(state.trackOn[i] ? 1 : 0, ctx.currentTime, 0.01);
}

const laneOf = (i) => el.tracks.children[i].querySelector('.track-lane');

function createClipElement(clip) {
  const node = document.createElement('div');
  node.className = 'clip';
  node.innerHTML = `
    <div class="clip-head"><span class="clip-title"></span><span class="clip-flag"></span><span class="clip-tag"></span></div>
    <canvas class="clip-wave"></canvas>
    <div class="edge l" data-mode="trimL"></div>
    <div class="edge r" data-mode="trimR"></div>
    <div class="fade-handle fi" data-mode="fadeIn" title="Fade in"></div>
    <div class="fade-handle fo" data-mode="fadeOut" title="Fade out"></div>`;
  node.querySelector('.clip-title').textContent = clip.name;
  node.dataset.clipId = clip.id;
  clip.el = node;
  clip.canvas = node.querySelector('canvas');
  node.addEventListener('pointerdown', (e) => beginDrag(e, clip));
  node.querySelector('.clip-head').addEventListener('dblclick', () => beginRename(clip));
  laneOf(clip.track).appendChild(node);
}

// Parçanın konumunu ve boyutunu ayarlar (çizim ayrı).
function positionClip(clip) {
  const w = Math.max(2, clip.dur * state.pps);
  clip.el.style.left = `${clip.start * state.pps}px`;
  clip.el.style.width = `${w}px`;
  clip.el.style.setProperty('--hue', clipHue(clip));
  clip.el.classList.toggle('selected', state.selection.has(clip.id));
  clip.el.classList.toggle('muted', !state.trackOn[clip.track] || !isAudible(clip));
  clip.el.classList.toggle('soloed', !!clip.solo);
  clip.el.querySelector('.clip-flag').textContent = clip.mute ? 'SESSİZ' : clip.solo ? 'SOLO' : '';
  clip.el.querySelector('.clip-tag').textContent = tagText(clip);
  clip.el.querySelector('.fi').style.left = `${clip.fadeIn * state.pps}px`;
  clip.el.querySelector('.fo').style.left = `${w - clip.fadeOut * state.pps}px`;
}

function layoutClip(clip) {
  positionClip(clip);
  drawClip(clip);
}

// Yalnızca ekranda görünen kısmı çizer; böylece çok yakınlaştırınca da keskin kalır.
function drawClip(clip) {
  const view = el.timeline;
  const pps = state.pps;
  const wPx = clip.dur * pps;
  const left = GUTTER + clip.start * pps;
  const lo = clamp(view.scrollLeft - left - 120, 0, wPx);
  const hi = clamp(view.scrollLeft + view.clientWidth - left + 120, 0, wPx);
  const cv = clip.canvas;
  const visW = Math.ceil(hi - lo);
  if (visW <= 0) { cv.width = 0; return; }

  const dpr = window.devicePixelRatio || 1;
  const cssH = cv.clientHeight || 56;
  cv.style.left = `${lo}px`;
  cv.style.width = `${visW}px`;
  cv.width = Math.round(visW * dpr);
  cv.height = Math.round(cssH * dpr);

  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const mid = H / 2;
  const hue = clipHue(clip);
  const bucketSec = PEAK_BUCKET / SAMPLE_RATE;
  const secPerDevPx = 1 / (pps * dpr);
  const peaks = clipPeaks(clip);

  g.fillStyle = `hsl(${hue} 62% 76%)`;
  for (let x = 0; x < W; x++) {
    const t = clip.offset + lo / pps + x * secPerDevPx;
    const i0 = Math.floor(t / bucketSec);
    const i1 = Math.max(i0 + 1, Math.floor((t + secPerDevPx) / bucketSec));
    let peak = 0;
    for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > peak) peak = peaks[i];
    const amp = Math.min(1, peak * clip.gain) * 0.92 * mid;
    g.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
  }

  const toX = (cssX) => (cssX - lo) * dpr;

  // Vuruş çizgileri: yeterince yakınlaşınca analizdeki ızgara görünür (her 4 vuruş biraz daha belirgin).
  // Kesim ve geçiş noktalarını vuruşa oturtmayı kolaylaştırır.
  const bsrc = sourceOf(clip);
  if (bsrc?.analysis === 'done' && bsrc.bpm > 0) {
    const period = 60 / bsrc.bpm;
    const stride = period * pps >= 9 ? 1 : period * pps * 4 >= 9 ? 4 : 0;
    if (stride) {
      const t0 = clip.offset + lo / pps;
      const t1 = clip.offset + hi / pps;
      let k = Math.ceil((t0 - bsrc.beatPhase) / period);
      k += ((stride - (((k % stride) + stride) % stride)) % stride);     // stride'ın katına hizala
      for (; bsrc.beatPhase + k * period <= t1; k += stride) {
        const bx = Math.round(toX((bsrc.beatPhase + k * period - clip.offset) * pps));
        const bar = (((k % 4) + 4) % 4) === 0;
        g.fillStyle = bar ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.16)';
        g.fillRect(bx, 0, Math.max(1, Math.round(dpr)), H);
      }
    }
  }

  // Fade bölgelerini gölgeyle ve eğriyle göster.
  const drawFade = (x0, x1, gainAt) => {
    if (x1 - x0 < 1) return;
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const u = k / 24;
      pts.push([toX(x0 + (x1 - x0) * u), H * (1 - gainAt(u))]);
    }
    g.beginPath();
    g.moveTo(toX(x0), 0);
    pts.forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(toX(x1), 0);
    g.closePath();
    g.fillStyle = 'rgba(8, 10, 14, 0.5)';
    g.fill();
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.lineWidth = 1.5 * dpr;
    g.stroke();
  };
  drawFade(0, clip.fadeIn * pps, (u) => Math.sin((u * Math.PI) / 2));
  drawFade(wPx - clip.fadeOut * pps, wPx, (u) => Math.cos((u * Math.PI) / 2));

  // Zamanlı seviye geçişleri olan ses parçalarının eğrisi (parçanın rengiyle).
  if (hasStems(clip)) {
    for (const name of stemNames(clip)) {
      if (!hasLevelRamps(clip, name)) continue;
      const curve = levelCurve(clip, name);
      const lo0 = clip.offset;
      const hi0 = clip.offset + clip.dur;
      const times = [...new Set([lo0, hi0, ...curve.map((p) => p.t).filter((t) => t > lo0 && t < hi0)])].sort((a, b) => a - b);
      g.beginPath();
      times.forEach((t, i) => {
        const x = toX((t - clip.offset) * pps);
        const y = H - clamp(curveAt(curve, t, 0), 0, 1) * (H - 5 * dpr) - 2.5 * dpr;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.strokeStyle = STEM_COLORS[name] || '#fff';
      g.lineWidth = 1.8 * dpr;
      g.stroke();
    }
  }
}

let markerHits = [];
function drawRuler() {
  const view = el.timeline;
  const cv = el.rulerCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = view.clientWidth;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(RULER_H * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(RULER_H * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${RULER_H}px`;
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, RULER_H);
  g.fillStyle = '#15171b';
  g.fillRect(0, 0, GUTTER, RULER_H);

  const [step, sub] = RULER_STEPS.find(([s]) => s * state.pps >= 80) || RULER_STEPS[RULER_STEPS.length - 1];
  const minor = step / sub;
  const first = Math.max(0, Math.floor((view.scrollLeft - GUTTER) / state.pps / minor));
  g.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  g.textBaseline = 'top';
  for (let i = first; ; i++) {
    const t = i * minor;
    const x = Math.round(GUTTER + t * state.pps - view.scrollLeft) + 0.5;
    if (x > w) break;
    if (x < GUTTER) continue;
    const major = i % sub === 0;
    g.strokeStyle = major ? '#4a4f5b' : '#343842';
    g.beginPath();
    g.moveTo(x, major ? 14 : RULER_H - 6);
    g.lineTo(x, RULER_H);
    g.stroke();
    if (major) {
      g.fillStyle = '#8b919d';
      g.fillText(formatTime(t, step < 1 ? 1 : 0), x + 4, 4);
    }
  }

  // İşaretçiler: cetvelin alt yarısında isimli bayraklar; tıklama için konumları saklanır.
  markerHits = [];
  g.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif';
  g.textBaseline = 'middle';
  for (const m of state.markers) {
    const x = Math.round(GUTTER + m.t * state.pps - view.scrollLeft) + 0.5;
    const label = m.name || 'İşaret';
    const cw = Math.min(110, g.measureText(label).width + 10);
    if (x + cw < GUTTER || x > w) continue;
    g.strokeStyle = '#5bd39a';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, 2); g.lineTo(x, RULER_H); g.stroke();
    g.fillStyle = '#5bd39a';
    g.beginPath(); g.roundRect(x, RULER_H - 15, cw, 13, [0, 4, 4, 0]); g.fill();
    g.fillStyle = '#0f2a1d';
    g.save();
    g.beginPath(); g.rect(x, RULER_H - 15, cw, 13); g.clip();
    g.fillText(label, x + 5, RULER_H - 8.5);
    g.restore();
    markerHits.push({ id: m.id, x0: x - 3, x1: x + cw, y0: RULER_H - 16 });
  }

  // Döngü aralığı
  if (state.loop) {
    const lx0 = Math.max(GUTTER, GUTTER + state.loop.from * state.pps - view.scrollLeft);
    const lx1 = Math.min(w, GUTTER + state.loop.to * state.pps - view.scrollLeft);
    if (lx1 > lx0) {
      g.fillStyle = 'rgba(255,122,69,0.28)';
      g.fillRect(lx0, RULER_H - 6, lx1 - lx0, 6);
      g.fillStyle = 'rgba(255,122,69,0.10)';
      g.fillRect(lx0, 0, lx1 - lx0, RULER_H - 6);
    }
  }

  // Başlangıç işareti: Boşluk'la çalmaya başlanacak yer (içi boş üçgen).
  const mx = Math.round(GUTTER + state.marker * state.pps - view.scrollLeft) + 0.5;
  if (mx >= GUTTER && mx <= w) {
    g.beginPath();
    g.moveTo(mx - 5, RULER_H - 9);
    g.lineTo(mx + 5, RULER_H - 9);
    g.lineTo(mx, RULER_H - 2);
    g.closePath();
    g.strokeStyle = '#ff7a45';
    g.lineWidth = 1.2;
    g.stroke();
  }
}

function redrawVisible() {
  state.clips.forEach(drawClip);
  drawRuler();
}

// İçerik genişliği: parçalar uzayınca (veya sağa sürüklenince) kaydırma alanı da büyür.
function updateTrackWidth() {
  const view = el.timeline;
  const laneW = Math.max(view.clientWidth, GUTTER + (projectEnd() + 45) * state.pps + view.clientWidth * 0.4);
  el.tracks.style.width = `${laneW}px`;
}

function layoutAll(skipDraw = false) {
  updateTrackWidth();
  state.clips.forEach(positionClip);
  updateLoopUI();
  el.empty.hidden = state.clips.length > 0;
  el.total.textContent = `/ ${formatTime(projectEnd(), 2)}`;
  updatePlayheadUI();
  updateInspector();
  if (!skipDraw) redrawVisible();
}

function updateLoopUI() {
  const band = el.loopBand;
  band.hidden = !state.loop;
  if (state.loop) {
    band.style.left = `${GUTTER + state.loop.from * state.pps}px`;
    band.style.width = `${(state.loop.to - state.loop.from) * state.pps}px`;
  }
  drawRuler();
}

function updatePlayheadUI() {
  const x = GUTTER + state.playhead * state.pps;
  el.playhead.style.left = `${x}px`;
  el.playhead.hidden = x - el.timeline.scrollLeft < GUTTER - 1;
  el.time.textContent = state.playhead.toFixed(2);            // büyük: saniye
  el.timeMin.textContent = formatTime(state.playhead, 2);     // küçük: dakika:saniye
}

// Seçim: birincil klip (yan panel) + tüm seçili klipler. Shift+tıkla seçime ekler/çıkarır.
function setSelection(ids, primary) {
  state.selection = new Set(ids);
  state.selectedId = primary ?? ids[ids.length - 1] ?? null;
}

const selectedClips = () => state.clips.filter((c) => state.selection.has(c.id));

function syncSelectionUI() {
  state.clips.forEach((c) => c.el.classList.toggle('selected', state.selection.has(c.id)));
  updateInspector();
}

function select(id, { toggle = false } = {}) {
  if (id === null) setSelection([]);
  else if (toggle && state.selection.has(id)) setSelection([...state.selection].filter((x) => x !== id));
  else if (toggle) setSelection([...state.selection, id], id);
  else setSelection([id], id);
  syncSelectionUI();
}

// -------------------------------------------------------------- yakınlaştırma
const ppsFromSlider = (v) => PPS_MIN * (PPS_MAX / PPS_MIN) ** (v / 1000);
const sliderFromPps = (pps) => Math.round((Math.log(pps / PPS_MIN) / Math.log(PPS_MAX / PPS_MIN)) * 1000);

// anchorX: ekranda sabit kalacak nokta (clientX). Verilmezse görünümün ortası.
function setZoom(pps, anchorX = null) {
  const view = el.timeline;
  const ax = anchorX === null ? view.clientWidth / 2 : anchorX - view.getBoundingClientRect().left;
  const t = Math.max(0, (view.scrollLeft + ax - GUTTER) / state.pps);
  state.pps = clamp(pps, PPS_MIN, PPS_MAX);
  layoutAll(true);
  view.scrollLeft = Math.max(0, GUTTER + t * state.pps - ax);
  redrawVisible();
  updatePlayheadUI();
  el.zoom.value = sliderFromPps(state.pps);
  paintSlider(el.zoom);
}

function zoomBy(factor, anchorX = null) { setZoom(state.pps * factor, anchorX); }

function fitAll() {
  const end = projectEnd();
  if (!end) return;
  setZoom((el.timeline.clientWidth - GUTTER - 60) / end);
  el.timeline.scrollLeft = 0;
}

// ---------------------------------------------------------------- sürgüler
function paintSlider(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
  // Sol/sağ dengesi gibi ortası sıfır olan sürgülerde dolgu ortadan başlar.
  if (input.classList.contains('bipolar')) {
    input.style.setProperty('--a', `${Math.min(p, 50)}%`);
    input.style.setProperty('--b', `${Math.max(p, 50)}%`);
  }
}

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];

function wireSlider(input, onValue) {
  input.addEventListener('pointerdown', beginEdit);
  input.addEventListener('keydown', (e) => { if (NAV_KEYS.includes(e.key)) beginEdit(); });
  input.addEventListener('input', () => { paintSlider(input); onValue(Number(input.value)); });
  input.addEventListener('change', endEdit);
  input.addEventListener('keyup', endEdit);
  const reset = () => {                        // varsayılana dön
    if (input.disabled) return;
    beginEdit();
    input.value = input.dataset.default;
    input.dispatchEvent(new Event('input'));
    endEdit();
  };
  input.addEventListener('dblclick', reset);
  // Sürgünün yanındaki değere (ör. "Sağ 3", "%80") tıklamak da varsayılana döndürür.
  const out = input.parentElement?.querySelector('output');
  if (out) {
    out.classList.add('resettable');
    out.title = 'Tıkla: varsayılana döndür';
    out.addEventListener('click', reset);
  }
}

// -------------------------------------------------------------- yan panel
// Alt çubuk: parça sayısı ve mix süresi, seçili parçanın özeti, açık olan kipler.
function updateStatus() {
  const n = state.clips.length;
  el.stProject.textContent = n ? `${n} parça · mix ${formatTime(projectEnd(), 1)}` : 'Parça yok';
  const c = selected();
  if (!c) {
    el.stSelection.textContent = n ? 'Seçili parça yok' : '';
  } else {
    const parts = [c.name, `${formatTime(c.start, 1)} – ${formatTime(clipEnd(c), 1)}`];
    const tag = tagText(c);
    if (tag) parts.push(tag);
    if (state.selection.size > 1) parts.push(`+${state.selection.size - 1} parça seçili`);
    el.stSelection.textContent = parts.join(' · ');
  }
  const modes = [];
  if (state.snapBeats) modes.push('Vuruşa yapış');
  if (state.loop) modes.push('Döngü');
  if (!state.trackOn.every(Boolean)) modes.push('Sessiz hat var');
  if (anySolo()) modes.push('Solo açık');
  el.stModes.textContent = modes.join(' · ');
}

function updateInspector() {
  updateStatus();
  const clip = selected();
  el.insEmpty.hidden = !!clip;
  el.insBody.hidden = !clip;
  if (!clip) return;
  el.insName.textContent = state.selection.size > 1 ? `${clip.name} +${state.selection.size - 1}` : clip.name;
  el.insChip.style.setProperty('--hue', clipHue(clip));
  el.insColors.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hue === (clip.hue === undefined ? 'auto' : String(clip.hue)))));
  el.insStart.textContent = formatTime(clip.start, 2);
  el.insDur.textContent = formatTime(clip.dur, 2);
  const db = clip.gain > 0 ? 20 * Math.log10(clip.gain) : -Infinity;
  el.insGainVal.textContent = Number.isFinite(db) ? `${db > 0 ? '+' : ''}${db.toFixed(1)} dB` : '−∞ dB';
  el.insGain.value = Math.round(clip.gain * 100);
  el.insFadeIn.value = Math.round(clip.fadeIn * 10);
  el.insFadeOut.value = Math.round(clip.fadeOut * 10);
  el.insFadeInVal.textContent = `${clip.fadeIn.toFixed(1)} sn`;
  el.insFadeOutVal.textContent = `${clip.fadeOut.toFixed(1)} sn`;
  [el.insGain, el.insFadeIn, el.insFadeOut].forEach(paintSlider);
  el.insBass.value = clip.eqLow || 0;
  el.insTreble.value = clip.eqHigh || 0;
  el.insBassVal.textContent = dbText(clip.eqLow || 0);
  el.insTrebleVal.textContent = dbText(clip.eqHigh || 0);
  el.insSwap.setAttribute('aria-checked', String(!!clip.bassSwap));
  el.insMute.setAttribute('aria-pressed', String(!!clip.mute));
  el.insSolo.setAttribute('aria-pressed', String(!!clip.solo));
  [el.insBass, el.insTreble].forEach(paintSlider);
  const many = state.selection.size > 1;
  el.insMulti.hidden = !many;
  el.insLevel.hidden = !many;
  if (many) el.insMulti.textContent = `Seviye, denge, EQ ve fade ${state.selection.size} parçaya birlikte uygulanır.`;
  el.insReset.disabled = isPristine(clip);
  el.insReset.title = el.insReset.disabled ? 'Bu parçada sıfırlanacak bir değişiklik yok' : 'Bu parçadaki tüm değişiklikleri sıfırla';
  el.insPan.value = Math.round((clip.pan || 0) * 100);
  el.insPanVal.textContent = panText(clip.pan || 0);
  paintSlider(el.insPan);
  updateTempo(clip);
  updateStems(clip);
}

// Ses parçaları bölümü: ayrılmamışsa buton, ayrılmışsa parça başına sürgü.
let stemRows = {};
let stemsKey = '';
const openRamps = new Set();        // geçiş paneli açık olan ses parçaları

const panText = (v) => (Math.abs(v) < 0.005 ? 'Orta' : v < 0 ? `Sol ${Math.round(-v * 100)}` : `Sağ ${Math.round(v * 100)}`);
const panShort = (v) => (Math.abs(v) < 0.005 ? 'Orta' : v < 0 ? `Sol ${Math.round(-v * 100)}` : `Sağ ${Math.round(v * 100)}`);
const fmtSec = (t) => `${(Math.round(t * 10) / 10).toString().replace('.', ',')} sn`;

function makeField(labelText, min, max, value, bipolar = false) {
  const row = document.createElement('div');
  row.className = 'field';
  const label = document.createElement('label');
  const out = document.createElement('output');
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min, max, value });
  if (bipolar) input.classList.add('bipolar');
  input.dataset.default = String(value);
  input.setAttribute('aria-label', labelText);
  row.append(label, out, input);
  return { row, label, out, input };
}

function numberInput(placeholder, step = 0.1) {
  const input = document.createElement('input');
  Object.assign(input, { type: 'number', min: 0, step, placeholder });
  input.className = 'num';
  input.setAttribute('aria-label', placeholder);
  return input;
}

// Bir ses parçasının (vokal, davul...) bloğu: seviye, sol/sağ denge ve zamanlı geçişler.
function buildStemBlock(name) {
  const title = STEM_LABELS[name] || name;
  const block = document.createElement('div');
  block.className = 'stem-block';

  const level = makeField(title, 0, 100, 100);
  const dot = document.createElement('i');
  dot.className = 'dot';
  dot.style.setProperty('--c', STEM_COLORS[name] || '#fff');
  level.label.append(dot, title);
  wireSlider(level.input, (v) => {
    const c = selected(); if (!c) return;
    c.stemGains = { ...c.stemGains, [name]: v / 100 };
    level.out.textContent = `${v}%`;
    layoutClip(c);
    liveStemGains();
  });

  const pan = makeField('Denge', -100, 100, 0, true);
  pan.row.classList.add('sub');
  pan.label.textContent = 'Sol / Sağ';
  wireSlider(pan.input, (v) => {
    const c = selected(); if (!c) return;
    c.stemPans = { ...c.stemPans, [name]: v / 100 };
    pan.out.textContent = panText(v / 100);
    livePan();
  });

  // Zamanlı geçişler: "şu saniyeden şu saniyeye kadar seviyeyi (ve istersen yönü) şu değerden şu değere
  // kademeli taşı". Ses parçaları bağımsızdır: her birinin kendi geçişleri vardır.
  const toggle = document.createElement('button');
  toggle.className = 'link-btn';
  const panel = document.createElement('div');
  panel.className = 'ramp-panel';
  const list = document.createElement('div');
  list.className = 'ramp-list';

    // Seviye grafiği: eğriyi görür, çizgi sürükleyerek geçiş çizer, uçlardaki noktaları sürükleyerek ayarlarsın.
  // Yatay eksen parçanın süresi (zaman çizelgesi saniyesi), dikey eksen seviye (%0 alt, %100 üst).
  const graph = document.createElement('canvas');
  graph.className = 'ramp-graph';
  const PAD = 7;
  let handles = [];
  let gdrag = null;
  const gx = (clip, t) => ((t - clip.start) / clip.dur);
  const gy = (h, v) => PAD + (1 - clamp(v, 0, 1)) * (h - 2 * PAD);
  const tAt = (clip, x, w) => clip.start + clamp(x / w, 0, 1) * clip.dur;
  const levelAtY = (y, h) => clamp(1 - (y - PAD) / (h - 2 * PAD), 0, 1);
  const drawGraph = () => {
    const clip = selected();
    const w = graph.clientWidth;
    const h = graph.clientHeight;
    if (!clip || !w || !h || panel.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    graph.width = Math.round(w * dpr);
    graph.height = Math.round(h * dpr);
    const g = graph.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const color = STEM_COLORS[name] || '#fff';
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    for (const v of [0, 0.5, 1]) { const y = Math.round(gy(h, v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // eğri
    const curve = levelCurve(clip, name);
    const N = Math.max(40, Math.floor(w / 3));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = clip.start + (i / N) * clip.dur;
      pts.push([(i / N) * w, gy(h, curveAt(curve, clip.offset + (t - clip.start), stemGain(clip, name)))]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineTo(w, h - PAD);
    g.lineTo(0, h - PAD);
    g.closePath();
    g.fillStyle = `${color}22`;
    g.fill();
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = color;
    g.lineWidth = 1.8;
    g.stroke();
    // oynatma çizgisi
    if (state.playhead >= clip.start && state.playhead <= clipEnd(clip)) {
      const px = Math.round(gx(clip, state.playhead) * w) + 0.5;
      g.strokeStyle = 'rgba(255,122,69,0.8)';
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke();
    }
    // tutamaçlar
    handles = [];
    const tl = (t) => clip.start + (t - clip.offset);
    for (const r of stemRamps(clip, name)) {
      if (r.to === undefined) continue;
      const base = curveAt(curve, r.start, stemGain(clip, name));
      for (const [kind, t, v] of [['start', r.start, r.from ?? base], ['end', r.end, r.to]]) {
        const x = gx(clip, tl(t)) * w;
        if (x < -6 || x > w + 6) continue;
        handles.push({ ramp: r, kind, x, y: gy(h, v) });
      }
    }
    for (const hd of handles) {
      g.beginPath();
      g.arc(hd.x, hd.y, 4.5, 0, Math.PI * 2);
      g.fillStyle = '#14161a';
      g.fill();
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.stroke();
    }
    // çizilmekte olan yeni geçiş
    if (gdrag?.mode === 'new' && gdrag.x1 !== undefined) {
      g.setLineDash([4, 3]);
      g.strokeStyle = '#fff';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(gdrag.x0, gdrag.y0); g.lineTo(gdrag.x1, gdrag.y1); g.stroke();
      g.setLineDash([]);
    }
  };
  const gpos = (e) => { const r = graph.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  graph.addEventListener('pointerdown', (e) => {
    const clip = selected();
    if (!clip) return;
    const { x, y } = gpos(e);
    const hit = handles.find((hd) => Math.hypot(hd.x - x, hd.y - y) <= 9);
    graph.setPointerCapture(e.pointerId);
    beginEdit();
    gdrag = hit ? { mode: 'handle', hit } : { mode: 'new', x0: x, y0: y };
  });
  graph.addEventListener('pointermove', (e) => {
    const clip = selected();
    const { x, y, w, h } = gpos(e);
    if (!gdrag || !clip) {
      graph.style.cursor = handles.some((hd) => Math.hypot(hd.x - x, hd.y - y) <= 9) ? 'grab' : 'crosshair';
      return;
    }
    if (!(e.buttons & 1)) return;           // Chromium'un sahte hareket olayları
    if (gdrag.mode === 'new') {
      gdrag.x1 = x; gdrag.y1 = y;
    } else {
      const { ramp, kind } = gdrag.hit;
      const src = clip.offset + (tAt(clip, x, w) - clip.start);
      const level = Math.round(levelAtY(y, h) * 100) / 100;
      if (kind === 'start') { ramp.start = Math.min(src, ramp.end - 0.1); ramp.from = level; }
      else { ramp.end = Math.max(src, ramp.start + 0.1); ramp.to = level; }
      layoutClip(clip);
    }
    drawGraph();
  });
  const finishGraphDrag = (e, cancel = false) => {
    const clip = selected();
    const d = gdrag;
    gdrag = null;
    if (!d || !clip) { endEdit(); return; }
    if (!cancel && d.mode === 'new' && d.x1 !== undefined && Math.abs(d.x1 - d.x0) > 8) {
      const { w, h } = gpos(e);
      const [a, b] = d.x0 <= d.x1 ? [[d.x0, d.y0], [d.x1, d.y1]] : [[d.x1, d.y1], [d.x0, d.y0]];
      const src = (px) => clip.offset + (tAt(clip, px, w) - clip.start);
      const ramp = { start: src(a[0]), end: src(b[0]), from: Math.round(levelAtY(a[1], h) * 100) / 100, to: Math.round(levelAtY(b[1], h) * 100) / 100 };
      clip.stemRamps = { ...clip.stemRamps, [name]: [...stemRamps(clip, name), ramp].sort((p, q) => p.start - q.start) };
    } else if (d.mode === 'handle') {
      clip.stemRamps = { ...clip.stemRamps, [name]: [...stemRamps(clip, name)].sort((p, q) => p.start - q.start) };
    }
    endEdit();
    layoutClip(clip);
    updateInspector();
    onEdited();
  };
  graph.addEventListener('pointerup', finishGraphDrag);
  graph.addEventListener('pointercancel', (e) => finishGraphDrag(e, true));
  graph.addEventListener('dblclick', (e) => {
    const { x, y } = gpos(e);
    const hit = handles.find((hd) => Math.hypot(hd.x - x, hd.y - y) <= 9);
    if (!hit) return;
    const idx = stemRamps(selected(), name).indexOf(hit.ramp);
    if (idx >= 0) removeRamp(name, idx);
  });

  // Yazısız küçük + / − düğmeleri: seviye geçişinin yönü (kademeli artır / kademeli azalt).
  let dir = 'up';
  const dirRow = document.createElement('div');
  dirRow.className = 'dir-row';
  const dirBtn = (kind, title, path) => {
    const b = document.createElement('button');
    b.className = 'dir-btn';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="${path}"/></svg>`;
    b.dataset.dir = kind;
    return b;
  };
  const upBtn = dirBtn('up', 'Sesi kademeli artır', 'M6 2v8M2 6h8');
  const downBtn = dirBtn('down', 'Sesi kademeli azalt', 'M2 6h8');
  dirRow.append(upBtn, downBtn);
  const paintDir = () => {
    upBtn.setAttribute('aria-pressed', String(dir === 'up'));
    downBtn.setAttribute('aria-pressed', String(dir === 'down'));
  };
  paintDir();

  const form = document.createElement('div');
  form.className = 'ramp-form';
  const start = numberInput('Başlangıç (sn)');
  const end = numberInput('Bitiş (sn)');
  const lvFrom = numberInput('Seviye başı (%)', 1);
  const lvTo = numberInput('Seviye sonu (%)', 1);
  [lvFrom, lvTo].forEach((i) => { i.max = 100; });
  const panToggle = document.createElement('label');
  panToggle.className = 'check-row';
  const panCheck = document.createElement('input');
  panCheck.type = 'checkbox';
  panToggle.append(panCheck, document.createTextNode(' Yönü (sol / sağ) de değiştir'));
  const pnFrom = numberInput('Yön başı', 1);
  const pnTo = numberInput('Yön sonu', 1);
  [pnFrom, pnTo].forEach((i) => { i.min = -100; i.max = 100; });
  const panFields = document.createElement('div');
  panFields.className = 'pan-fields';
  panFields.hidden = true;
  const labeled = (text, input) => {
    const l = document.createElement('label');
    l.textContent = text;
    l.append(input);
    return l;
  };
  panFields.append(labeled('Yön başı', pnFrom), labeled('Yön sonu', pnTo));
  const panHint = document.createElement('p');
  panHint.className = 'hint';
  panHint.textContent = '−100 tam sol, 0 orta, +100 tam sağ';
  panFields.append(panHint);
  panCheck.addEventListener('change', () => { panFields.hidden = !panCheck.checked; });
  const add = document.createElement('button');
  add.className = 'btn solid mini';
  add.textContent = 'Geçiş ekle';
  form.append(
    labeled('Başlangıç sn', start), labeled('Bitiş sn', end),
    labeled('Seviye başı %', lvFrom), labeled('Seviye sonu %', lvTo),
    panToggle, panFields, add,
  );
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Üstteki + sesi kademeli artırır, − kademeli azaltır. Saniyeler zaman çizelgesindeki saniyelerdir (cetvelde ve sol üstteki sayaçta gördüğün); kaçıncı saniyede başlayıp kaçıncı saniyede biteceğini yaz. Seviye, başlangıç yüzdesinden hedef yüzdesine kademeli geçer; geçişten önce başlangıç, sonra hedef seviyesinde kalır. Seviye kutularını boş bırakırsan yalnızca yön değişir.';
  const graphHint = document.createElement('p');
  graphHint.className = 'hint';
  graphHint.textContent = 'Grafikte çizgi sürükleyerek geçiş çiz. Uçlardaki noktaları sürükleyerek ayarla, çift tıklayınca silinir.';
  panel.append(graph, graphHint, list, dirRow, form, hint);

  // Yön seçilince başlangıç/hedef değerleri yöne uyar; değerler elle yazılınca yön düğmesi ona uyar.
  const setDir = (d) => {
    dir = d;
    paintDir();
    const a = Number(lvFrom.value);
    const b = Number(lvTo.value);
    if (lvFrom.value !== '' && lvTo.value !== '' && ((d === 'up' && b < a) || (d === 'down' && b > a))) {
      [lvFrom.value, lvTo.value] = [lvTo.value, lvFrom.value];
    }
  };
  upBtn.addEventListener('click', () => setDir('up'));
  downBtn.addEventListener('click', () => setDir('down'));
  const syncDirFromValues = () => {
    if (lvFrom.value === '' || lvTo.value === '') return;
    const a = Number(lvFrom.value);
    const b = Number(lvTo.value);
    if (b > a) dir = 'up'; else if (b < a) dir = 'down';
    paintDir();
  };
  lvFrom.addEventListener('input', syncDirFromValues);
  lvTo.addEventListener('input', syncDirFromValues);

  const prefill = () => {
    const c = selected();
    if (!c) return;
    // Saniyeler zaman çizelgesindeki (cetvel ve sayaçtaki) saniyelerdir. Varsayılan: oynatma çizgisi
    // parçanın içindeyse orası, değilse parçanın başı.
    const inside = state.playhead >= c.start && state.playhead < clipEnd(c) - 1;
    const from = inside ? state.playhead : c.start;
    const srcT = c.offset + (from - c.start);
    start.value = Math.round(from * 10) / 10;
    end.value = Math.round(Math.min(from + 10, clipEnd(c)) * 10) / 10;
    lvFrom.value = Math.round(curveAt(levelCurve(c, name), srcT, stemGain(c, name)) * 100);
    lvTo.value = dir === 'up' ? 100 : 0;
    if (Number(lvFrom.value) === Number(lvTo.value)) lvFrom.value = dir === 'up' ? 0 : 100;
    pnFrom.value = Math.round(curveAt(panCurve(c, name), srcT, stemPan(c, name)) * 100);
    pnTo.value = pnFrom.value;
  };
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.textContent = toggle.textContent.replace(/^[▸▾]/, open ? '▾' : '▸');
    if (open) { openRamps.add(name); prefill(); requestAnimationFrame(drawGraph); } else openRamps.delete(name);
  });
  add.addEventListener('click', () => {
    const num = (input) => (input.value.trim() === '' ? undefined : Number(input.value));
    let from = num(lvFrom);
    let to = num(lvTo);
    // Seçili yön her zaman geçerlidir: değerler tersse yer değiştirir.
    if (from !== undefined && to !== undefined && ((dir === 'up' && to < from) || (dir === 'down' && to > from))) [from, to] = [to, from];
    addRamp(name, {
      start: num(start), end: num(end),
      from, to,
      panFrom: panCheck.checked ? num(pnFrom) : undefined,
      panTo: panCheck.checked ? num(pnTo) : undefined,
    });
  });
  panel.hidden = !openRamps.has(name);
  if (!panel.hidden) prefill();      // başka parçaya geçince açık kalan panel de dolu gelsin

  block.append(level.row, pan.row, toggle, panel);
  return { block, level, pan, toggle, list, panel, rampsKey: null, drawGraph };
}

function updateStems(clip) {
  const ready = hasStems(clip);
  el.stemsNone.hidden = ready;
  el.stemsReady.hidden = !ready;
  if (!ready) { stemsKey = ''; return; }

  const names = stemNames(clip);
  const key = `${clip.id}:${names.join(',')}`;
  if (key !== stemsKey) {
    stemsKey = key;
    stemRows = Object.fromEntries(names.map((n) => [n, buildStemBlock(n)]));
    el.stemsList.replaceChildren(...names.map((n) => stemRows[n].block));
  }
  for (const name of names) {
    const row = stemRows[name];
    // Zamanlı geçişi olan değerin kaydırıcısı kilitlidir; değeri geçişler belirler.
    const levelRamped = hasLevelRamps(clip, name);
    const panRamped = hasPanRamps(clip, name);
    const pct = Math.round(stemGain(clip, name) * 100);
    row.level.input.value = pct;
    row.level.input.disabled = levelRamped;
    row.level.out.textContent = levelRamped ? 'Zamanlı' : `${pct}%`;
    paintSlider(row.level.input);
    row.pan.input.value = Math.round(stemPan(clip, name) * 100);
    row.pan.input.disabled = panRamped;
    row.pan.out.textContent = panRamped ? 'Zamanlı' : panText(stemPan(clip, name));
    paintSlider(row.pan.input);

    row.drawGraph();
    const ramps = stemRamps(clip, name);
    row.toggle.textContent = `${row.panel.hidden ? '▸' : '▾'} Zamanlı geçişler${ramps.length ? ` (${ramps.length})` : ''}`;
    const rampsKey = `${JSON.stringify(ramps)}|${clip.offset}|${clip.dur}|${clip.start}`;
    if (rampsKey !== row.rampsKey) {
      row.rampsKey = rampsKey;
      row.list.replaceChildren(...ramps.map((r, i) => {
        const item = document.createElement('div');
        item.className = 'ramp-item';
        const text = document.createElement('span');
        // Saklanan şarkı saniyeleri, parçanın şu anki konumuna göre zaman çizelgesi saniyesine çevrilir.
        const tl = (t) => clip.start + (t - clip.offset);
        const outside = tl(r.end) <= clip.start || tl(r.start) >= clipEnd(clip);
        const parts = [`${fmtSec(tl(r.start))} → ${fmtSec(tl(r.end))}`];
        if (r.to !== undefined) parts.push(`${r.from !== undefined ? `%${Math.round(r.from * 100)}` : '…'} → %${Math.round(r.to * 100)}`);
        if (r.panTo !== undefined) parts.push(`${panShort(r.panFrom ?? 0)} → ${panShort(r.panTo)}`);
        if (outside) parts.push('parça dışında');
        text.textContent = parts.join(' · ');
        if (outside) text.style.setProperty('color', '#f0b25a');
        const del = document.createElement('button');
        del.className = 'icon-btn tiny';
        del.title = 'Geçişi sil';
        del.textContent = '×';
        del.addEventListener('click', () => removeRamp(name, i));
        item.append(text, del);
        return item;
      }));
    }
  }
}

// spec: { start, end (şarkı saniyesi), from, to (seviye %), panFrom, panTo (yön -100..100) }.
// Seviye ve yön çiftlerinden en az biri dolu olmalı; her çiftin ikisi de dolu ya da ikisi de boş olmalı.
function addRamp(name, spec) {
  const clip = selected();
  if (!clip) return;
  // Girilen saniyeler zaman çizelgesindeki saniyelerdir (cetvelde ve sayaçta gördüğün). Saklanırken
  // şarkı saniyesine çevrilir ki parçayı taşısan, bölsen ya da kırpsan geçiş sesin aynı yerinde kalsın.
  const { start, end } = spec;
  if (![start, end].every(Number.isFinite)) return toast('Başlangıç ve bitiş saniyesini yaz');
  if (end <= start) return toast('Bitiş, başlangıçtan sonra olmalı');
  if (end <= clip.start || start >= clipEnd(clip)) {
    return toast(`Bu aralık parçanın dışında kalıyor. Bu parça zaman çizelgesinde ${fmtSec(clip.start)} ile ${fmtSec(clipEnd(clip))} arasında`, true);
  }
  const pair = (a, b, label) => {
    const filled = [a, b].filter((v) => v !== undefined);
    if (filled.length === 1) { toast(`${label}: başı ve sonu birlikte yazılmalı`); return false; }
    return filled.length === 2 && filled.every(Number.isFinite);
  };
  const hasLevel = pair(spec.from, spec.to, 'Seviye');
  if (hasLevel === false && (spec.from !== undefined || spec.to !== undefined)) return;
  const hasPan = pair(spec.panFrom, spec.panTo, 'Yön');
  if (hasPan === false && (spec.panFrom !== undefined || spec.panTo !== undefined)) return;
  if (!hasLevel && !hasPan) return toast('Seviye veya yön değerlerini yaz');

  const toSrc = (t) => clip.offset + (t - clip.start);
  const ramp = { start: toSrc(start), end: toSrc(end) };
  if (hasLevel) { ramp.from = clamp(spec.from, 0, 100) / 100; ramp.to = clamp(spec.to, 0, 100) / 100; }
  if (hasPan) { ramp.panFrom = clamp(spec.panFrom, -100, 100) / 100; ramp.panTo = clamp(spec.panTo, -100, 100) / 100; }
  mutate(() => {
    const list = [...stemRamps(clip, name), ramp].sort((a, b) => a.start - b.start);
    clip.stemRamps = { ...clip.stemRamps, [name]: list };
  });
  layoutClip(clip);
  updateInspector();
  onEdited();
}

function removeRamp(name, index) {
  const clip = selected();
  if (!clip) return;
  mutate(() => {
    const list = stemRamps(clip, name).filter((_, i) => i !== index);
    const next = { ...clip.stemRamps };
    if (list.length) next[name] = list; else delete next[name];
    clip.stemRamps = Object.keys(next).length ? next : undefined;
  });
  layoutClip(clip);
  updateInspector();
  onEdited();
}

// Tempo değişince şarkı saniyeleri k kat ölçeklenir; geçişlerin zamanları da öyle.
function scaleRamps(ramps, k) {
  if (!ramps) return ramps;
  return Object.fromEntries(Object.entries(ramps).map(([n, list]) => [n, list.map((r) => ({ ...r, start: r.start * k, end: r.end * k }))]));
}

function setStemPreset(kind) {
  const clip = selected();
  if (!clip || !hasStems(clip)) return;
  mutate(() => {
    clip.stemGains = Object.fromEntries(stemNames(clip).map((n) => {
      const on = kind === 'all' || (kind === 'vocal' ? n === 'vocals' : n !== 'vocals');
      return [n, on ? 1 : 0];
    }));
    clip.stemRamps = undefined;      // ön ayar kesin bir karışım demektir; zamanlı geçişler temizlenir
  });
  layoutClip(clip);
  updateInspector();
  liveStemGains();
}

// Çalarken parça seviyelerini yeniden başlatmadan değiştirir. Zamanlı geçişi olan bir parçanın
// tabanı değişince eğrinin tamamı değişir; o durumda çalma kaldığı yerden yeniden kurulur.
function liveStemGains() {
  if (!state.playing) return;
  let rebuild = false;
  for (const { clipId, name, node } of state.playing.parts) {
    const clip = state.clips.find((c) => c.id === clipId);
    if (!clip) continue;
    if (hasLevelRamps(clip, name)) rebuild = true;
    else node.gain.setTargetAtTime(stemGain(clip, name), ctx.currentTime, 0.02);
  }
  if (rebuild) onEdited();
}

// Sol/sağ dengeyi çalarken yumuşakça değiştirir.
function livePan() {
  const p = state.playing;
  if (!p) return;
  let rebuild = false;
  for (const { clipId, name, pan } of p.parts) {
    const clip = state.clips.find((c) => c.id === clipId);
    if (!clip) continue;
    if (hasPanRamps(clip, name)) rebuild = true;
    else pan.pan.setTargetAtTime(stemPan(clip, name), ctx.currentTime, 0.015);
  }
  for (const { clipId, pan } of p.clipNodes) {
    const clip = state.clips.find((c) => c.id === clipId);
    if (clip) pan.pan.setTargetAtTime(clip.pan || 0, ctx.currentTime, 0.015);
  }
  if (rebuild) onEdited();
}

function limitFades(clip, changed) {
  clip.fadeIn = clamp(clip.fadeIn, 0, Math.min(MAX_FADE, clip.dur));
  clip.fadeOut = clamp(clip.fadeOut, 0, Math.min(MAX_FADE, clip.dur));
  if (clip.fadeIn + clip.fadeOut > clip.dur) {
    if (changed === 'fadeIn') clip.fadeOut = clip.dur - clip.fadeIn;
    else clip.fadeIn = clip.dur - clip.fadeOut;
  }
}

// Birden çok parça seçiliyken sürgüler hepsine aynı değeri uygular (tek geri alma adımı).
wireSlider(el.insGain, (v) => {
  if (!selected()) return;
  for (const clip of selectedClips()) { clip.gain = v / 100; layoutClip(clip); }
  updateInspector(); onEdited();
});
wireSlider(el.insPan, (v) => {
  if (!selected()) return;
  for (const clip of selectedClips()) clip.pan = v / 100;
  el.insPanVal.textContent = panText(v / 100);
  livePan();
});
wireSlider(el.insFadeIn, (v) => {
  if (!selected()) return;
  for (const clip of selectedClips()) { clip.fadeIn = v / 10; limitFades(clip, 'fadeIn'); layoutClip(clip); }
  updateInspector(); onEdited();
});
wireSlider(el.insFadeOut, (v) => {
  if (!selected()) return;
  for (const clip of selectedClips()) { clip.fadeOut = v / 10; limitFades(clip, 'fadeOut'); layoutClip(clip); }
  updateInspector(); onEdited();
});

const dbText = (v) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : ''}${v} dB`);
wireSlider(el.insBass, (v) => {
  if (!selected()) return;
  for (const clip of selectedClips()) clip.eqLow = v || undefined;
  el.insBassVal.textContent = dbText(v);
  onEdited();
});
wireSlider(el.insTreble, (v) => {
  if (!selected()) return;
  for (const clip of selectedClips()) clip.eqHigh = v || undefined;
  el.insTrebleVal.textContent = dbText(v);
  onEdited();
});
el.insSwap.addEventListener('click', () => {
  const clip = selected();
  if (!clip) return;
  const on = !clip.bassSwap;
  mutate(() => { for (const c of selectedClips()) c.bassSwap = on || undefined; });
  updateInspector();
  onEdited();
});
el.transBass.addEventListener('click', () => {
  tempo.bassSwap = !tempo.bassSwap;
  el.transBass.setAttribute('aria-checked', String(tempo.bassSwap));
});

// Sessize al / solo: seçili tüm parçalara uygulanır; çalıyorsa ses hemen güncellenir.
function toggleClipFlag(flag) {
  const chosen = selectedClips();
  if (!chosen.length) return toast('Önce bir parça seç');
  const on = !chosen.every((c) => c[flag]);
  mutate(() => { for (const c of chosen) c[flag] = on || undefined; });
  layoutAll();
  onEdited();
}
el.insMute.addEventListener('click', () => toggleClipFlag('mute'));
el.insSolo.addEventListener('click', () => toggleClipFlag('solo'));

// Uyumlu şarkılar: kütüphanedeki (daha önce analiz edilmiş) şarkıları seçili parçaya tempo ve tonca yakınlığa göre sıralar.
async function findCompatible() {
  const clip = selected();
  const src = clip && sourceOf(clip);
  if (!src || src.analysis !== 'done') return toast('Parçanın analizi bitince tekrar dene');
  const inProject = new Set(state.sources.size ? [...state.sources.values()].map((s) => s.path).filter(Boolean) : []);
  const all = await window.harman.libraryList();
  const ranked = all
    .filter((e) => !inProject.has(e.path) && e.bpm > 0 && e.key)
    .map((e) => ({ e, cost: transitionCost(src, e) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 6);
  el.libList.replaceChildren();
  if (!ranked.length) {
    el.libHint.textContent = all.length ? 'Kütüphanedeki diğer şarkıların hepsi zaten projede.' : 'Kütüphane henüz boş. Şarkı ekledikçe burada birikir ve uyumlu olanlar önerilir.';
    return;
  }
  el.libHint.textContent = `Kütüphanede ${all.length} şarkı var; ${fmtBpm(src.bpm)} BPM · ${Analysis.camelot(src.key).code} ile en uyanlar:`;
  for (const { e, cost } of ranked) {
    const item = document.createElement('div');
    item.className = 'lib-item';
    const name = document.createElement('span');
    name.className = 'lib-name';
    name.textContent = e.name;
    name.title = e.path;
    const fit = document.createElement('span');
    fit.className = `lib-fit${cost >= 9 ? ' far' : ''}`;
    fit.textContent = cost < 4 ? 'Çok uyumlu' : cost < 9 ? 'Uyumlu' : 'Uzak';
    name.append(fit);
    const meta = document.createElement('span');
    meta.className = 'lib-meta';
    meta.textContent = `${fmtBpm(e.bpm)} BPM · ${Analysis.camelot(e.key).code}`;
    const add = document.createElement('button');
    add.className = 'btn solid mini';
    add.textContent = 'Ekle';
    add.addEventListener('click', () => { addFiles([e.path]); item.remove(); });
    item.append(name, meta, add);
    el.libList.appendChild(item);
  }
}
el.libFind.addEventListener('click', findCompatible);

// Parça rengi: seçili tüm parçalara uygulanır. "Hat rengi" (kesikli) elle seçimi kaldırır.
for (const hue of [...CLIP_HUES, 'auto']) {
  const b = document.createElement('button');
  b.className = `swatch${hue === 'auto' ? ' auto' : ''}`;
  b.dataset.hue = String(hue);
  b.title = hue === 'auto' ? 'Hat rengi' : 'Parça rengi';
  b.setAttribute('aria-label', b.title);
  if (hue !== 'auto') b.style.setProperty('--h', hue);
  b.addEventListener('click', () => {
    if (!selected()) return;
    mutate(() => { for (const c of selectedClips()) c.hue = hue === 'auto' ? undefined : hue; });
    layoutAll();
  });
  el.insColors.appendChild(b);
}

// Yeniden adlandırma: parça başlığına çift tıkla, F2 ya da sağ tık menüsü. Enter kaydeder, Esc vazgeçer.
function beginRename(clip) {
  if (!clip || clip.el.querySelector('.clip-rename')) return;
  const head = clip.el.querySelector('.clip-head');
  const title = head.querySelector('.clip-title');
  const input = document.createElement('input');
  input.className = 'clip-rename';
  input.type = 'text';
  input.value = clip.name;
  input.maxLength = 120;
  input.setAttribute('aria-label', 'Parça adı');
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.remove();
    title.hidden = false;
    if (commit && name && name !== clip.name) {
      mutate(() => { clip.name = name; });
      title.textContent = name;
      updateInspector();
      updateProjectUI();
    }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  title.hidden = true;
  head.insertBefore(input, title);
  input.focus();
  input.select();
}

// Seviye eşitleme: her parçanın çaldığı bölümün RMS'i (ses parçaları varsa seviyeleriyle) ölçülür;
// seçilenlerin ortanca yüksekliği hedef olur, her parçanın seviyesi buna göre ayarlanır.
function clipRms(clip) {
  const src = sourceOf(clip);
  const parts = hasStems(clip) && Object.values(clip.stemGains).some((g) => g !== 1)
    ? Object.entries(src.stems).map(([n, s]) => ({ buffer: s.buffer, g: stemGain(clip, n) }))
    : [{ buffer: src.buffer, g: 1 }];
  const i0 = Math.max(0, Math.floor(clip.offset * SAMPLE_RATE));
  const i1 = Math.min(src.buffer.length, Math.floor((clip.offset + clip.dur) * SAMPLE_RATE));
  const chans = parts.map((p) => [p.buffer.getChannelData(0), p.buffer.getChannelData(p.buffer.numberOfChannels > 1 ? 1 : 0), p.g]);
  let sum = 0;
  let n = 0;
  for (let i = i0; i < i1; i += 3) {
    let l = 0;
    let r = 0;
    for (const [cl, cr, g] of chans) { l += cl[i] * g; r += cr[i] * g; }
    sum += l * l + r * r;
    n += 2;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

function equalizeLevels() {
  const clips = selectedClips();
  if (clips.length < 2) return toast('Seviyeyi eşitlemek için en az iki parça seç');
  const measured = clips.map((c) => ({ c, rms: clipRms(c) })).filter((m) => m.rms > 1e-4);
  if (measured.length < 2) return toast('Seçilen parçalar neredeyse sessiz');
  const eff = measured.map((m) => m.rms * m.c.gain).sort((a, b) => a - b);
  const target = eff[Math.floor((eff.length - 1) / 2)];
  let capped = 0;
  mutate(() => {
    for (const { c, rms } of measured) {
      const want = target / rms;
      c.gain = Math.round(clamp(want, 0, 1.5) * 100) / 100;
      if (want > 1.5) capped++;
      layoutClip(c);
    }
  });
  updateInspector();
  onEdited();
  toast(capped ? `Seviyeler eşitlendi, ${capped} parça en yüksek seviyede kaldı` : 'Seviyeler eşitlendi. ⌘Z ile geri alabilirsin');
}
el.insLevel.addEventListener('click', equalizeLevels);
wireSlider(el.zoom, (v) => setZoom(ppsFromSlider(v)));

// ---------------------------------------------------------- düzenleme işlemleri
// Karışım ayarlarının (ses parçası seviyeleri, denge, geçişler) kopyaları; nesneler paylaşılmasın.
function copyMixParams(clip) {
  return {
    stemGains: clip.stemGains && { ...clip.stemGains },
    stemPans: clip.stemPans && { ...clip.stemPans },
    stemRamps: clip.stemRamps && Object.fromEntries(Object.entries(clip.stemRamps).map(([n, list]) => [n, list.map((r) => ({ ...r }))])),
  };
}

// Seçili tüm klipleri oynatma çizgisinden böler (çizgi içinde kalanları).
function splitSelected() {
  const chosen = selectedClips();
  if (!chosen.length) return toast('Önce bir parça seç');
  // Kesim, ana parçanın en yakın vuruşuna oturur (Görünüm → Vuruşa Yapış kapalıysa tam çizginin olduğu yere).
  const t = beatSnapTime(selected() || chosen[0], state.playhead);
  const targets = chosen.filter((c) => t >= c.start + MIN_CLIP && t <= clipEnd(c) - MIN_CLIP);
  if (!targets.length) return toast('Oynatma çizgisini seçili parçanın içine getir');
  mutate(() => {
    const created = [];
    for (const clip of targets) {
      const right = {
        ...clip, ...copyMixParams(clip), id: state.nextId++, srcId: cloneSource(clip.srcId), start: t,
        offset: clip.offset + (t - clip.start), dur: clipEnd(clip) - t, fadeIn: 0,
      };
      clip.dur = t - clip.start;
      clip.fadeOut = 0;
      limitFades(right, 'fadeOut');
      state.clips.push(right);
      createClipElement(right);
      created.push(right.id);
    }
    setSelection(created);
  });
  layoutAll();
  onEdited();
}

// Kopyalar, seçili grubun hemen sağına konur.
function duplicateSelected() {
  const chosen = selectedClips();
  if (!chosen.length) return toast('Önce bir parça seç');
  mutate(() => {
    const span = Math.max(...chosen.map(clipEnd)) - Math.min(...chosen.map((c) => c.start));
    const created = [];
    for (const clip of chosen) {
      const copy = { ...clip, ...copyMixParams(clip), id: state.nextId++, srcId: cloneSource(clip.srcId), start: clip.start + span };
      state.clips.push(copy);
      createClipElement(copy);
      created.push(copy.id);
    }
    setSelection(created);
  });
  layoutAll();
  onEdited();
}

function deleteSelected() {
  const chosen = selectedClips();
  if (!chosen.length) return;
  mutate(() => {
    chosen.forEach((c) => c.el.remove());
    state.clips = state.clips.filter((c) => !chosen.includes(c));
    setSelection([]);
  });
  layoutAll();
  onEdited();
}

// edge: 'start' → başlangıcı, 'end' → bitişi oynatma çizgisine getir.
function trimToPlayhead(edge) {
  const clip = selected();
  if (!clip) return toast('Önce bir parça seç');
  const t = beatSnapTime(clip, state.playhead);
  const ok = edge === 'start'
    ? t > clip.start + 0.001 && t < clipEnd(clip) - MIN_CLIP
    : t > clip.start + MIN_CLIP && t < clipEnd(clip) - 0.001;
  if (!ok) return toast('Oynatma çizgisini parçanın içine getir');
  mutate(() => {
    if (edge === 'start') {
      const delta = t - clip.start;
      clip.start = t;
      clip.offset += delta;
      clip.dur -= delta;
      limitFades(clip, 'fadeIn');
    } else {
      clip.dur = t - clip.start;
      limitFades(clip, 'fadeOut');
    }
  });
  layoutAll();
  onEdited();
}

document.getElementById('ins-split').addEventListener('click', splitSelected);
document.getElementById('ins-duplicate').addEventListener('click', duplicateSelected);
document.getElementById('ins-delete').addEventListener('click', deleteSelected);

// ---------------------------------------------- fare konumu ve kenarda otomatik kaydırma
// Chromium, düzen değişince fareyi "tazelemek" için tuşsuz (buttons = 0) sahte hareket olayları üretir.
// Bir sürükleme sürerken bunlar fare konumunu bozmasın: tuş basılıyken tuşsuz hareketler yok sayılır.
const pointer = { x: 0, y: 0, down: false };
window.addEventListener('pointermove', (e) => {
  if (pointer.down && e.buttons === 0) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}, true);
window.addEventListener('pointerdown', (e) => { pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY; }, true);
window.addEventListener('pointerup', () => { pointer.down = false; }, true);
window.addEventListener('pointercancel', () => { pointer.down = false; }, true);

let autoScroll = null;

// Sürükleme sırasında fare görünümün sol/sağ kenarına yaklaşınca zaman çizelgesi kendiliğinden kayar;
// fare durup beklese de kaymaya devam eder. onScroll: her kaymadan sonra sürüklemeyi yeniden uygular.
function startAutoScroll(onScroll) {
  stopAutoScroll();
  autoScroll = { onScroll, raf: 0 };
  const ZONE = 64;
  const loop = () => {
    if (!autoScroll) return;
    const view = el.timeline;
    const r = view.getBoundingClientRect();
    const leftEdge = r.left + GUTTER + ZONE;
    const rightEdge = r.right - ZONE;
    let speed = 0;
    if (pointer.x > rightEdge) speed = Math.min(1.6, (pointer.x - rightEdge) / ZONE);
    else if (pointer.x < leftEdge) speed = -Math.min(1.6, (leftEdge - pointer.x) / ZONE);
    if (speed !== 0) {
      const before = view.scrollLeft;
      view.scrollLeft = Math.max(0, before + Math.sign(speed) * Math.abs(speed) ** 1.5 * 24);
      if (view.scrollLeft !== before) autoScroll.onScroll();
    }
    autoScroll.raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopAutoScroll() {
  if (autoScroll) cancelAnimationFrame(autoScroll.raf);
  autoScroll = null;
}

// ---------------------------------------------------- sürükle / kes / fade
let drag = null;

function beginDrag(e, clip) {
  if (e.button !== 0 || e.ctrlKey) return;
  e.preventDefault();
  document.activeElement?.blur();
  const mode = e.target.dataset.mode || 'move';
  if (mode !== 'move') select(clip.id);                      // kırpma ve fade tek parçaya uygulanır
  else if (e.shiftKey) { select(clip.id, { toggle: true }); if (!state.selection.has(clip.id)) return; }
  else if (!state.selection.has(clip.id)) select(clip.id);    // seçili grubun üyesiyse grup birlikte taşınır
  beginEdit();
  const group = mode === 'move' ? selectedClips() : [clip];
  drag = {
    clip, mode, group, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
    startScroll: el.timeline.scrollLeft, moved: false, snapOff: false,
    origs: new Map(group.map((c) => [c, {
      start: c.start, offset: c.offset, dur: c.dur, fadeIn: c.fadeIn, fadeOut: c.fadeOut, track: c.track,
    }])),
  };
  clip.el.setPointerCapture(e.pointerId);
  group.forEach((c) => c.el.classList.add('dragging'));
  clip.el.addEventListener('pointermove', onDragMove);
  clip.el.addEventListener('pointerup', endDrag);
  clip.el.addEventListener('pointercancel', endDrag);
  startAutoScroll(applyDrag);
}

// Başka parçaların kenarlarına ve oynatma çizgisine yapışma (taşınan parçaların kendileri hariç).
// Parçanın kendi vuruş ızgarasındaki en yakın vuruş (zaman çizelgesi saniyesi). gridShift: kaynak
// saniyesini zaman çizelgesine çeviren sabit (start - offset). Analiz yoksa null.
function nearestBeat(clip, time, gridShift = clip.start - clip.offset) {
  const src = sourceOf(clip);
  if (!state.snapBeats || src?.analysis !== 'done' || !(src.bpm > 0)) return null;
  const period = 60 / src.bpm;
  const k = Math.round((time - gridShift - src.beatPhase) / period);
  return gridShift + src.beatPhase + k * period;
}
const beatSnapTime = (clip, time) => {
  const b = nearestBeat(clip, time);
  return b !== null && Math.abs(b - time) <= (SNAP_PX * 1.5) / state.pps ? b : time;
};

function snap(time, ignore, edges, beatOf = null) {
  const limit = SNAP_PX / state.pps;
  const targets = [0, state.playhead];
  if (beatOf) {
    const b = beatOf(time);
    if (b !== null) targets.push(b);
  }
  state.clips.forEach((c) => { if (!ignore.includes(c)) targets.push(c.start, clipEnd(c)); });
  let best = null;
  for (const edge of edges) {
    for (const t of targets) {
      const d = t - (time + edge);
      if (Math.abs(d) <= limit && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best === null ? time : time + best;
}

function onDragMove(e) {
  if (e.buttons === 0) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.snapOff = e.metaKey || e.ctrlKey;     // ⌘ / Ctrl basılıyken yapışma kapalı
  applyDrag();
}

// Fare konumuna (ve o ana kadar kayan görünüme) göre sürüklemeyi uygular.
function applyDrag() {
  const { clip, mode, group, origs } = drag;
  const orig = origs.get(clip);
  if (Math.abs(drag.x - drag.startX) > 3 || Math.abs(drag.y - drag.startY) > 3) drag.moved = true;
  // Görünüm kaydıysa fare altındaki içerik de kaymıştır: kayma kadarını farka ekle.
  const dx = (drag.x - drag.startX + el.timeline.scrollLeft - drag.startScroll) / state.pps;
  const snapTo = drag.snapOff ? (t) => t : (t, edges) => snap(t, group, edges, mode === 'trimL' || mode === 'trimR' ? (x) => ((60 / (sourceOf(clip)?.bpm || 120)) * state.pps >= SNAP_PX * 2 ? nearestBeat(clip, x, orig.start - orig.offset) : null) : null);

  if (mode === 'move') {
    const groupStart = Math.min(...group.map((c) => origs.get(c).start));
    const delta = Math.max(snapTo(orig.start + dx, [0, orig.dur]) - orig.start, -groupStart);
    for (const c of group) c.start = origs.get(c).start + delta;
    // Hatlar: fare hangi hatta ise grup aynı sayıda hat kayar (hiçbir parça dışarı taşmaz).
    const rect = el.tracks.getBoundingClientRect();
    const row = clamp(Math.floor((drag.y - rect.top) / (rect.height / TRACK_COUNT)), 0, TRACK_COUNT - 1);
    const tracks = group.map((c) => origs.get(c).track);
    const shift = clamp(row - orig.track, -Math.min(...tracks), TRACK_COUNT - 1 - Math.max(...tracks));
    for (const c of group) {
      const next = origs.get(c).track + shift;
      if (next !== c.track) { c.track = next; laneOf(next).appendChild(c.el); }
    }
  } else if (mode === 'trimL') {
    const target = snapTo(orig.start + dx, [0]);
    const delta = clamp(target - orig.start, Math.max(-orig.offset, -orig.start), orig.dur - MIN_CLIP);
    clip.start = orig.start + delta;
    clip.offset = orig.offset + delta;
    clip.dur = orig.dur - delta;
    limitFades(clip, 'fadeIn');
  } else if (mode === 'trimR') {
    const target = snapTo(orig.start + orig.dur + dx, [0]) - orig.start;
    clip.dur = clamp(target, MIN_CLIP, clip.buffer.duration - orig.offset);
    limitFades(clip, 'fadeOut');
  } else if (mode === 'fadeIn') {
    clip.fadeIn = orig.fadeIn + dx;
    limitFades(clip, 'fadeIn');
  } else if (mode === 'fadeOut') {
    clip.fadeOut = orig.fadeOut - dx;
    limitFades(clip, 'fadeOut');
  }
  updateTrackWidth();          // sağa sürüklerken kaydırma alanı büyüsün
  group.forEach(layoutClip);
  updateInspector();
}

function endDrag(e) {
  stopAutoScroll();
  const { clip, group } = drag;
  clip.el.releasePointerCapture(e.pointerId);
  group.forEach((c) => c.el.classList.remove('dragging'));
  clip.el.removeEventListener('pointermove', onDragMove);
  clip.el.removeEventListener('pointerup', endDrag);
  clip.el.removeEventListener('pointercancel', endDrag);
  const justClicked = drag.mode === 'move' && !drag.moved;
  drag = null;
  endEdit();
  layoutAll();
  if (justClicked) {
    // Sürüklemeden tıklandı: grubun bir üyesine düz tıklamak seçimi o parçaya indirir;
    // oynatma çizgisi tıklanan yere gelir (ardından S ile tam oradan bölebilirsin).
    if (!e.shiftKey && state.selection.size > 1) select(clip.id);
    goTo(timeAt(e.clientX));
  } else {
    onEdited();
  }
}

// ------------------------------------------------------------ toplu seçim (fareyle dikdörtgen)
const marqueeEl = $('marquee');

// Boş alanda basılı tutup sürükleyince çizilen dikdörtgene değen klipler seçilir (Shift: seçime ekle).
// Hiç sürüklemeden tıklanırsa seçim kalkar ve oynatma çizgisi oraya gider.
let marqueeStop = null;          // yarım kalmış bir seçim oturumunu sonlandırır

function startMarquee(e) {
  marqueeStop?.(false);          // bir önceki oturum (olay kaçtıysa) varsa temizle
  document.activeElement?.blur();
  const view = el.timeline;
  const additive = e.shiftKey;
  const base = additive ? [...state.selection] : [];
  const toContent = (cx, cy) => {
    const r = view.getBoundingClientRect();
    return { x: cx - r.left + view.scrollLeft, y: cy - r.top + view.scrollTop };
  };
  const origin = toContent(e.clientX, e.clientY);
  let active = false;

  const update = () => {
    const cur = toContent(pointer.x, pointer.y);
    const x1 = Math.min(origin.x, cur.x);
    const x2 = Math.max(origin.x, cur.x);
    const y1 = Math.min(origin.y, cur.y);
    const y2 = Math.max(origin.y, cur.y);
    Object.assign(marqueeEl.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    const hits = state.clips.filter((c) => {
      const cx1 = GUTTER + c.start * state.pps;
      const cy1 = RULER_H + c.track * TRACK_H + 6;
      return cx1 < x2 && cx1 + c.dur * state.pps > x1 && cy1 < y2 && cy1 + TRACK_H - 12 > y1;
    }).map((c) => c.id);
    setSelection([...new Set([...base, ...hits])]);
    syncSelectionUI();
  };
  const move = (ev) => {
    if (ev.buttons === 0) return;
    if (!active && Math.hypot(pointer.x - e.clientX, pointer.y - e.clientY) > 4) {
      active = true;
      marqueeEl.hidden = false;
      startAutoScroll(update);
    }
    if (active) update();
  };
  // finish: oturumu bir kez bitirir. click=true: bırakıldı (sürüklenmediyse tıklama gibi davranır).
  const finish = (click, clientX) => {
    if (marqueeStop !== finish) return;
    marqueeStop = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    stopAutoScroll();
    marqueeEl.hidden = true;
    if (click && !active) {
      if (!additive) select(null);
      goTo(timeAt(clientX));
    }
  };
  const up = (ev) => finish(true, ev.clientX);
  const cancel = () => finish(false);
  marqueeStop = finish;
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

// --------------------------------------------------------------- ses motoru
// Bir parçanın t anındaki ses seviyesi. Fade'ler eşit güçlü (sin/cos) olduğu için
// iki parça üst üste binince toplam ses seviyesi sabit kalır, geçişte çukur oluşmaz.
function envelopeAt(clip, t) {
  const fi = Math.max(clip.fadeIn, DECLICK);
  const fo = Math.max(clip.fadeOut, DECLICK);
  const x = t - clip.start;
  const r = clip.dur - x;
  let g = clip.gain;
  if (x < fi) g *= Math.sin((Math.max(x, 0) / fi) * Math.PI / 2);
  if (r < fo) g *= Math.sin((Math.max(r, 0) / fo) * Math.PI / 2);
  return g;
}

// Fade bölgelerinin kırılma noktaları; aralarını WebAudio doğrusal rampayla doldurur.
function envelopePoints(clip) {
  const fi = Math.max(clip.fadeIn, DECLICK);
  const fo = Math.max(clip.fadeOut, DECLICK);
  const pts = [];
  for (let i = 0; i <= FADE_STEPS; i++) pts.push(clip.start + (fi * i) / FADE_STEPS);
  for (let i = 0; i <= FADE_STEPS; i++) pts.push(clipEnd(clip) - fo + (fo * i) / FADE_STEPS);
  return pts;
}

// EQ ve bas takası. Bas takasında geçişin (fade bölgesinin) ortasında basın kısılıp açılması
// bir DJ'in "bass swap"ıdır: iki parçanın baslarının aynı anda duyulması mix'i bulandırır.
const EQ_LOW_HZ = 180;
const EQ_HIGH_HZ = 4500;
const BASS_CUT_DB = 26;
const hasEq = (clip) => !!(clip.eqLow || clip.eqHigh || clip.bassSwap);

// Bas takasında 0..1 kısma derinliği: giriş fade'inde ilk %35'te tam kısık, %65'te tam açık;
// çıkış fade'inde %35'te açık, %65'te tam kısık. 0,5 sn'den kısa fade'lerde takas yapılmaz.
function bassDepthAt(clip, t) {
  if (!clip.bassSwap) return 0;
  const lin = (u) => Math.min(1, Math.max(0, (u - 0.35) / 0.3));
  let d = 0;
  const x = t - clip.start;
  const r = clipEnd(clip) - t;
  if (clip.fadeIn >= 0.5 && x < clip.fadeIn) d = Math.max(d, 1 - lin(x / clip.fadeIn));
  if (clip.fadeOut >= 0.5 && r < clip.fadeOut) d = Math.max(d, lin((clip.fadeOut - r) / clip.fadeOut));
  return d;
}
const bassGainAt = (clip, t) => (clip.eqLow || 0) - BASS_CUT_DB * bassDepthAt(clip, t);
function bassSwapPoints(clip) {
  const pts = [];
  if (clip.fadeIn >= 0.5) pts.push(clip.start, clip.start + clip.fadeIn * 0.35, clip.start + clip.fadeIn * 0.65, clip.start + clip.fadeIn);
  if (clip.fadeOut >= 0.5) {
    const s0 = clipEnd(clip) - clip.fadeOut;
    pts.push(s0, s0 + clip.fadeOut * 0.35, s0 + clip.fadeOut * 0.65, clipEnd(clip));
  }
  return pts.sort((a, b) => a - b);
}

// audioCtx: AudioContext veya OfflineAudioContext. from: zaman çizelgesinde başlangıç (sn).
// base: audioCtx zamanında "from" anına karşılık gelen an.
// Zincir (her klip): kaynak → seviye (parça seviyesi + zamanlı geçişler) → parça dengesi
//   → zarf (fade) → klip dengesi → hat (çalma kutucuğu) → çıkış.
// keepSilent: kapalı parçaları ve hatları da kur, çalarken yeniden başlatmadan açılabilsin.
function scheduleMix(audioCtx, from, base, destination, { keepSilent = false, stemOnly = null } = {}) {
  const sources = [];
  const parts = [];
  const clipNodes = [];
  const trackNodes = Array.from({ length: TRACK_COUNT }, (_, i) => {
    const node = audioCtx.createGain();
    node.gain.value = state.trackOn[i] ? 1 : 0;
    node.connect(destination);
    return node;
  });

  for (const clip of state.clips) {
    if (!keepSilent && (!state.trackOn[clip.track] || !isAudible(clip))) continue;
    const end = clipEnd(clip);
    if (end <= from) continue;
    const startTl = Math.max(clip.start, from);
    const when = base + (startTl - from);
    const at = (t) => base + (t - from);
    const srcTime = (t) => clip.offset + (t - clip.start);     // zaman çizelgesi → şarkı saniyesi

    const envelope = audioCtx.createGain();
    envelope.gain.setValueAtTime(envelopeAt(clip, startTl), when);
    for (const t of envelopePoints(clip)) {
      if (t > startTl) envelope.gain.linearRampToValueAtTime(envelopeAt(clip, t), at(t));
    }
    const clipPan = audioCtx.createStereoPanner();
    clipPan.pan.value = clip.pan || 0;
    if (hasEq(clip)) {
      // EQ: bas (alçak raf) ve tiz (yüksek raf). Bas takası açıksa fade bölgelerinde bas kısılıp açılır.
      const low = audioCtx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = EQ_LOW_HZ;
      const high = audioCtx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = EQ_HIGH_HZ;
      high.gain.value = clip.eqHigh || 0;
      low.gain.setValueAtTime(bassGainAt(clip, startTl), when);
      if (clip.bassSwap) for (const t of bassSwapPoints(clip)) if (t > startTl) low.gain.linearRampToValueAtTime(bassGainAt(clip, t), at(t));
      envelope.connect(low).connect(high).connect(clipPan);
    } else {
      envelope.connect(clipPan);
    }
    const gate = audioCtx.createGain();               // sessize alma / solo: çalarken yeniden kurulumla güncellenir
    gate.gain.value = isAudible(clip) ? 1 : 0;
    clipPan.connect(gate).connect(trackNodes[clip.track]);
    clipNodes.push({ clipId: clip.id, pan: clipPan });

    const list = hasStems(clip)
      ? stemNames(clip).map((name) => ({ name, buffer: sourceOf(clip).stems[name].buffer, gain: stemGain(clip, name) }))
      : [{ name: null, buffer: clip.buffer, gain: 1 }];
    // stemOnly: yalnızca bu ses parçası (vokal, davul…) çalınır; ses parçası olmayan klipler sessiz kalır.
    if (stemOnly && !list.some((p) => p.name === stemOnly)) continue;
    // Eğri noktalarını WebAudio parametresine zamanlar: bu noktaların arası doğrusaldır.
    const scheduleCurve = (param, pts, fallback) => {
      param.setValueAtTime(curveAt(pts, srcTime(startTl), fallback), when);
      for (const pt of pts) {
        const t = clip.start + (pt.t - clip.offset);
        if (t > startTl && t <= end) param.linearRampToValueAtTime(pt.v, at(t));
      }
    };

    for (const part of list) {
      if (stemOnly && part.name !== stemOnly) continue;
      const levelRamped = part.name && hasLevelRamps(clip, part.name);
      if (part.gain <= 0 && !levelRamped && !keepSilent) continue;
      const src = audioCtx.createBufferSource();
      src.buffer = part.buffer;
      const level = audioCtx.createGain();
      if (levelRamped) scheduleCurve(level.gain, levelCurve(clip, part.name), part.gain);
      else level.gain.value = part.gain;
      src.connect(level);
      if (part.name) {
        const pan = audioCtx.createStereoPanner();
        if (hasPanRamps(clip, part.name)) scheduleCurve(pan.pan, panCurve(clip, part.name), stemPan(clip, part.name));
        else pan.pan.value = stemPan(clip, part.name);
        level.connect(pan).connect(envelope);
        parts.push({ clipId: clip.id, name: part.name, node: level, pan });
      } else {
        level.connect(envelope);
      }
      src.start(when, srcTime(startTl), end - startTl);
      sources.push(src);
    }
  }
  return { sources, parts, clipNodes, trackNodes };
}

function setPlayUI(playing) {
  el.btnPlay.classList.toggle('on', playing);
  el.btnPlay.querySelector('.i-play').hidden = playing;
  el.btnPlay.querySelector('.i-pause').hidden = !playing;
  el.btnPlay.title = playing ? 'Duraklat (Boşluk)' : 'Oynat (Boşluk)';
}

function play() {
  if (state.playing || !state.clips.length) return;
  if (state.playhead >= projectEnd()) state.playhead = 0;
  ctx.resume();
  const base = ctx.currentTime + 0.05;
  // Ana çıkış: seviye göstergesi için iki kanalın ayrı analizörü.
  const master = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
  analysers.forEach((a) => { a.fftSize = 1024; });
  master.connect(ctx.destination);
  master.connect(split);
  split.connect(analysers[0], 0);
  split.connect(analysers[1], 1);
  const { sources, parts, clipNodes, trackNodes } = scheduleMix(ctx, state.playhead, base, master, { keepSilent: true });
  state.playing = { sources, parts, clipNodes, trackNodes, startPlayhead: state.playhead, base, master, analysers };
  setPlayUI(true);
  requestAnimationFrame(tick);
}

function pause() {
  if (!state.playing) return;
  state.playing.sources.forEach((s) => { try { s.stop(); } catch { /* zaten durmuş */ } });
  try { state.playing.master.disconnect(); } catch { /* zaten ayrılmış */ }
  state.playing = null;
  setPlayUI(false);
  updateMeter(0, { reset: true });
}

let scrubbing = false;   // oynatma çizgisi fareyle sürükleniyor

// Döngü: çalarken aralığın sonuna gelince başa sarar. Yalnızca dinlemek içindir, mix'e etkisi yoktur.
function setLoop(from, to) {
  state.loop = to - from > 0.2 ? { from: Math.max(0, from), to } : null;
  updateLoopUI();
  updateStatus();
}

function toggleLoop() {
  if (state.loop) { setLoop(0, 0); toast('Döngü kapatıldı'); return; }
  const clips = selectedClips();
  if (!clips.length) return toast('Döngüde dinlemek için önce bir parça seç');
  setLoop(Math.min(...clips.map((c) => c.start)), Math.max(...clips.map(clipEnd)));
  state.marker = state.loop.from;
  seek(state.loop.from);
  play();
  toast('Seçili parça döngüde çalıyor. Kapatmak için L');
}

// Boşluk: çalıyorsa durdurur; durmuşsa son tıklanan yerden (işaret) başlatır. Durdurunca çizgi
// durduğu yerde kalır. ⇧Boşluk: durduğu yerden devam eder.
function togglePlay() {
  if (state.playing) { pause(); return; }
  state.playhead = state.marker;
  updatePlayheadUI();
  play();
}

function resumePlay() {
  if (!state.playing) play();
}

// Kullanıcı bir yere gitti (tıklama, süre yazma, ok tuşu...): oraya atla ve başlangıç işareti yap.
function goTo(t) {
  state.marker = Math.max(0, t);
  seek(t);
  drawRuler();
}

function seek(t) {
  const wasPlaying = !!state.playing;
  pause();
  state.playhead = Math.max(0, t);
  updatePlayheadUI();
  if (wasPlaying) play();
}

// Düzenleme sırasında çalıyorsa, kaldığı yerden yeni ayarlarla devam et.
function onEdited() {
  if (state.playing) seek(state.playhead);
}

// Çıkış seviyesi: iki kanalın tepe değeri, dB ölçeğinde (−48 … 0). 0 dB üstü "tepe" olarak işaretlenir.
const meterState = { level: 0, hold: 0, holdUntil: 0, over: false };
function updateMeter(peak, { reset = false } = {}) {
  const now = performance.now();
  if (reset) { meterState.level = 0; meterState.hold = 0; }
  meterState.level = Math.max(peak, meterState.level * 0.9);
  // Tepe tutma: son 1,5 saniyenin en yüksek değeri gösterilir (kick gibi kısa tepeler kaçmasın).
  if (peak >= meterState.hold || now > meterState.holdUntil) { meterState.hold = peak; meterState.holdUntil = now + 1500; }
  if (peak >= 0.999) meterState.over = true;
  const toDb = (v) => (v > 0.0005 ? 20 * Math.log10(v) : -Infinity);
  const db = toDb(meterState.level);
  const holdDb = toDb(meterState.hold);
  const frac = Number.isFinite(db) ? clamp((db + 48) / 48, 0, 1) : 0;
  el.meterBar.style.setProperty('width', `${Math.round(frac * 100)}%`);
  el.meterBar.classList.toggle('hot', holdDb > -6 && holdDb <= -0.5);
  el.meterBar.classList.toggle('clip', holdDb > -0.5);
  el.peakText.textContent = meterState.over ? 'TEPE' : Number.isFinite(holdDb) ? `${holdDb.toFixed(1)} dB` : '—';
  el.peakText.classList.toggle('over', meterState.over);
}
el.meter.addEventListener('click', () => { meterState.over = false; updateMeter(0, { reset: true }); });
const meterBuf = new Float32Array(1024);
function readPeak(p) {
  let peak = 0;
  for (const a of p.analysers) {
    a.getFloatTimeDomainData(meterBuf);
    for (let i = 0; i < meterBuf.length; i++) { const v = Math.abs(meterBuf[i]); if (v > peak) peak = v; }
  }
  return peak;
}

function tick() {
  const p = state.playing;
  if (!p) return;
  if (scrubbing) { requestAnimationFrame(tick); return; }
  state.playhead = p.startPlayhead + Math.max(0, ctx.currentTime - p.base);
  updateMeter(readPeak(p));
  if (state.loop && state.playhead >= state.loop.to) {
    seek(state.loop.from);
    return;
  }
  if (state.playhead >= projectEnd()) {
    pause();
    state.playhead = projectEnd();
    updatePlayheadUI();
    return;
  }
  const view = el.timeline;
  const x = GUTTER + state.playhead * state.pps;
  if (x > view.scrollLeft + view.clientWidth - 40) view.scrollLeft = x - GUTTER - 120;
  updatePlayheadUI();
  requestAnimationFrame(tick);
}

// --------------------------------------------------------------- dışa aktar
function encodeWav(buffer) {
  const channels = 2;
  const frames = buffer.length;
  const out = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(out);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + frames * channels * 2, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const data of [left, right]) {
      const v = clamp(data[i], -1, 1);
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

// Çıktı biçimi (MP3 ya da WAV) kaydetme penceresinde seçilir; son seçilen bir sonraki sefer varsayılan olur.
const lastFormat = () => { try { return localStorage.getItem('harman.lastFormat') === 'wav' ? 'wav' : 'mp3'; } catch { return 'mp3'; } };

// Mix'i çevrimdışı çizer. normalize: en yüksek tepeyi −1 dB'e getirir. stemOnly: yalnızca bir ses parçası.
async function renderMix({ normalize = state.normalize, stemOnly = null } = {}) {
  const total = projectEnd();
  const offline = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  scheduleMix(offline, 0, 0, offline.destination, { stemOnly });
  const rendered = await offline.startRendering();
  if (normalize) {
    let peak = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      for (const v of rendered.getChannelData(ch)) if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    if (peak > 0) {
      const scale = 0.891 / peak;        // -1 dBFS
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch);
        for (let i = 0; i < data.length; i++) data[i] *= scale;
      }
    }
  }
  return rendered;
}

const mixBaseName = () => project.name || (state.clips[0] ? `${state.clips[0].name} mix` : 'Mix');

async function exportMix() {
  if (!state.clips.length) return toast('Önce bir şarkı ekle');
  pause();
  el.btnExport.disabled = true;
  try {
    toast('Mix hazırlanıyor...');
    const rendered = await renderMix();
    const saved = await window.harman.saveMix(encodeWav(rendered), `${state.clips[0].name} mix`, lastFormat(), 320);
    if (saved) {
      try { localStorage.setItem('harman.lastFormat', /\.wav$/i.test(saved) ? 'wav' : 'mp3'); } catch { /* özel pencere */ }
      toast(`Kaydedildi: ${saved}`);
    }
  } catch (err) {
    toast(`Kaydedilemedi: ${friendly(err.message)}`, true);
  } finally {
    el.btnExport.disabled = false;
  }
}

// AudioBuffer'dan [t0, t1) aralığını keser; uçlara tık sesini önleyen 5 ms'lik fade koyar.
function sliceBuffer(buffer, t0, t1) {
  const i0 = Math.max(0, Math.floor(t0 * buffer.sampleRate));
  const i1 = Math.min(buffer.length, Math.ceil(t1 * buffer.sampleRate));
  const out = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, i1 - i0), buffer.sampleRate);
  const ramp = Math.min(Math.floor(0.005 * buffer.sampleRate), Math.floor((i1 - i0) / 2));
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = out.getChannelData(ch);
    data.set(buffer.getChannelData(ch).subarray(i0, i1));
    for (let k = 0; k < ramp; k++) { data[k] *= k / ramp; data[data.length - 1 - k] *= k / ramp; }
  }
  return out;
}

// Mix'in bölüneceği yerler: işaretçiler varsa onlar, yoksa ardışık parçaların geçiş ortaları.
function splitPlan() {
  const end = projectEnd();
  const marks = [...state.markers].filter((m) => m.t > 0.05 && m.t < end - 0.05).sort((a, b) => a.t - b.t);
  if (marks.length) {
    const starts = [{ t: 0, name: 'Başlangıç' }, ...marks.map((m) => ({ t: m.t, name: m.name }))];
    return starts.map((s, i) => ({ name: s.name, t0: s.t, t1: i + 1 < starts.length ? starts[i + 1].t : end }));
  }
  const sorted = [...state.clips].sort((a, b) => a.start - b.start);
  if (sorted.length < 2) return [];
  const cuts = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    cuts.push(b.start < clipEnd(a) ? (b.start + clipEnd(a)) / 2 : clipEnd(a));      // geçişin ortası
  }
  return sorted.map((c, i) => ({ name: c.name, t0: i === 0 ? 0 : cuts[i - 1], t1: i + 1 < sorted.length ? cuts[i] : end }));
}

async function exportSplit() {
  if (!state.clips.length) return toast('Önce bir şarkı ekle');
  const plan = splitPlan();
  if (plan.length < 2) return toast('Bölmek için en az iki parça ya da bir işaretçi (M) gerekir');
  const format = await window.harman.chooseFormat(
    `Mix ${plan.length} dosyaya bölünecek`,
    `${plan.map((p, i) => `${i + 1}. ${p.name}`).join('\n').slice(0, 500)}\n\nKesim yerleri: ${state.markers.length ? 'işaretçiler' : 'parçalar arasındaki geçişlerin ortası'}. Hangi biçimde kaydedilsin?`,
  );
  if (!format) return;
  pause();
  const ok = await runBusy('Mix bölünüyor', async () => {
    setSepProgress({ text: 'Mix hazırlanıyor' });
    const rendered = await renderMix();
    const width = String(plan.length).length;
    const files = plan.map((p, i) => ({ name: `${String(i + 1).padStart(Math.max(2, width), '0')} - ${p.name}`, wav: encodeWav(sliceBuffer(rendered, p.t0, p.t1)) }));
    setSepProgress({ text: format === 'mp3' ? 'Dosyalar MP3\'e çevriliyor' : 'Dosyalar yazılıyor' });
    const done = await window.harman.saveBatch(files, format, 320, 'Bölünmüş mix için klasör seç');
    state.lastBatch = done;
  });
  if (ok && state.lastBatch) { toast(`${state.lastBatch.count} dosya kaydedildi: ${state.lastBatch.dir}`); state.lastBatch = null; }
}

// Her ses parçasını (vokal, davul, bas, diğer) mix'in kendi ayarlarıyla ayrı bir dosya olarak kaydeder.
async function exportStems() {
  const names = STEM_ORDER.filter((n) => state.clips.some((c) => hasStems(c) && n in sourceOf(c).stems));
  if (!names.length) return toast('Önce bir parçada vokal / enstrüman ayırma yap');
  const format = await window.harman.chooseFormat(
    `${names.length} ses parçası ayrı dosyalara kaydedilecek`,
    `${names.map((n) => STEM_LABELS[n] || n).join(', ')}\n\nHer dosya mix'in tamamını (kesimler, geçişler, seviyeler dahil) yalnızca o ses parçasıyla içerir. Hangi biçimde kaydedilsin?`,
  );
  if (!format) return;
  pause();
  const ok = await runBusy('Ses parçaları kaydediliyor', async () => {
    const files = [];
    for (let i = 0; i < names.length; i++) {
      setSepProgress({ text: `${STEM_LABELS[names[i]] || names[i]} hazırlanıyor`, detail: `${i + 1} / ${names.length}`, pct: (i / names.length) * 100 });
      const rendered = await renderMix({ normalize: false, stemOnly: names[i] });
      files.push({ name: `${mixBaseName()} - ${STEM_LABELS[names[i]] || names[i]}`, wav: encodeWav(rendered) });
    }
    setSepProgress({ text: 'Dosyalar yazılıyor' });
    state.lastBatch = await window.harman.saveBatch(files, format, 320, 'Ses parçaları için klasör seç');
  });
  if (ok && state.lastBatch) { toast(`${state.lastBatch.count} dosya kaydedildi: ${state.lastBatch.dir}`); state.lastBatch = null; }
}

// ------------------------------------------------------------ ayırma penceresi
const sep = {
  model: 'fast', status: null, srcId: null,
  running: false, phase: '', phaseStart: 0, est: 0, timer: null,
};

function formatDuration(sec) {
  return sec < 90 ? `${Math.max(1, Math.round(sec))} sn` : `${(sec / 60).toFixed(1).replace('.', ',')} dk`;
}

function showSepView(view) {
  el.sepChoose.hidden = view !== 'choose';
  el.sepRun.hidden = view !== 'run';
}

function updateSepChoose() {
  const src = state.sources.get(sep.srcId);
  const { installed, models } = sep.status;
  el.sepModels.replaceChildren(...models.map((m) => {
    const btn = document.createElement('button');
    btn.className = 'model';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(m.key === sep.model));
    const row = document.createElement('div');
    row.className = 'row';
    const title = document.createElement('b');
    title.textContent = m.label;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${m.engine} · ≈ ${formatDuration(src.buffer.duration / m.speed)}`;
    row.append(title, tag);
    const desc = document.createElement('p');
    desc.textContent = m.desc;
    btn.append(row, desc);
    btn.addEventListener('click', () => { sep.model = m.key; updateSepChoose(); });
    return btn;
  }));

  const model = models.find((m) => m.key === sep.model);
  const notes = [];
  if (!installed) notes.push('Önce ayırma motoru kurulacak (tek seferlik, yaklaşık 1 GB).');
  if (!model.ready) notes.push(`Model ilk kullanımda indirilir (≈ ${model.sizeMB} MB, tek seferlik).`);
  if (sep.status.lowMemory) {
    notes.push(`Bu bilgisayarda az bellek var; bu model ayırırken ≈ ${String(model.memoryGB).replace('.', ',')} GB kullanır. Tarayıcı gibi ağır uygulamaları kapatman iyi olur.`);
  }
  notes.push('Her şey bilgisayarında çalışır, dosyaların dışarı gönderilmez.');
  el.sepNote.textContent = notes.join(' ');
  el.sepStart.textContent = installed ? 'Ayırmaya başla' : 'Kur ve ayır';
}

async function openSeparate() {
  const clip = selected();
  if (!clip) return toast('Önce bir parça seç');
  if (hasStems(clip)) return toast('Bu parça zaten ayrılmış');
  const src = sourceOf(clip);
  if (src.stems) {
    enableStems(clip.srcId);
    return toast('Ayrılmış parçalar tekrar açıldı');
  }
  // Aynı ses verisinden (ör. aynı şarkıdan kesilmiş başka bir parça) zaten ayrılmış olan varsa onu kullan.
  const donor = [...state.sources.values()].find((e) => e !== src && e.buffer === src.buffer && e.stems);
  if (donor) {
    src.stems = donor.stems;
    enableStems(clip.srcId);
    return toast('Aynı şarkının ayrılmış parçaları kullanıldı');
  }
  if (!src.path && !src.origin) return toast('Bu dosyanın yolu bilinmiyor', true);
  try {
    sep.status = await window.harman.engineStatus();
  } catch (err) {
    return toast(`Motor durumu okunamadı: ${friendly(err.message)}`, true);
  }
  sep.srcId = clip.srcId;
  el.sepTitle.textContent = 'Vokal ve enstrüman ayır';
  const bold = document.createElement('b');
  bold.textContent = clip.name;
  el.sepClip.replaceChildren(bold, ' şarkısı vokal ve enstrümanlarına ayrılacak. Kaliteyi seç:');
  updateSepChoose();
  showSepView('choose');
  el.sep.hidden = false;
}

function setSepProgress({ text, detail = '', pct = null, error = false }) {
  el.sepPhase.textContent = text;
  el.sepDetail.textContent = detail;
  el.sepPhase.style.color = error ? 'var(--danger)' : '';
  el.sepBar.classList.toggle('indeterminate', pct === null && !error);
  el.sepBar.hidden = error;
  if (pct !== null) el.sepBar.style.setProperty('--p', `${clamp(pct, 0, 100)}%`);
}

function stopSepTimer() {
  clearInterval(sep.timer);
  sep.timer = null;
}

function closeSep() {
  stopSepTimer();
  el.sep.hidden = true;
}

function onSepProgress(p) {
  if (!sep.running) return;
  sep.phase = p.phase;
  switch (p.phase) {
    case 'install':
      sep.installText = p.text ? `Adım ${p.step}/${p.steps}: ${p.text}` : sep.installText;
      setSepProgress({ text: sep.installText || 'Motor kuruluyor', detail: p.detail || '' });
      break;
    case 'prepare':
      setSepProgress({ text: 'Hazırlanıyor' });
      break;
    case 'download':
      setSepProgress({ text: 'Model indiriliyor (tek seferlik)', detail: p.detail, pct: p.pct });
      break;
    case 'convert':
      setSepProgress({ text: 'Model bu bilgisayar için hazırlanıyor (tek seferlik)', detail: 'Birkaç dakika sürebilir.' });
      break;
    case 'separate':
      sep.phaseStart = Date.now();
      stopSepTimer();
      // Motor yüzde bildirmiyor; ölçülen hıza göre tahmini bir ilerleme gösteririz.
      sep.timer = setInterval(() => {
        const elapsed = (Date.now() - sep.phaseStart) / 1000;
        setSepProgress({
          text: 'Parçalara ayrılıyor',
          pct: Math.min(0.95, elapsed / sep.est) * 100,
          detail: `Tahmini süre ≈ ${formatDuration(sep.est)}${elapsed > sep.est ? ' — biraz daha sürüyor' : ''}`,
        });
      }, 300);
      break;
    case 'write':
      stopSepTimer();
      setSepProgress({ text: 'Parçalar yazılıyor', pct: 97 });
      break;
    default:
  }
}

// Ayrılmış parçaları kaynağa bağlar ve bu kaynağı kullanan tüm kliplerde açar.
function enableStems(srcId) {
  const src = state.sources.get(srcId);
  mutate(() => {
    for (const clip of state.clips) {
      if (clip.srcId === srcId) clip.stemGains = Object.fromEntries(Object.keys(src.stems).map((n) => [n, 1]));
    }
  });
  layoutAll();
  onEdited();
}

async function startSeparate() {
  const src = state.sources.get(sep.srcId);
  const model = sep.status.models.find((m) => m.key === sep.model);
  sep.running = true;
  sep.installText = '';
  sep.est = src.buffer.duration / model.speed;
  el.sepStop.textContent = 'İptal';
  showSepView('run');
  setSepProgress({ text: 'Başlatılıyor' });
  try {
    if (!sep.status.installed) {
      await window.harman.installEngine();
      sep.status.installed = true;
    }
    // Tempo/ton değişmiş (türetilmiş) kaynaklar diske yazılıp öyle ayrılır; orijinal dosya eski tempodadır.
    let inputPath = src.path;
    let tempDir = null;
    if (src.origin) {
      setSepProgress({ text: 'Ses hazırlanıyor' });
      const tmp = await window.harman.writeTempWav(encodeWavFloat(src.buffer));
      inputPath = tmp.file;
      tempDir = tmp.dir;
    }
    let result;
    try {
      result = await window.harman.separate(inputPath, sep.model);
    } finally {
      if (tempDir) window.harman.cleanupDir(tempDir);
    }
    stopSepTimer();
    setSepProgress({ text: 'Parçalar yükleniyor' });
    const stems = {};
    for (const s of result.stems) {
      const buffer = await ctx.decodeAudioData(await window.harman.readFile(s.path));
      stems[s.name] = { buffer, peaks: computePeaks(buffer) };
    }
    window.harman.cleanupDir(result.work);
    src.stems = stems;
    markDirty();
    enableStems(sep.srcId);
    closeSep();
    toast(`Ayrıldı: ${Object.keys(stems).map((n) => STEM_LABELS[n] || n).join(', ')}`);
  } catch (err) {
    const msg = friendly(err.message);
    if (msg.includes('İptal edildi')) {
      closeSep();
    } else {
      setSepProgress({ text: 'Ayırma başarısız oldu', detail: msg, error: true });
      el.sepStop.textContent = 'Kapat';
    }
  } finally {
    sep.running = false;
    stopSepTimer();
  }
}

// --------------------------------------------------------------- tempo ve ton
// Bir "kaynak" (state.sources) tek bir ses dosyasıdır. Tempo/ton değiştirilince orijinalden
// yeni bir kaynak türetilir (origin: { srcId, rate, semis }); klip bu kaynağa geçer. Hep
// orijinalden işlenir, böylece tekrar tekrar uygulamak sesi katman katman bozmaz.
const tempo = { bassSwap: true, fadeBeats: 16, refId: null, forClip: null, doTempo: true, doKey: true, semis: 0, semisManual: false, optionsKey: '' };
let analysisQueue = Promise.resolve();

function queueAnalysis(srcId) {
  state.sources.get(srcId).analysis = 'pending';
  analysisQueue = analysisQueue.then(() => analyzeSource(srcId));
}

// Analiz edilen asıl şarkılar (tempo/ton türevleri değil) kütüphaneye yazılır.
function addToLibrary(src) {
  if (!src.path || src.origin || !(src.bpm > 0) || !src.key) return;
  window.harman.libraryUpsert({
    path: src.path, name: src.path.split('/').pop().replace(/\.[^.]+$/, ''),
    bpm: src.bpm, key: src.key, dur: src.buffer?.duration,
  }).catch(() => {});
}

async function analyzeSource(srcId) {
  const src = state.sources.get(srcId);
  try {
    const channels = [src.buffer.getChannelData(0)];
    if (src.buffer.numberOfChannels > 1) channels.push(src.buffer.getChannelData(1));
    const r = await Analysis.analyzeSamples(channels, SAMPLE_RATE);
    Object.assign(src, {
      bpm: r.bpm, beatPhase: r.beatPhase, key: { tonic: r.key.tonic, mode: r.key.mode },
      energy: r.energy, energyHop: r.energyHop, analysis: 'done',
    });
    addToLibrary(src);
  } catch (err) {
    console.error('Analiz başarısız', err);
    src.analysis = 'failed';
  }
  layoutAll();
}

const fmtBpm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

function tagText(clip) {
  const src = sourceOf(clip);
  if (!src) return '';
  if (src.analysis === 'pending') return 'analiz…';
  if (src.analysis !== 'done') return '';
  return `${fmtBpm(src.bpm)} BPM · ${Analysis.camelot(src.key).code}`;
}

function rootOf(clip) {
  const src = sourceOf(clip);
  const rootId = src.origin ? src.origin.srcId : clip.srcId;
  return { rootId, root: state.sources.get(rootId), src };
}

// Aynı şarkıdan olmayan, analizi bitmiş diğer klipler.
function refCandidates(clip) {
  return state.clips.filter((c) => c.id !== clip.id && sourceOf(c).analysis === 'done');
}

// En çok üst üste binen klip, yoksa en yakın başlayan.
function defaultRef(clip, list) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of list) {
    const overlap = Math.min(clipEnd(c), clipEnd(clip)) - Math.max(c.start, clip.start);
    const score = overlap > 0 ? 1e6 + overlap : -Math.abs(c.start - clip.start);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// Hedef tempo: referansın tempo veya yarısı/iki katı, hangisi bizimkine en yakınsa (oktav hatalarını
// ve 85 ↔ 170 gibi yarım/çift tempo farklarını eler).
function matchPlan(clip) {
  const ref = state.clips.find((c) => c.id === tempo.refId);
  if (!ref) return null;
  const { root, src } = rootOf(clip);
  const rs = sourceOf(ref);
  const dist = (f) => Math.abs(Math.log((rs.bpm * f) / root.bpm));
  const factor = [0.5, 1, 2].reduce((best, f) => (dist(f) < dist(best) ? f : best), 1);
  const targetBpm = rs.bpm * factor;
  return {
    ref, targetBpm, pct: (targetBpm / src.bpm - 1) * 100,
    suggested: Analysis.semitonesToMatch(root.key, rs.key),
  };
}

function updateTempo(clip) {
  const { root, src } = rootOf(clip);
  const ready = src.analysis === 'done';
  el.tempoStatus.hidden = ready;
  el.tempoReady.hidden = !ready;
  if (!ready) {
    el.tempoStatus.textContent = src.analysis === 'failed' ? 'Analiz yapılamadı.' : 'BPM ve ton analiz ediliyor…';
    return;
  }

  const derived = !!src.origin;
  if (document.activeElement !== el.bpmInput) el.bpmInput.value = Math.round(src.bpm * 10) / 10;
  el.keyTonic.value = String(src.key.tonic);
  el.keyMode.value = src.key.mode;
  el.keyCode.textContent = Analysis.camelot(src.key).code;
  // Tempo/ton değişmiş bir parçada orijinal değerler kilitli; önce "orijinale dön".
  for (const input of [el.bpmInput, el.bpmHalf, el.bpmDouble, el.bpmTap, el.keyTonic, el.keyMode]) input.disabled = derived;

  const cands = refCandidates(clip);
  if (tempo.forClip !== clip.id) {
    tempo.forClip = clip.id;
    tempo.refId = null;
    tempo.semisManual = false;
  }
  if (!cands.some((c) => c.id === tempo.refId)) tempo.refId = defaultRef(clip, cands)?.id ?? null;

  const optionsKey = cands.map((c) => `${c.id}:${tagText(c)}:${Math.round(c.start)}`).join('|');
  if (optionsKey !== tempo.optionsKey) {
    tempo.optionsKey = optionsKey;
    el.matchRef.replaceChildren(...cands.map((c) => {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = `${c.name} · ${formatTime(c.start, 0)} (${tagText(c)})`;
      return opt;
    }));
  }
  if (tempo.refId !== null) el.matchRef.value = String(tempo.refId);

  el.matchBox.hidden = !cands.length && !derived;
  const plan = matchPlan(clip);
  const lines = [el.matchTempo, el.matchKey, el.matchApply, el.matchAlign, el.matchRef, el.transFind];
  lines.forEach((b) => { b.closest('.match-line, .actions, .inline-row, .trans').hidden = !plan; });
  const transKey = `${clip.id}:${tempo.refId}`;
  if (tempo.transKey !== transKey) { tempo.transKey = transKey; el.transList.replaceChildren(); }
  el.matchReset.hidden = !derived;
  if (!plan) { el.matchWarn.hidden = true; return; }

  if (!tempo.semisManual) tempo.semis = plan.suggested;
  const warnings = [];
  if (tempo.doTempo && Math.abs(plan.pct) > 10) warnings.push('Tempo %10\'dan fazla değişiyor, ses bozulabilir.');
  if (tempo.doKey && Math.abs(tempo.semis) > 3) warnings.push('3 yarım tondan büyük kaydırma sesi bozabilir.');
  el.matchWarn.textContent = warnings.join(' ');
  el.matchWarn.hidden = !warnings.length;

  el.matchTempo.setAttribute('aria-checked', String(tempo.doTempo));
  el.matchKey.setAttribute('aria-checked', String(tempo.doKey));
  el.matchTempoText.textContent = Math.abs(plan.targetBpm - src.bpm) < 0.05
    ? `Tempo zaten ${fmtBpm(src.bpm)} BPM`
    : `${fmtBpm(src.bpm)} → ${fmtBpm(plan.targetBpm)} BPM (${plan.pct > 0 ? '+' : ''}${plan.pct.toFixed(1).replace('.', ',')}%)`;
  const shifted = Analysis.shiftKey(root.key, tempo.semis);
  el.matchKeyText.textContent = tempo.semis === 0
    ? `Ton uyumlu: ${Analysis.keyName(root.key)} · ${Analysis.camelot(root.key).code}`
    : `${tempo.semis > 0 ? '+' : ''}${tempo.semis} yarım ton → ${Analysis.keyName(shifted)} · ${Analysis.camelot(shifted).code}`;
}

// Kaynak bpm'i değişince buna bağlı türetilmiş kaynaklar geçersiz olur.
function setRootBpm(root, value) {
  root.bpm = Math.round(clamp(value, 40, 300) * 100) / 100;
  root.derived?.clear();
  markDirty();
  layoutAll();
}

// 32-bit float WAV: Rubber Band'e kayıpsız gider.
function encodeWavFloat(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const out = new ArrayBuffer(44 + frames * channels * 4);
  const view = new DataView(out);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + frames * channels * 4, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true); view.setUint16(34, 32, true);
  writeStr(36, 'data'); view.setUint32(40, frames * channels * 4, true);
  const data = new Float32Array(out, 44);
  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch);
    for (let i = 0; i < frames; i++) data[i * channels + ch] = src[i];
  }
  return out;
}

async function ensureTools() {
  if ((await window.harman.toolsStatus()).installed) return;
  setSepProgress({ text: 'Tempo ve ton aracı kuruluyor' });
  await window.harman.installTools();
}

// Orijinalden (rootId) rate hızında ve semis yarım ton kaydırılmış bir kaynak üretir (önbellekli).
async function deriveSource(rootId, rate, semis) {
  const root = state.sources.get(rootId);
  if (Math.abs(rate - 1) < 0.0005 && semis === 0) return rootId;
  root.derived ??= new Map();
  const cacheKey = `${rate.toFixed(5)}:${semis}`;
  if (root.derived.has(cacheKey)) return root.derived.get(cacheKey);

  await ensureTools();
  // Ayrılmış parçalar varsa her biri ayrı işlenir; hepsi aynı tempoya gelir.
  const parts = [{ name: null, buffer: root.buffer }, ...Object.entries(root.stems || {}).map(([name, s]) => ({ name, buffer: s.buffer }))];
  const done = [];
  for (let i = 0; i < parts.length; i++) {
    setSepProgress({
      text: 'Tempo ve ton uygulanıyor',
      detail: parts.length > 1 ? `Parça ${i + 1} / ${parts.length}` : '',
      pct: (i / parts.length) * 100,
    });
    const processed = await window.harman.stretch(encodeWavFloat(parts[i].buffer), rate, semis);
    const buffer = await ctx.decodeAudioData(processed);
    if (Math.abs(buffer.duration - parts[i].buffer.duration / rate) > 0.25) throw new Error('İşlenen ses beklenen uzunlukta değil');
    done.push({ name: parts[i].name, buffer, peaks: computePeaks(buffer) });
  }
  const [main, ...stemParts] = done;
  const id = state.nextId++;
  state.sources.set(id, {
    buffer: main.buffer, peaks: main.peaks, path: root.path,
    stems: stemParts.length ? Object.fromEntries(stemParts.map((p) => [p.name, { buffer: p.buffer, peaks: p.peaks }])) : undefined,
    origin: { srcId: rootId, rate, semis },
    bpm: root.bpm * rate, beatPhase: root.beatPhase / rate,
    energy: root.energy, energyHop: root.energyHop / rate,
    key: Analysis.shiftKey(root.key, semis), analysis: 'done',
  });
  root.derived.set(cacheKey, id);
  return id;
}

// Klibi, orijinale göre (hedef BPM, yarım ton) türetilmiş kaynağa geçirir. targetBpm null → orijinal tempo.
// Dönüş: ayrılmış parçalar kaybolduysa true.
async function retarget(clipId, targetBpm, semis) {
  const clip = state.clips.find((c) => c.id === clipId);
  const { rootId, root, src } = rootOf(clip);
  const rate = targetBpm ? Math.round((targetBpm / root.bpm) * 1e5) / 1e5 : 1;
  const hadStems = hasStems(clip);
  const newId = await deriveSource(rootId, rate, semis);

  const live = state.clips.find((c) => c.id === clipId);
  if (!live) return false;
  const next = state.sources.get(newId);
  const k = (src.origin?.rate ?? 1) / (next.origin?.rate ?? 1);   // eski kaynaktaki süreler yeni kaynakta ×k
  mutate(() => {
    live.srcId = newId;
    live.buffer = next.buffer;
    live.peaks = next.peaks;
    live.offset *= k;
    live.stemRamps = scaleRamps(live.stemRamps, k);
    live.dur = Math.min(live.dur * k, next.buffer.duration - live.offset);
    if (!next.stems) live.stemGains = undefined;
    limitFades(live, 'fadeIn');
  });
  layoutAll();
  onEdited();
  return hadStems && !next.stems;
}

// Ayırma penceresini "meşgul" göstergesi olarak kullanıp işi çalıştırır.
async function runBusy(title, job) {
  el.sepTitle.textContent = title;
  showSepView('run');
  el.sepStop.textContent = 'İptal';
  el.sep.hidden = false;
  sep.running = true;
  sep.phase = '';
  setSepProgress({ text: 'Başlatılıyor' });
  try {
    await job();
    closeSep();
    return true;
  } catch (err) {
    const msg = friendly(err.message);
    if (msg.includes('İptal edildi')) {
      closeSep();
    } else {
      setSepProgress({ text: 'İşlem başarısız oldu', detail: msg, error: true });
      el.sepStop.textContent = 'Kapat';
    }
    return false;
  } finally {
    sep.running = false;
    stopSepTimer();
  }
}

async function applyMatch() {
  const clip = selected();
  const plan = clip && matchPlan(clip);
  if (!plan) return;
  const { root, src } = rootOf(clip);
  const targetBpm = tempo.doTempo ? plan.targetBpm : src.bpm;
  const semis = tempo.doKey ? tempo.semis : (src.origin?.semis ?? 0);
  const rate = Math.round((targetBpm / root.bpm) * 1e5) / 1e5;
  if (Math.abs(rate - (src.origin?.rate ?? 1)) < 0.0005 && semis === (src.origin?.semis ?? 0)) {
    return toast('Zaten bu tempo ve tonda');
  }
  let lostStems = false;
  const ok = await runBusy('Tempo ve ton eşleştirme', async () => { lostStems = await retarget(clip.id, targetBpm, semis); });
  if (ok) {
    toast(lostStems ? 'Uygulandı. Ayrılmış parçalar yeni tempo için yeniden ayrılmalı' : 'Tempo ve ton uygulandı');
  }
}

async function resetMatch() {
  const clip = selected();
  if (!clip || !sourceOf(clip).origin) return;
  await retarget(clip.id, null, 0);
  toast('Orijinal tempo ve tona dönüldü');
}

// Klibin vuruş ızgarasını referansınkine oturtur: klibi en fazla yarım vuruş kaydırır.
function alignBeats() {
  const clip = selected();
  const plan = clip && matchPlan(clip);
  if (!plan) return;
  const a = sourceOf(clip);
  const b = sourceOf(plan.ref);
  if (Math.abs(a.bpm - b.bpm) / b.bpm > 0.01) return toast('Vuruşları hizalamak için önce tempoyu eşitle');
  const period = 60 / b.bpm;
  const gridA = clip.start - clip.offset + a.beatPhase;                 // zaman çizelgesinde bir vuruş
  const gridB = plan.ref.start - plan.ref.offset + b.beatPhase;
  let delta = (gridB - gridA) % period;
  if (delta > period / 2) delta -= period;
  if (delta < -period / 2) delta += period;
  if (clip.start + delta < 0) delta += period;
  mutate(() => { clip.start += delta; });
  layoutAll();
  onEdited();
  toast(`Vuruşlar hizalandı (${Math.round(delta * 1000)} ms kaydırıldı)`);
}

function showMatchPanel() {
  const clip = selected();
  if (!clip) return toast('Önce bir parça seç');
  if (sourceOf(clip).analysis !== 'done') return toast('Parça hâlâ analiz ediliyor');
  if (el.matchBox.hidden) return toast('Eşleştirmek için en az iki parça ekle');
  el.matchBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// --------------------------------------------------------------- onay balonu
// Tam ekran pencere yerine, tıklanan butonun yanında yumuşakça beliren küçük bir balon.
let bubbleClose = null;

function confirmBubble(anchor, { title, text, yes }) {
  bubbleClose?.(false);
  return new Promise((resolve) => {
    const b = el.bubble;
    $('bubble-title').textContent = title;
    $('bubble-text').textContent = text;
    $('bubble-yes').textContent = yes;
    b.classList.remove('show');
    b.hidden = false;

    const r = anchor.getBoundingClientRect();
    const width = b.offsetWidth;
    const height = b.offsetHeight;
    const below = window.innerHeight - r.bottom >= height + 24 || r.top < height + 24;
    const left = clamp(r.right - width, 12, window.innerWidth - width - 12);
    const arrowX = clamp(r.left + r.width / 2 - left - 6, 16, width - 28);
    b.style.left = `${left}px`;
    b.style.top = `${below ? r.bottom + 12 : r.top - height - 12}px`;
    b.classList.toggle('below', below);
    b.classList.toggle('above', !below);
    b.style.setProperty('--ax', `${arrowX}px`);
    b.style.setProperty('--ox', `${arrowX + 6}px`);
    b.style.setProperty('--oy', below ? '0' : '100%');
    b.style.setProperty('--from', below ? '-6px' : '6px');
    void b.offsetWidth;                       // başlangıç durumunu uygula, sonra geçişi başlat
    b.classList.add('show');
    $('bubble-no').focus();

    const finish = (result) => {
      bubbleClose = null;
      b.classList.remove('show');
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      setTimeout(() => { if (!b.classList.contains('show')) b.hidden = true; }, 220);
      resolve(result);
    };
    const onOutside = (e) => {
      if (b.contains(e.target)) return;
      // Butona tekrar basmak balonu kapatır; ardından gelen click yeniden açmasın.
      if (anchor.contains(e.target)) anchor.dataset.skipClick = '1';
      finish(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    };
    const onResize = () => finish(false);
    bubbleClose = finish;
    $('bubble-yes').onclick = () => finish(true);
    $('bubble-no').onclick = () => finish(false);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
  });
}

// ------------------------------------------------------------ şarkıyı sıfırla
// Parçada hiç değişiklik yok mu: tam uzunluk, ses/fade/denge varsayılan, tempo ve ton orijinal.
function isPristine(clip) {
  const { root, src } = rootOf(clip);
  const stemsDefault = !clip.stemGains || Object.values(clip.stemGains).every((g) => g === 1);
  return !src.origin && clip.offset === 0
    && Math.abs(clip.dur - root.buffer.duration) < 0.001
    && clip.gain === 1 && clip.fadeIn === 0 && clip.fadeOut === 0 && stemsDefault
    && !clip.eqLow && !clip.eqHigh && !clip.bassSwap
    && !clip.pan && !clip.stemRamps && Object.values(clip.stemPans || {}).every((v) => v === 0);
}

// Seçili parçayı sıfırlar: kırpma, fade, seviyeler, denge, zamanlı geçişler, tempo ve ton. Tek adım
// (tek ⌘Z). Başka parçalara dokunmaz; kesilen bir parçanın sıfırlanması onu tüm şarkıya geri açar.
// Vokal ayırma sonucu ve hat korunur.
function resetSong() {
  const clip = selected();
  if (!clip) return;
  const { rootId, root } = rootOf(clip);
  const hadStems = hasStems(clip);
  mutate(() => {
    Object.assign(clip, {
      srcId: rootId, buffer: root.buffer, peaks: root.peaks,
      start: Math.max(0, clip.start - clip.offset), offset: 0, dur: root.buffer.duration,
      fadeIn: 0, fadeOut: 0, gain: 1, pan: 0, stemPans: undefined, stemRamps: undefined,
      eqLow: undefined, eqHigh: undefined, bassSwap: undefined,
      stemGains: root.stems ? Object.fromEntries(Object.keys(root.stems).map((n) => [n, 1])) : undefined,
    });
  });
  layoutAll();
  onEdited();
  toast(hadStems && !root.stems
    ? 'Parça sıfırlandı. Ayrılmış parçalar tempo değişimine aitti, yeniden ayırman gerekir'
    : 'Parça sıfırlandı. ⌘Z ile geri alabilirsin');
}

el.insReset.addEventListener('click', async () => {
  if (el.insReset.dataset.skipClick) { delete el.insReset.dataset.skipClick; return; }
  const clip = selected();
  if (!clip || isPristine(clip)) return;
  const ok = await confirmBubble(el.insReset, {
    title: 'Parça sıfırlansın mı?',
    text: 'Bu parçadaki kırpma, fade, ses seviyesi, denge, zamanlı geçiş, tempo ve ton değişikliklerinin hepsi geri alınır. Diğer parçalara dokunulmaz. İstersen ⌘Z ile geri getirirsin.',
    yes: 'Sıfırla',
  });
  if (ok && selected() === clip) resetSong();
});

// ----------------------------------------------------------------------- pano
// Kopyalanan parçalar uygulama içinde tutulur; yapıştırılan her parça kendi kaynak kaydını alır
// (bölünen parçalar gibi bağımsızdır).
function copySelected() {
  const chosen = selectedClips();
  if (!chosen.length) return toast('Önce bir parça seç');
  state.clipboard = chosen.map((c) => ({
    srcId: c.srcId, name: c.name, track: c.track, start: c.start, offset: c.offset, dur: c.dur,
    fadeIn: c.fadeIn, fadeOut: c.fadeOut, gain: c.gain, pan: c.pan, hue: c.hue, mute: c.mute, solo: c.solo, eqLow: c.eqLow, eqHigh: c.eqHigh, bassSwap: c.bassSwap, ...copyMixParams(c),
  }));
  toast(chosen.length > 1 ? `${chosen.length} parça kopyalandı` : 'Parça kopyalandı');
}

function cutSelected() {
  if (!selectedClips().length) return toast('Önce bir parça seç');
  copySelected();
  deleteSelected();
}

// time: yapıştırılan grubun en soldaki parçasının başlayacağı saniye; track: onun hattı.
function pasteClips(time = state.playhead, track = null) {
  const items = state.clipboard;
  if (!items?.length) return toast('Panoda parça yok. Önce bir parçayı kopyala');
  const first = items.reduce((a, i) => (i.start < a.start ? i : a), items[0]);
  const tracks = items.map((i) => i.track);
  const shift = track === null
    ? 0
    : clamp(track - first.track, -Math.min(...tracks), TRACK_COUNT - 1 - Math.max(...tracks));
  mutate(() => {
    const created = [];
    for (const item of items) {
      const srcId = cloneSource(item.srcId);
      const entry = state.sources.get(srcId);
      const clip = {
        ...item, ...copyMixParams(item), id: state.nextId++, srcId, buffer: entry.buffer, peaks: entry.peaks,
        track: item.track + shift, start: Math.max(0, time + (item.start - first.start)),
      };
      state.clips.push(clip);
      createClipElement(clip);
      created.push(clip.id);
    }
    setSelection(created);
  });
  layoutAll();
  onEdited();
  toast(items.length > 1 ? `${items.length} parça yapıştırıldı` : 'Parça yapıştırıldı');
}

// ------------------------------------------------------------------ sağ tık menüsü
const ctxEl = $('ctx');
let ctxClose = null;
const isMac = navigator.platform.includes('Mac');

// items: { label, hint?, run, disabled?, danger? } veya 'sep'.
function showContextMenu(x, y, items) {
  ctxClose?.();
  ctxEl.replaceChildren();
  const buttons = [];
  for (const item of items) {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      ctxEl.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (item.danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.disabled = !!item.disabled;
    const label = document.createElement('span');
    label.textContent = item.label;
    btn.appendChild(label);
    if (item.hint) {
      const hint = document.createElement('kbd');
      hint.textContent = item.hint;
      btn.appendChild(hint);
    }
    btn.addEventListener('click', () => { close(); item.run(); });
    ctxEl.appendChild(btn);
    if (!item.disabled) buttons.push(btn);
  }

  ctxEl.classList.remove('show');
  ctxEl.hidden = false;
  const w = ctxEl.offsetWidth;
  const h = ctxEl.offsetHeight;
  const left = x + w > window.innerWidth - 8 ? Math.max(8, x - w) : x;
  const flipUp = y + h > window.innerHeight - 8;
  const top = flipUp ? Math.max(8, y - h) : y;
  ctxEl.style.left = `${left}px`;
  ctxEl.style.top = `${top}px`;
  ctxEl.style.setProperty('--ox', x + w > window.innerWidth - 8 ? '100%' : '0');
  ctxEl.style.setProperty('--oy', flipUp ? '100%' : '0');
  void ctxEl.offsetWidth;
  ctxEl.classList.add('show');

  function close() {
    if (!ctxClose) return;
    ctxClose = null;
    ctxEl.classList.remove('show');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('blur', close);
    el.timeline.removeEventListener('wheel', close);
    setTimeout(() => { if (!ctxEl.classList.contains('show')) ctxEl.hidden = true; }, 160);
  }
  const onOutside = (e) => { if (!ctxEl.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const i = buttons.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i <= 0 ? buttons.length - 1 : i - 1);
      buttons[next]?.focus();
    }
  };
  ctxClose = close;
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  el.timeline.addEventListener('wheel', close, { once: true });
}

const insideClip = (c, t) => t > c.start + MIN_CLIP && t < clipEnd(c) - MIN_CLIP;

function clipMenu(time, track) {
  const primary = selected();
  const t = state.playhead;
  const many = state.selection.size > 1;
  return [
    { label: many ? 'Seçilenleri kopyala' : 'Kopyala', hint: '⌘C', run: copySelected },
    { label: many ? 'Seçilenleri kes' : 'Kes', hint: '⌘X', run: cutSelected },
    { label: 'Buraya yapıştır', hint: '⌘V', disabled: !state.clipboard, run: () => pasteClips(time, track) },
    'sep',
    { label: many ? 'Seçilenleri çoğalt' : 'Çoğalt', hint: '⌘D', run: duplicateSelected },
    { label: 'Oynatma çizgisinden böl', hint: 'S', disabled: !selectedClips().some((c) => insideClip(c, t)), run: splitSelected },
    { label: 'Başlangıcı çizgiye kırp', hint: 'Q', disabled: !(primary && t > primary.start + 0.001 && t < clipEnd(primary) - MIN_CLIP), run: () => trimToPlayhead('start') },
    { label: 'Bitişi çizgiye kırp', hint: 'W', disabled: !(primary && t > primary.start + MIN_CLIP && t < clipEnd(primary) - 0.001), run: () => trimToPlayhead('end') },
    'sep',
    { label: 'Seçilenlerin seviyesini eşitle', disabled: !many, run: equalizeLevels },
    { label: 'Vokal / enstrüman ayır…', hint: '⇧⌘S', run: openSeparate },
    { label: 'Tempo ve tonu eşleştir…', hint: '⇧⌘M', run: showMatchPanel },
    { label: 'Geçiş önerileri…', run: () => { showMatchPanel(); findTransitions(); } },
    { label: 'Şarkıları otomatik sırala ve karıştır…', run: automix },
    { label: 'Parçayı sıfırla…', disabled: !primary || isPristine(primary), run: () => el.insReset.click() },
    'sep',
    { label: selectedClips().every((c) => c.mute) ? 'Sesi aç' : 'Sessize al', hint: '⌥M', run: () => toggleClipFlag('mute') },
    { label: selectedClips().every((c) => c.solo) ? 'Solo\'yu kapat' : 'Solo', hint: '⌥S', run: () => toggleClipFlag('solo') },
    { label: 'Yeniden adlandır…', hint: 'F2', disabled: !primary, run: () => beginRename(primary) },
    'sep',
    { label: many ? 'Seçilenleri sil' : 'Sil', hint: '⌫', danger: true, run: deleteSelected },
  ];
}

function laneMenu(time, track) {
  return [
    { label: 'Yapıştır', hint: '⌘V', disabled: !state.clipboard, run: () => pasteClips(time, track) },
    { label: 'Oynatma çizgisini buraya getir', run: () => goTo(time) },
    { label: 'İşaretçi ekle', hint: 'M', run: () => addMarkerAt(time) },
    'sep',
    { label: 'Tümünü seç', hint: '⌘A', disabled: !state.clips.length, run: () => { setSelection(state.clips.map((c) => c.id)); syncSelectionUI(); } },
    { label: 'Şarkı ekle…', hint: '⌘O', run: pickAndAdd },
    { label: 'Şarkıları otomatik sırala ve karıştır…', disabled: state.clips.length < 2, run: automix },
    'sep',
    { label: state.trackOn[track] ? `${TRACK_NAMES[track]}. hattı sessize al` : `${TRACK_NAMES[track]}. hattı çaldır`, run: () => toggleTrack(track) },
  ];
}

el.timeline.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (e.target.closest('.ruler') || e.target.closest('.track-label') || !e.target.closest('.tracks')) return;
  const rect = el.tracks.getBoundingClientRect();
  const track = clamp(Math.floor((e.clientY - rect.top) / (rect.height / TRACK_COUNT)), 0, TRACK_COUNT - 1);
  const time = timeAt(e.clientX);
  const clipEl = e.target.closest('.clip');
  if (clipEl) {
    const clip = state.clips.find((c) => c.id === Number(clipEl.dataset.clipId));
    if (!clip) return;
    if (!state.selection.has(clip.id)) select(clip.id);       // seçili grubun üyesine tıklandıysa grup kalır
    showContextMenu(e.clientX, e.clientY, clipMenu(time, track));
  } else {
    showContextMenu(e.clientX, e.clientY, laneMenu(time, track));
  }
});

// ------------------------------------------------------------ akıllı geçiş önerileri
// Seçili parça giren parça (B), referans parça çıkan parça (A). Öneriler tempo, ton, enerji ve vuruş
// ızgarasına bakar (transitions.js); uygulayınca B konumlanır, A geçiş yerinde biter, ikisine
// crossfade verilir ve istenirse B'nin tempo ve tonu ayarlanır. Hepsi tek geri alma adımıdır.
function describeForTransition(clip) {
  const src = sourceOf(clip);
  return {
    bpm: src.bpm, beatPhase: src.beatPhase, key: src.key, rootKey: rootOf(clip).root.key,
    energy: src.energy, energyHop: src.energyHop, offset: clip.offset, dur: clip.dur, start: clip.start,
  };
}

function findTransitions() {
  const b = selected();
  const a = state.clips.find((c) => c.id === tempo.refId);
  if (!b || !a) return toast('Önce giren parçayı seç ve referans (çıkan) parçayı belirle');
  const list = Transitions.suggestTransitions(describeForTransition(a), describeForTransition(b), Analysis, { crossfadeBeats: tempo.fadeBeats });
  renderTransitions(list, a, b);
}

function renderTransitions(list, a, b) {
  if (!list.length) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.textContent = 'Uygun bir geçiş noktası bulunamadı. Parçalar çok kısa veya giren parça için yeterli alan yok.';
    el.transList.replaceChildren(none);
    return;
  }
  const bSrc = sourceOf(b);
  el.transList.replaceChildren(...list.map((s, i) => {
    const card = document.createElement('div');
    card.className = 'trans-card';
    const head = document.createElement('div');
    head.className = 'trans-head';
    const title = document.createElement('b');
    title.textContent = `${i + 1}. ${formatTime(s.tlA, 0)} noktasında geç`;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `Puan ${s.score}`;
    head.append(title, score);

    const lines = [
      s.entryKind === 'drop'
        ? `${b.name}'nin ${formatTime(s.bPoint, 0)}'deki güçlü bölümü, ${a.name} bittiği anda (${formatTime(s.tlA, 0)}) devreye girer; öncesinde ${s.lead.toFixed(1).replace('.', ',')} sn karışım`
        : `${b.name} baştan girer; ${a.name} ${formatTime(s.tlA, 0)}'den itibaren ${s.crossfade.toFixed(1).replace('.', ',')} sn (${Math.round(s.beats)} vuruş) crossfade ile biter`,
      Math.abs(s.tempoPct) < 0.0005
        ? `Tempo zaten ${fmtBpm(bSrc.bpm)} BPM`
        : `Tempo ${fmtBpm(bSrc.bpm)} → ${fmtBpm(s.targetBpm)} BPM (${s.tempoPct > 0 ? '+' : ''}${(s.tempoPct * 100).toFixed(1).replace('.', ',')}%)`,
      s.semis === 0 ? 'Tonlar uyumlu' : `Ton ${s.semis > 0 ? '+' : ''}${s.semis} yarım ton kaydırılır${Math.abs(s.semis) > 3 ? ' (büyük kaydırma sesi bozabilir)' : ''}`,
      ...s.reasons,
    ];
    const body = document.createElement('ul');
    body.className = 'trans-lines';
    for (const text of lines) {
      const li = document.createElement('li');
      li.textContent = text;
      body.appendChild(li);
    }
    const actions = document.createElement('div');
    actions.className = 'trans-actions';
    const apply = document.createElement('button');
    apply.className = 'btn primary mini';
    apply.textContent = 'Uygula';
    apply.addEventListener('click', () => applyTransition(s, a.id, b.id, false));
    const listen = document.createElement('button');
    listen.className = 'btn solid mini';
    listen.textContent = 'Uygula ve döngüde dinle';
    listen.addEventListener('click', () => applyTransition(s, a.id, b.id, true));
    actions.append(apply, listen);
    card.append(head, body, actions);
    return card;
  }));
}

async function applyTransition(s, aId, bId, listen, { inBusy = false } = {}) {
  const a0 = state.clips.find((c) => c.id === aId);
  const b0 = state.clips.find((c) => c.id === bId);
  if (!a0 || !b0) return toast('Parçalar değişmiş, önerileri yeniden bul');
  const srcB = sourceOf(b0);
  const rootB = rootOf(b0).root;
  const curRate = srcB.origin?.rate ?? 1;
  const curSemis = srcB.origin?.semis ?? 0;
  // Tempo ve ton, eşleştirme bölümündeki kutulara uyar: kapalıysa yalnızca konum ve geçiş uygulanır.
  const wantRate = tempo.doTempo ? Math.round((s.targetBpm / rootB.bpm) * 1e5) / 1e5 : curRate;
  const wantSemis = tempo.doKey ? s.semis : curSemis;
  const needRetarget = Math.abs(wantRate - curRate) > 0.0005 || wantSemis !== curSemis;

  let tlA = 0;
  const job = () => groupUndo(async () => {
    let bPoint = s.bPoint;
    if (needRetarget) {
      await retarget(bId, Math.abs(wantRate - 1) < 0.0005 ? null : wantRate * rootB.bpm, wantSemis);
      const rateNow = sourceOf(state.clips.find((c) => c.id === bId)).origin?.rate ?? 1;
      bPoint *= curRate / rateNow;          // B'nin kaynak saniyeleri yeni tempoya göre ölçeklenir
    }
    const a = state.clips.find((c) => c.id === aId);
    const b = state.clips.find((c) => c.id === bId);
    mutate(() => {
      tlA = a.start + (s.aPoint - a.offset);
      let fade = s.crossfade;
      if (s.entryKind === 'drop') {
        // B'nin güçlü bölümü A'nın bittiği vuruşa iner: B'nin girişi bir crossfade uzunluğuna kısalır,
        // A'nın sonuyla karışır, ardından A biter ve B'nin güçlü bölümü başlar.
        fade = Math.min(s.crossfade, bPoint - b.offset);
        const cut = bPoint - fade - b.offset;
        b.offset += cut;
        b.dur -= cut;
        b.start = Math.max(0, tlA - fade);
        if (tlA < clipEnd(a) - 0.01) a.dur = tlA - a.start;
      } else {
        b.start = Math.max(0, tlA - (bPoint - b.offset));      // B'nin ilk vuruşu A'nın geçiş vuruşuna oturur
        if (tlA + fade < clipEnd(a) - 0.01) a.dur = tlA + fade - a.start;   // A, geçişin sonunda biter
      }
      a.fadeOut = Math.min(fade, a.dur);
      limitFades(a, 'fadeOut');
      b.fadeIn = fade;
      limitFades(b, 'fadeIn');
      if (tempo.bassSwap) { a.bassSwap = true; b.bassSwap = true; }
      if (b.track === a.track) {                              // iki parça aynı hatta olmasın
        b.track = [0, 1, 2, 3].find((t) => t !== a.track);
        laneOf(b.track).appendChild(b.el);
      }
      setSelection([b.id]);
    });
  });

  if (inBusy) {
    await job();
    layoutAll();
    return;
  }
  if (needRetarget) {
    const ok = await runBusy('Geçiş uygulanıyor', job);
    if (!ok) return;
  } else {
    await job();
  }
  layoutAll();
  syncSelectionUI();
  goTo(Math.max(0, tlA - 6));
  toast(`Geçiş uygulandı (${formatTime(tlA, 0)}). ⌘Z ile tek adımda geri alabilirsin`);
  if (listen) {
    // Geçiş bölgesi (öncesinde ve sonrasında 5 sn) döngüde çalar; kapatmak için L.
    const b = state.clips.find((c) => c.id === bId);
    setLoop(Math.max(0, b.start - 5), b.start + b.fadeIn + 5);
    state.marker = state.loop?.from ?? state.marker;
    seek(state.marker);
    play();
    toast('Geçiş döngüde çalıyor. Kapatmak için L');
  }
}

// ---------------------------------------------------- otomatik sırala ve karıştır
// Seçili parçaları (seçim yoksa hepsini) birbirine en uygun sıraya dizer ve her ardışık çift için en iyi
// geçişi uygular. Sıra açgözlü seçilir: en soldaki parçadan başlar, her adımda tempoca ve tonca en yakın
// kalan parça gelir. Tempo/ton değişimi eşleştirme bölümündeki kutulara uyar. Hepsi tek geri alma adımıdır.
function transitionCost(a, b) {
  const dist = (f) => Math.abs(Math.log((a.bpm * f) / b.bpm));
  const factor = [0.5, 1, 2].reduce((best, f) => (dist(f) < dist(best) ? f : best), 1);
  const pct = Math.abs((a.bpm * factor) / b.bpm - 1) * 100;
  const semis = Math.abs(Analysis.semitonesToMatch(b.key, a.key));
  return pct * 0.6 + semis * 1.2;
}

// Sıra açgözlü kurulur: seçilen ilk şarkıdan başlar, her adımda tempoca ve tonca en yakın kalan gelir.
// maxCost: bundan uyumsuz bir sonraki şarkı kalırsa dizilim durur (kalanlar atlanır).
// targetSec: tahmini toplam süre buna ulaşınca durur (0 = hepsi).
function planOrder(clips, { start = null, maxCost = Infinity, targetSec = 0 } = {}) {
  const rest = [...clips].sort((x, y) => x.start - y.start);
  const first = rest.splice(Math.max(0, rest.findIndex((c) => c.id === start)), 1)[0];
  const order = [first];
  let total = first.dur * 0.8;
  const skipped = [];
  while (rest.length) {
    if (targetSec > 0 && total >= targetSec && order.length >= 2) break;      // en az iki şarkı olmadan karışım olmaz
    const cur = sourceOf(order[order.length - 1]);
    let best = 0;
    let bestCost = Infinity;
    rest.forEach((c, i) => {
      const cost = transitionCost(cur, sourceOf(c));
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    if (bestCost > maxCost) break;
    const next = rest.splice(best, 1)[0];
    order.push(next);
    total += next.dur * 0.8;
  }
  skipped.push(...rest);
  return { order, skipped, estimate: total };
}

// Seçim penceresi: dahil edilecek şarkılar, ilk şarkı, uyumsuzları atlama ve hedef süre. Seçilen sırayı döndürür.
function chooseAutomix(clips) {
  return new Promise((resolve) => {
    const dlg = $('automix');
    const songs = $('am-songs');
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    const rows = sorted.map((c) => {
      const row = document.createElement('label');
      row.className = 'am-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'am-start';
      radio.title = 'İlk çalacak şarkı';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = true;
      check.title = 'Karışıma dahil et';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = c.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = tagText(c);
      row.append(radio, check, nm, meta);
      return { clip: c, radio, check, row };
    });
    rows[0].radio.checked = true;
    const head = document.createElement('div');
    head.className = 'am-head';
    head.innerHTML = '<span title="İlk şarkı">İlk</span><span title="Dahil">✓</span><span>Şarkı</span>';
    songs.replaceChildren(head, ...rows.map((r) => r.row));

    const compute = () => {
      const chosen = rows.filter((r) => r.check.checked).map((r) => r.clip);
      const startRow = rows.find((r) => r.radio.checked);
      let start = startRow && startRow.check.checked ? startRow.clip.id : chosen[0]?.id;
      if (chosen.length < 2) return { plan: null, chosen };
      const plan = planOrder(chosen, { start, maxCost: $('am-skip').checked ? 14 : Infinity, targetSec: Number($('am-dur').value || 0) * 60 });
      return { plan, chosen };
    };
    const refresh = () => {
      const { plan, chosen } = compute();
      const go = $('am-go');
      if (!plan) { $('am-preview').textContent = chosen.length < 2 ? 'Karıştırmak için en az iki şarkı seç.' : ''; go.disabled = true; return; }
      go.disabled = false;
      const lines = plan.order.map((c, i) => `${i + 1}. ${c.name}`);
      const est = Math.round(plan.estimate / 60);
      $('am-preview').textContent = `Sıra (yaklaşık ${est} dk):\n${lines.join('\n')}${plan.skipped.length ? `\nAtlanan: ${plan.skipped.map((c) => c.name).join(', ')}` : ''}`;
    };
    const finish = (result) => {
      dlg.hidden = true;
      cleanup();
      resolve(result);
    };
    const onGo = () => { const { plan } = compute(); finish(plan ? plan.order : null); };
    const onCancel = () => finish(null);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    const onBackdrop = (e) => { if (e.target === dlg) onCancel(); };
    const cleanup = () => {
      $('am-go').removeEventListener('click', onGo);
      $('am-cancel').removeEventListener('click', onCancel);
      $('am-close').removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKey, true);
      dlg.removeEventListener('pointerdown', onBackdrop);
      songs.removeEventListener('change', refresh);
      $('am-skip').removeEventListener('change', refresh);
      $('am-dur').removeEventListener('input', refresh);
    };
    $('am-go').addEventListener('click', onGo);
    $('am-cancel').addEventListener('click', onCancel);
    $('am-close').addEventListener('click', onCancel);
    window.addEventListener('keydown', onKey, true);
    dlg.addEventListener('pointerdown', onBackdrop);
    songs.addEventListener('change', refresh);
    $('am-skip').addEventListener('change', refresh);
    $('am-dur').addEventListener('input', refresh);
    refresh();
    dlg.hidden = false;
  });
}

async function automix() {
  const picked = selectedClips().length > 1 ? selectedClips() : state.clips;
  if (picked.length < 2) return toast('Karıştırmak için en az iki parça ekle');
  if (picked.some((c) => sourceOf(c).analysis !== 'done')) return toast('Parçaların analizi bitmedi, birkaç saniye sonra tekrar dene');
  const order = await chooseAutomix(picked);
  if (order) await runAutomix(order);
}

// Verilen sırayla her ardışık çifte en iyi geçişi uygular. Tek geri alma adımıdır.
async function runAutomix(order) {
  const ids = order.map((c) => c.id);
  let made = 0;
  const done = await runBusy('Otomatik karıştırma', () => groupUndo(async () => {
    for (let i = 0; i < ids.length - 1; i++) {
      setSepProgress({ text: `Geçiş ${i + 1} / ${ids.length - 1}`, detail: order[i + 1].name, pct: (i / (ids.length - 1)) * 100 });
      const a = state.clips.find((c) => c.id === ids[i]);
      const b = state.clips.find((c) => c.id === ids[i + 1]);
      const [s] = Transitions.suggestTransitions(describeForTransition(a), describeForTransition(b), Analysis, { max: 1, crossfadeBeats: tempo.fadeBeats, minPlayed: a.dur * 0.6 });
      if (s) {
        await applyTransition(s, a.id, b.id, false, { inBusy: true });
      } else {
        // Uygun nokta bulunamadı (kısa parça gibi): B, A'nın sonuna kısa bir crossfade ile eklenir.
        mutate(() => {
          const fade = Math.min(6, a.dur / 2, b.dur / 2);
          b.start = Math.max(0, clipEnd(a) - fade);
          a.fadeOut = fade;
          b.fadeIn = fade;
          b.track = [0, 1, 2, 3].find((t) => t !== a.track);
          laneOf(b.track).appendChild(b.el);
        });
      }
      made++;
    }
  }));
  if (!done) return;
  setSelection([]);
  syncSelectionUI();
  layoutAll();
  fitAll();
  goTo(0);
  toast(`${made + 1} parça karıştırıldı. ⌘Z ile geri alabilirsin`);
}

el.transFind.addEventListener('click', findTransitions);

// Geçiş şablonları: uzunluk (vuruş), bas takası, tempo ve ton eşitleme ayarlarını bir isimle saklar.
// Hazır şablonlar sabittir; kendi şablonların bu bilgisayarda saklanır.
const BUILTIN_TEMPLATES = [
  { name: 'Dengeli', fadeBeats: 16, bassSwap: true, doTempo: true, doKey: true },
  { name: 'Uzun ve yumuşak', fadeBeats: 32, bassSwap: true, doTempo: true, doKey: true },
  { name: 'Hızlı kesme', fadeBeats: 8, bassSwap: false, doTempo: true, doKey: true },
  { name: 'Sadece karıştır (tempo/ton değişmez)', fadeBeats: 16, bassSwap: true, doTempo: false, doKey: false },
];
const readUserTemplates = () => {
  try {
    const list = JSON.parse(localStorage.getItem('harman.transTemplates') || '[]');
    return Array.isArray(list) ? list.filter((t) => t && typeof t.name === 'string') : [];
  } catch { return []; }
};
const writeUserTemplates = (list) => { try { localStorage.setItem('harman.transTemplates', JSON.stringify(list)); } catch { /* özel pencere */ } };

function renderTemplateOptions(selectName = '') {
  const sel = el.transTemplate;
  sel.replaceChildren();
  const add = (parent, t, key) => { const o = document.createElement('option'); o.value = key; o.textContent = t.name; parent.appendChild(o); };
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Seç…';
  sel.appendChild(ph);
  const b = document.createElement('optgroup');
  b.label = 'Hazır';
  BUILTIN_TEMPLATES.forEach((t, i) => add(b, t, `b:${i}`));
  sel.appendChild(b);
  const mine = readUserTemplates();
  if (mine.length) {
    const u = document.createElement('optgroup');
    u.label = 'Benim şablonlarım';
    mine.forEach((t, i) => add(u, t, `u:${i}`));
    sel.appendChild(u);
  }
  sel.value = selectName;
  el.tplDel.hidden = !sel.value.startsWith('u:');
}

function currentTemplateSettings() {
  return { fadeBeats: tempo.fadeBeats, bassSwap: tempo.bassSwap, doTempo: tempo.doTempo, doKey: tempo.doKey };
}

function applyTemplate(t) {
  tempo.fadeBeats = t.fadeBeats;
  tempo.bassSwap = !!t.bassSwap;
  tempo.doTempo = !!t.doTempo;
  tempo.doKey = !!t.doKey;
  el.transBeats.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.beats) === tempo.fadeBeats)));
  el.transBass.setAttribute('aria-checked', String(tempo.bassSwap));
  updateInspector();
  if (el.transList.children.length) findTransitions();
  toast(`Şablon uygulandı: ${t.name}`);
}

el.transTemplate.addEventListener('change', () => {
  const [kind, idx] = el.transTemplate.value.split(':');
  const t = kind === 'b' ? BUILTIN_TEMPLATES[Number(idx)] : kind === 'u' ? readUserTemplates()[Number(idx)] : null;
  el.tplDel.hidden = kind !== 'u';
  if (t) applyTemplate(t);
});
el.tplSave.addEventListener('click', () => {
  el.tplForm.hidden = !el.tplForm.hidden;
  if (!el.tplForm.hidden) { el.tplName.value = ''; el.tplName.focus(); }
});
const saveTemplate = () => {
  const name = el.tplName.value.trim();
  if (!name) return toast('Şablona bir ad ver');
  const list = readUserTemplates().filter((t) => t.name !== name);
  list.push({ name, ...currentTemplateSettings() });
  writeUserTemplates(list);
  el.tplForm.hidden = true;
  renderTemplateOptions(`u:${list.length - 1}`);
  toast(`Şablon kaydedildi: ${name}`);
};
el.tplOk.addEventListener('click', saveTemplate);
el.tplName.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); saveTemplate(); }
  else if (e.key === 'Escape') { e.preventDefault(); el.tplForm.hidden = true; }
});
el.tplDel.addEventListener('click', () => {
  const [kind, idx] = el.transTemplate.value.split(':');
  if (kind !== 'u') return;
  const list = readUserTemplates();
  const [gone] = list.splice(Number(idx), 1);
  writeUserTemplates(list);
  renderTemplateOptions('');
  toast(`Şablon silindi: ${gone?.name ?? ''}`);
});
renderTemplateOptions();
el.transBeats.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-beats]');
  if (!btn) return;
  tempo.fadeBeats = Number(btn.dataset.beats);
  el.transBeats.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  if (el.transList.children.length) findTransitions();       // liste açıksa yeni uzunlukla yenile
});

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

// ----------------------------------------------------------------- olaylar
$('btn-add').addEventListener('click', pickAndAdd);
$('empty-add').addEventListener('click', pickAndAdd);
el.btnPlay.addEventListener('click', togglePlay);
el.btnStart.addEventListener('click', actions.start);
el.btnExport.addEventListener('click', exportMix);
$('zoom-in').addEventListener('click', () => actions['zoom-in']());
$('zoom-out').addEventListener('click', () => actions['zoom-out']());
$('zoom-fit').addEventListener('click', fitAll);
$('btn-help').addEventListener('click', () => toggleHelp(true));
$('stems-export').addEventListener('click', exportStems);
$('help-close').addEventListener('click', () => toggleHelp(false));
el.help.addEventListener('pointerdown', (e) => { if (e.target === el.help) toggleHelp(false); });

$('stems-open').addEventListener('click', openSeparate);
$('stems-vocal').addEventListener('click', () => setStemPreset('vocal'));
$('stems-inst').addEventListener('click', () => setStemPreset('inst'));
$('stems-all').addEventListener('click', () => setStemPreset('all'));
$('sep-close').addEventListener('click', () => { if (!sep.running) closeSep(); });
$('sep-cancel').addEventListener('click', closeSep);
el.sepStart.addEventListener('click', startSeparate);
el.sepStop.addEventListener('click', () => (sep.running ? window.harman.cancelSeparate() : closeSep()));
el.sep.addEventListener('pointerdown', (e) => { if (e.target === el.sep && !sep.running) closeSep(); });
window.harman.onEngineProgress(onSepProgress);
window.harman.onSeparateProgress(onSepProgress);

// Tempo ve ton
el.keyTonic.replaceChildren(...Analysis.NOTE_NAMES.map((name, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = name;
  return opt;
}));
const editableRoot = () => {
  const clip = selected();
  if (!clip) return null;
  const { root, src } = rootOf(clip);
  return src.origin ? null : root;
};
el.bpmInput.addEventListener('change', () => {
  const root = editableRoot();
  if (root && Number(el.bpmInput.value) > 0) setRootBpm(root, Number(el.bpmInput.value));
  else updateInspector();
});
// Ritme vurma: vuruşlar arası medyan aralıktan BPM hesaplanır; 2,5 sn vuruş gelmezse sayım sıfırlanır.
const taps = [];
let tapTimer = null;
function tapTempo() {
  const root = editableRoot();
  if (!root) return toast('BPM, tempo ve tonu değiştirilmemiş bir parçada ayarlanır');
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2500) taps.length = 0;
  taps.push(now);
  if (taps.length > 10) taps.shift();
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { taps.length = 0; el.bpmTap.textContent = 'Vur (T)'; }, 2500);
  if (taps.length < 3) { el.bpmTap.textContent = `${taps.length}…`; return; }
  const gaps = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
  const bpm = 60000 / gaps[Math.floor(gaps.length / 2)];
  el.bpmTap.textContent = `${Math.round(bpm * 10) / 10} · devam`;
  setRootBpm(root, bpm);
}
el.bpmTap.addEventListener('click', tapTempo);
el.bpmHalf.addEventListener('click', () => { const r = editableRoot(); if (r) setRootBpm(r, r.bpm / 2); });
el.bpmDouble.addEventListener('click', () => { const r = editableRoot(); if (r) setRootBpm(r, r.bpm * 2); });
const onKeyEdit = () => {
  const root = editableRoot();
  if (!root) return;
  root.key = { ...root.key, tonic: Number(el.keyTonic.value), mode: el.keyMode.value };
  tempo.semisManual = false;
  markDirty();
  layoutAll();
};
el.keyTonic.addEventListener('change', onKeyEdit);
el.keyMode.addEventListener('change', onKeyEdit);
el.matchRef.addEventListener('change', () => {
  tempo.refId = Number(el.matchRef.value);
  tempo.semisManual = false;
  updateInspector();
});
el.matchTempo.addEventListener('click', () => { tempo.doTempo = !tempo.doTempo; updateInspector(); });
el.matchKey.addEventListener('click', () => { tempo.doKey = !tempo.doKey; updateInspector(); });
el.semiMinus.addEventListener('click', () => { tempo.semis = clamp(tempo.semis - 1, -12, 12); tempo.semisManual = true; updateInspector(); });
el.semiPlus.addEventListener('click', () => { tempo.semis = clamp(tempo.semis + 1, -12, 12); tempo.semisManual = true; updateInspector(); });
el.matchApply.addEventListener('click', applyMatch);
el.matchAlign.addEventListener('click', alignBeats);
el.matchReset.addEventListener('click', resetMatch);

el.normalize.addEventListener('click', () => {
  state.normalize = !state.normalize;
  markDirty();
  el.normalize.setAttribute('aria-checked', String(state.normalize));
});

window.harman.onFilesDropped(async (paths) => {
  const proj = paths.find((p) => p.endsWith('.harman'));
  if (proj) {
    if (!(await confirmDiscard('açarken'))) return;
    try { await openProjectFile(proj); } catch (err) { toast(`Proje açılamadı: ${friendly(err.message)}`, true); }
    return;
  }
  addFiles(paths);
});
window.harman.onMenu((id, value) => {
  if (Tour.active && id !== 'welcome') return;        // rehber açıkken menü eylemleri bekler
  const field = document.activeElement;
  const typingInField = field && (field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && field.type !== 'range'));
  // Bir yazı kutusunda ⌘Z yazıyı geri almalı, parça düzenlemelerini değil.
  if (typingInField && (id === 'undo' || id === 'redo')) { document.execCommand(id); return; }
  // Aynı şekilde kopyala/kes/yapıştır/tümünü seç yazı kutusundayken o kutuya uygulanır.
  const NATIVE = { copy: 'copy', cut: 'cut', paste: 'paste', selectall: 'selectAll' };
  if (typingInField && NATIVE[id]) { window.harman.nativeEdit(NATIVE[id]); return; }
  actions[id]?.(value);
});

window.addEventListener('resize', () => layoutAll());
window.addEventListener('pointerup', endEdit);
window.addEventListener('blur', () => { keys.ctrl = false; });

let redrawQueued = false;
el.timeline.addEventListener('scroll', () => {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    redrawVisible();
    updatePlayheadUI();
  });
});

// Trackpad / fare tekerleği:
//   ⌥ + kaydır  → imlecin altını yakınlaştır
//   sıkıştırma  → yakınlaştır (Chromium bunu ctrlKey'li wheel olarak gönderir)
//   ⌃ veya ⇧ + kaydır → sağa sola git
//   iki parmakla yana kaydırma → tarayıcının kendi kaydırması
el.timeline.addEventListener('wheel', (e) => {
  const pinch = e.ctrlKey && !keys.ctrl;
  if (e.altKey || pinch) {
    e.preventDefault();
    const delta = e.deltaY || e.deltaX;
    if (pinch) {
      zoomBy(Math.exp(-delta * 0.012), e.clientX);     // sıkıştırma: dışa açmak yakınlaştırır
    } else {
      // ⌥ + kaydır: parmaklar (veya tekerlek) yukarı = yakınlaştır. Doğal kaydırma açıkken
      // yukarı hareket pozitif delta üretir; Chromium bunu webkitDirectionInvertedFromDevice ile bildirir.
      const natural = e.webkitDirectionInvertedFromDevice ?? true;
      zoomBy(Math.exp((natural ? delta : -delta) * 0.004), e.clientX);
    }
  } else if (keys.ctrl || e.shiftKey) {
    e.preventDefault();
    el.timeline.scrollLeft += e.deltaX + e.deltaY;
  }
}, { passive: false });

// Ekran konumundan (clientX) zaman çizelgesindeki saniyeyi bulur.
const timeAt = (clientX) => Math.max(0, (clientX - el.timeline.getBoundingClientRect().left + el.timeline.scrollLeft - GUTTER) / state.pps);

// Oynatma çizgisini tıklanan yere koyar; basılı tutup sürükleyince gezinir.
function startScrub(e) {
  // Çalarken oynatma döngüsü (tick) çizgiyi her karede ses saatine göre geri yazar; sürükleme
  // bitene kadar susturulur. Hedef zaman ayrı tutulur, bırakınca oraya atlanır ve çalma sürer.
  let target = timeAt(e.clientX);
  scrubbing = true;
  const move = (ev) => {
    target = timeAt(ev.clientX);
    state.playhead = target;
    updatePlayheadUI();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    scrubbing = false;
    goTo(target);
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ------------------------------------------------------- geri alma geçmişi
// Her adımın ne yaptığı, öncesi ve sonrası görüntüleri karşılaştırılarak çıkarılır.
const CHANGE_LABELS = [
  [['srcId'], 'Tempo / ton değişti'],
  [['start', 'track'], 'Parça taşındı'],
  [['offset', 'dur'], 'Kırpma / bölme'],
  [['gain'], 'Seviye'],
  [['pan'], 'Sol / sağ denge'],
  [['fadeIn', 'fadeOut'], 'Fade'],
  [['stemRamps'], 'Zamanlı geçiş'],
  [['stemGains', 'stemPans'], 'Ses parçası ayarı'],
  [['eqLow', 'eqHigh', 'bassSwap'], 'EQ / bas takası'],
  [['name'], 'Yeniden adlandırma'],
  [['hue'], 'Renk'],
  [['mute', 'solo'], 'Sessiz / solo'],
];

function describeChange(beforeSnap, afterSnap) {
  const a = JSON.parse(beforeSnap);
  const b = JSON.parse(afterSnap);
  const labels = [];
  if (b.c.length > a.c.length) labels.push(b.c.length - a.c.length > 1 ? `${b.c.length - a.c.length} parça eklendi` : 'Parça eklendi');
  else if (b.c.length < a.c.length) labels.push(a.c.length - b.c.length > 1 ? `${a.c.length - b.c.length} parça silindi` : 'Parça silindi');
  const byId = new Map(a.c.map((c) => [c.id, c]));
  const changed = new Set();
  const touched = new Set();
  for (const c of b.c) {
    const o = byId.get(c.id);
    if (!o) continue;
    for (const k of Object.keys(c)) {
      if (JSON.stringify(c[k]) !== JSON.stringify(o[k])) { changed.add(k); touched.add(c.id); }
    }
  }
  const found = CHANGE_LABELS.filter(([keys]) => keys.some((k) => changed.has(k))).map(([, label]) => label);
  if (found.length > 2) labels.push('Birden çok değişiklik');
  else labels.push(...found);
  if (JSON.stringify(a.m) !== JSON.stringify(b.m)) labels.push('İşaretçi');
  if (!labels.length) return 'Değişiklik';
  let text = labels.join(' + ');
  if (touched.size > 1) text += ` (${touched.size} parça)`;
  return text;
}

function renderHistory() {
  const list = el.historyList;
  list.replaceChildren();
  const add = (parent, label, n, cls, onClick) => {
    const b = document.createElement('button');
    b.className = `history-item ${cls}`;
    const num = document.createElement('span');
    num.className = 'n';
    num.textContent = n;
    b.append(num, document.createTextNode(label));
    if (onClick) b.addEventListener('click', onClick); else b.disabled = true;
    parent.appendChild(b);
  };
  const cur = snapshot();
  const undoLen = state.undo.length;
  // Şu an
  add(list, 'Şu anki durum', '●', 'now', null);
  // Yapılanlar: en yeni önce. k. adım undo[k] → undo[k+1] (son adım: şimdiki duruma).
  for (let k = undoLen - 1; k >= 0; k--) {
    const after = k + 1 < undoLen ? state.undo[k + 1] : cur;
    add(list, describeChange(state.undo[k], after), String(k + 1), '', () => {
      for (let i = 0; i < undoLen - k; i++) undo({ quiet: true });
      toast('Seçilen adımın öncesine dönüldü');
      renderHistory();
    });
  }
  if (!undoLen) { const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = 'Henüz geri alınacak bir adım yok.'; list.appendChild(p); }
  // Geri alınanlar: sırayla yinelenebilir.
  if (state.redo.length) {
    const h = document.createElement('h4');
    h.textContent = 'Geri alınanlar';
    list.appendChild(h);
    let prev = cur;
    for (let i = state.redo.length - 1, step = 1; i >= 0; i--, step++) {
      const next = state.redo[i];
      const steps = step;
      add(list, describeChange(prev, next), `+${step}`, 'undone', () => {
        for (let j = 0; j < steps; j++) redo({ quiet: true });
        toast('Adımlar yeniden uygulandı');
        renderHistory();
      });
      prev = next;
    }
  }
}

function toggleHistory(show = el.history.hidden) {
  el.history.hidden = !show;
  if (show) renderHistory();
}
$('history-close').addEventListener('click', () => toggleHistory(false));
el.history.addEventListener('pointerdown', (e) => { if (e.target === el.history) toggleHistory(false); });

// ---------------------------------------------------------------- işaretçiler
// M: oynatma çizgisine isimli bir nokta koyar ("nakarat", "drop"). Tıkla: oraya git. Sürükle: taşı.
// Çift tıkla ya da sağ tık: yeniden adlandır / sil. ⌥ + ← / → işaretçilere de atlar. Geri alınabilir.
function addMarkerAt(t) {
  if (state.markers.some((m) => Math.abs(m.t - t) < 0.05)) return toast('Bu noktada zaten bir işaretçi var');
  let created = null;
  mutate(() => {
    created = { id: state.nextId++, t: Math.max(0, t), name: `İşaret ${state.markers.length + 1}` };
    state.markers.push(created);
  });
  drawRuler();
  updateProjectUI();
  beginMarkerRename(created);
}

function removeMarker(id) {
  mutate(() => { state.markers = state.markers.filter((m) => m.id !== id); });
  drawRuler();
}

function beginMarkerRename(m) {
  const hit = markerHits.find((h) => h.id === m.id);
  if (!hit) return;
  el.ruler.querySelector('.marker-rename')?.remove();
  const input = document.createElement('input');
  input.className = 'marker-rename';
  input.type = 'text';
  input.value = m.name;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'İşaretçi adı');
  input.style.setProperty('left', `${Math.max(GUTTER, hit.x0 + 3)}px`);
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.remove();
    if (commit && name && name !== m.name) { mutate(() => { m.name = name; }); drawRuler(); }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  el.ruler.appendChild(input);
  input.focus();
  input.select();
}

const markerAtEvent = (e) => {
  const r = el.ruler.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const hit = markerHits.find((h) => x >= h.x0 && x <= h.x1 && y >= h.y0);
  return hit ? state.markers.find((m) => m.id === hit.id) : null;
};

function startMarkerDrag(e, m) {
  const x0 = e.clientX;
  let moved = false;
  beginEdit();
  const move = (ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 4) return;
    if (ev.buttons === 0) return;
    moved = true;
    m.t = timeAt(ev.clientX);
    drawRuler();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    endEdit();
    updateProjectUI();
    if (!moved) goTo(m.t);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

el.ruler.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const m = markerAtEvent(e);
  if (m) { e.preventDefault(); startMarkerDrag(e, m); } else startScrub(e);
});
el.ruler.addEventListener('dblclick', (e) => { const m = markerAtEvent(e); if (m) beginMarkerRename(m); });
el.ruler.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const m = markerAtEvent(e);
  const t = timeAt(e.clientX);
  showContextMenu(e.clientX, e.clientY, m
    ? [
      { label: 'Yeniden adlandır…', run: () => beginMarkerRename(m) },
      { label: 'Oynatma çizgisini buraya getir', run: () => goTo(m.t) },
      'sep',
      { label: 'İşaretçiyi sil', danger: true, run: () => removeMarker(m.id) },
    ]
    : [{ label: 'İşaretçi ekle', hint: 'M', run: () => addMarkerAt(t) }]);
});

el.tracks.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.ctrlKey || e.target.closest('.clip') || e.target.closest('.track-label')) return;
  startMarquee(e);
});

// Süre sayacına tıklayıp "1:23" veya "83" yazarak o saniyeye git.
const timeInput = $('time-input');
function parseTime(text) {
  const t = text.trim().replace(',', '.');
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  return m ? Number(m[1] || 0) * 60 + Number(m[2]) : null;
}
// Ok tuşlarıyla gezinirken çizgi görünümden çıkarsa görünüm bir "sayfa" kayar: çizgi ileri giderken
// sol kenara yakın, geri giderken sağ kenara yakın bir yerde belirir.
function pageFollow() {
  const view = el.timeline;
  const x = GUTTER + state.playhead * state.pps;
  const page = view.clientWidth - GUTTER;
  if (x > view.scrollLeft + view.clientWidth - 24) view.scrollLeft = Math.max(0, x - GUTTER - page * 0.12);
  else if (x < view.scrollLeft + GUTTER) view.scrollLeft = Math.max(0, x - GUTTER - page * 0.88);
  updatePlayheadUI();
}

// Oynatma çizgisini hareket ettirir (çalıyorsa kaldığı yerden devam eder) ve görünümü takip ettirir.
function movePlayhead(t) {
  goTo(Math.max(0, t));
  pageFollow();
}

// ⌘ + ok: ince adım. Adım yakınlığa göre ayarlanır (yaklaşık 8 piksel): uzaklaşınca büyür, çok yaklaşınca
// birkaç milisaniyeye iner. ⇧ ile 5 kat.
const fineStep = () => Math.max(0.005, 8 / state.pps);

// ⌥ + ok: önceki / sonraki parça kenarı (başlangıç ya da bitiş).
function jumpToEdge(dir) {
  const points = [0, projectEnd()];
  for (const c of state.clips) points.push(c.start, clipEnd(c));
  for (const m of state.markers) points.push(m.t);
  const t = state.playhead;
  const sorted = [...new Set(points.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const target = dir > 0 ? sorted.find((v) => v > t + 0.002) : [...sorted].reverse().find((v) => v < t - 0.002);
  if (target === undefined) return toast(dir > 0 ? 'Sonda' : 'Başta');
  movePlayhead(target);
}

// ⌥ + ↑ / ↓: seçili parçaları bir hat yukarı / aşağı taşır (hiçbiri dışarı taşmaz).
function moveSelectionTrack(dir) {
  const chosen = selectedClips();
  if (!chosen.length) return toast('Önce bir parça seç');
  const tracks = chosen.map((c) => c.track);
  const shift = clamp(dir, -Math.min(...tracks), TRACK_COUNT - 1 - Math.max(...tracks));
  if (!shift) return toast(dir < 0 ? 'Zaten en üst hatta' : 'Zaten en alt hatta');
  mutate(() => {
    for (const c of chosen) { c.track += shift; laneOf(c.track).appendChild(c.el); }
  });
  layoutAll();
  onEdited();
}

function revealPlayhead() {
  const view = el.timeline;
  const x = GUTTER + state.playhead * state.pps;
  if (x < view.scrollLeft + GUTTER || x > view.scrollLeft + view.clientWidth - 40) {
    view.scrollLeft = Math.max(0, x - GUTTER - view.clientWidth / 3);
  }
}
function closeTimeInput() {
  timeInput.hidden = true;
  el.time.hidden = false;
}
$('lcd').addEventListener('click', () => {
  if (!timeInput.hidden) return;
  timeInput.value = state.playhead.toFixed(2);
  el.time.hidden = true;
  timeInput.hidden = false;
  timeInput.focus();
  timeInput.select();
});
timeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const t = parseTime(timeInput.value);
    if (t === null) { toast('Süreyi 1:23 veya 83 gibi yaz'); return; }
    closeTimeInput();
    goTo(t);
    revealPlayhead();
  } else if (e.key === 'Escape') {
    closeTimeInput();
  }
});
timeInput.addEventListener('blur', closeTimeInput);

document.addEventListener('keyup', (e) => { if (e.key === 'Control') keys.ctrl = false; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Control') keys.ctrl = true;

  if (!el.bubble.hidden && el.bubble.classList.contains('show')) return;
  if (ctxClose) return;
  if (!el.sep.hidden) {
    if (e.key === 'Escape' && !sep.running) closeSep();
    return;
  }
  if (!el.history.hidden) {
    if (e.key === 'Escape') toggleHistory(false);
    return;
  }
  if (!el.help.hidden) {
    if (e.key === 'Escape') toggleHelp(false);
    return;
  }
  // Sayı/yazı kutusu veya liste seçiliyken tuşlar o alana aittir (Backspace parçayı silmesin).
  const target = e.target;
  if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && target.type !== 'range')) {
    if (e.key === 'Escape' || e.key === 'Enter') target.blur();
    return;
  }
  if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    moveSelectionTrack(e.code === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === 'KeyM' || e.code === 'KeyS')) {
    e.preventDefault();
    toggleClipFlag(e.code === 'KeyM' ? 'mute' : 'solo');
    return;
  }
  // ⌘ + ← / →: ince adım. ⌥ + ← / →: parça kenarlarına atla. (Normal ok tuşları: 1 sn, ⇧ ile 5 sn.)
  if ((e.metaKey || e.altKey) && !e.ctrlKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    const dir = e.code === 'ArrowRight' ? 1 : -1;
    if (e.metaKey) movePlayhead(state.playhead + dir * fineStep() * (e.shiftKey ? 5 : 1));
    else jumpToEdge(dir);
    return;
  }
  if ((e.metaKey || e.ctrlKey) && ['KeyC', 'KeyX', 'KeyV'].includes(e.code)) {
    e.preventDefault();
    ({ KeyC: copySelected, KeyX: cutSelected, KeyV: () => pasteClips() })[e.code]();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyA') {
    e.preventDefault();
    setSelection(state.clips.map((c) => c.id));
    syncSelectionUI();
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    // Menüde kayıtlı olmayan yerleşimler için yedek (ör. Türkçe klavyede ⌘+).
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { e.preventDefault(); actions['zoom-in'](); }
    else if (e.key === '-' || e.code === 'NumpadSubtract') { e.preventDefault(); actions['zoom-out'](); }
    return;
  }
  if (e.altKey) return;

  const typing = target.tagName === 'INPUT';
  const step = e.shiftKey ? 5 : 1;
  switch (e.code) {
    case 'Space': e.preventDefault(); document.activeElement?.blur(); (e.shiftKey ? resumePlay() : togglePlay()); break;
    case 'KeyS': splitSelected(); break;
    case 'KeyL': toggleLoop(); break;
    case 'KeyT': tapTempo(); break;
    case 'F2': e.preventDefault(); beginRename(selected()); break;
    case 'KeyM': addMarkerAt(state.playhead); break;
    case 'KeyQ': case 'BracketLeft': trimToPlayhead('start'); break;
    case 'KeyW': case 'BracketRight': trimToPlayhead('end'); break;
    case 'Delete': case 'Backspace': deleteSelected(); break;
    case 'Enter': case 'NumpadEnter': case 'Home': actions.start(); break;
    case 'End': actions.end(); break;
    case 'ArrowLeft': if (!typing) { e.preventDefault(); movePlayhead(state.playhead - step); } break;
    case 'ArrowRight': if (!typing) { e.preventDefault(); movePlayhead(state.playhead + step); } break;
    case 'Escape': document.activeElement?.blur(); select(null); break;
    default:
  }
});

// -------------------------------------------------------------------- başlangıç
buildTracks();
offerRestore().then(() => {
  let seen = false;
  try { seen = !!localStorage.getItem('harman.welcomed'); } catch { /* özel pencere */ }
  window.harman.takePendingOpen().then((file) => { if (file) openProjectPath(file); });
  if (!seen && !state.clips.length && !project.path) startTour();
});
[el.insGain, el.insFadeIn, el.insFadeOut].forEach(paintSlider);
layoutAll();
setZoom(state.pps);
