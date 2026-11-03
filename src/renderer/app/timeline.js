'use strict';

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
  drawFade(0, clip.fadeIn * pps, (u) => Transitions.fadeShape(clip.curve, u));
  drawFade(wPx - clip.fadeOut * pps, wPx, (u) => Transitions.fadeShape(clip.curve, 1 - u));

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
