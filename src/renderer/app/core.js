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
const PARAM_KEYS = ['id', 'srcId', 'name', 'track', 'start', 'offset', 'dur', 'fadeIn', 'fadeOut', 'gain', 'stemGains', 'pan', 'stemPans', 'stemRamps', 'eqLow', 'eqHigh', 'bassSwap', 'hue', 'mute', 'solo', 'curve', 'sweep'];
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
  projectName: $('project-name'), insSweep: $('ins-sweep'), transSweep: $('trans-sweep'), insCurve: $('ins-curve'), transCurve: $('trans-curve'), history: $('history'), historyList: $('history-list'), meterBar: $('st-meter-bar'), peakText: $('st-peak'), meter: $('st-meter'), libFind: $('lib-find'), libFolder: $('lib-folder'), libList: $('lib-list'), libHint: $('lib-hint'), transTemplate: $('trans-template'), tplSave: $('trans-template-save'), tplDel: $('trans-template-del'), tplForm: $('trans-template-form'), tplName: $('trans-template-name'), tplOk: $('trans-template-ok'), insMute: $('ins-mute'), insSolo: $('ins-solo'), stProject: $('st-project'), stSelection: $('st-selection'), stModes: $('st-modes'), insColors: $('ins-colors'), loopBand: $('loop-band'), insMulti: $('ins-multi'), insBass: $('ins-bass'), insBassVal: $('ins-bass-val'), insTreble: $('ins-treble'), insTrebleVal: $('ins-treble-val'), insSwap: $('ins-swap'), transBass: $('trans-bass'), insLevel: $('ins-level'), transBeats: $('trans-beats'), transFind: $('trans-find'), transList: $('trans-list'),
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
