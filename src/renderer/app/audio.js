'use strict';

// --------------------------------------------------------------- ses motoru
// Bir parçanın t anındaki ses seviyesi. Fade'ler eşit güçlü (sin/cos) olduğu için
// iki parça üst üste binince toplam ses seviyesi sabit kalır, geçişte çukur oluşmaz.
function envelopeAt(clip, t) {
  const fi = Math.max(clip.fadeIn, DECLICK);
  const fo = Math.max(clip.fadeOut, DECLICK);
  const x = t - clip.start;
  const r = clip.dur - x;
  let g = clip.gain;
  if (x < fi) g *= Transitions.fadeShape(clip.curve, Math.max(x, 0) / fi);
  if (r < fo) g *= Transitions.fadeShape(clip.curve, Math.max(r, 0) / fo);
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
const hasEq = (clip) => !!(clip.eqLow || clip.eqHigh || clip.bassSwap || clip.sweep);

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

// Filtre süpürmesi (geçişte): çıkış fade'inde yüksek geçiren süzgeç 20 Hz'den 1,8 kHz'e yükselir (parça incelip
// uzaklaşır), giriş fade'inde alçak geçiren süzgeç 600 Hz'den 20 kHz'e açılır (parça perde açar gibi gelir).
// 0,5 sn'den kısa fade'lerde uygulanmaz. Frekans logaritmik olarak ilerler.
const SWEEP_STEPS = 24;
const sweepHpAt = (clip, t) => {
  if (!clip.sweep || clip.fadeOut < 0.5) return 20;
  const u = clamp((t - (clipEnd(clip) - clip.fadeOut)) / clip.fadeOut, 0, 1);
  return 20 * (1800 / 20) ** u;
};
const sweepLpAt = (clip, t) => {
  if (!clip.sweep || clip.fadeIn < 0.5) return 20000;
  const u = clamp((t - clip.start) / clip.fadeIn, 0, 1);
  return 600 * (20000 / 600) ** u;
};
function sweepPoints(clip) {
  const pts = [];
  if (clip.fadeIn >= 0.5) for (let i = 0; i <= SWEEP_STEPS; i++) pts.push(clip.start + (clip.fadeIn * i) / SWEEP_STEPS);
  if (clip.fadeOut >= 0.5) for (let i = 0; i <= SWEEP_STEPS; i++) pts.push(clipEnd(clip) - clip.fadeOut + (clip.fadeOut * i) / SWEEP_STEPS);
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
      const chain = [low, high];
      if (clip.sweep) {
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.Q.value = 0.8;
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.8;
        hp.frequency.setValueAtTime(sweepHpAt(clip, startTl), when);
        lp.frequency.setValueAtTime(sweepLpAt(clip, startTl), when);
        for (const t of sweepPoints(clip)) {
          if (t <= startTl) continue;
          hp.frequency.exponentialRampToValueAtTime(sweepHpAt(clip, t), at(t));
          lp.frequency.exponentialRampToValueAtTime(sweepLpAt(clip, t), at(t));
        }
        chain.push(hp, lp);
      }
      chain.reduce((from, node) => from.connect(node), envelope).connect(clipPan);
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

// Mix'i çevrimdışı çizer. normalize: ses yüksekliğini LUFS hedefine getirir ve tepeleri sınırlar (mastering.js).
// stemOnly: yalnızca bir ses parçası. Normalize bilgisi lastMaster'a yazılır.
const MASTER_TARGET_LUFS = -14;
const MASTER_CEILING_DB = -1;
let lastMaster = null;
async function renderMix({ normalize = state.normalize, stemOnly = null } = {}) {
  const total = projectEnd();
  const offline = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  scheduleMix(offline, 0, 0, offline.destination, { stemOnly });
  const rendered = await offline.startRendering();
  lastMaster = null;
  if (normalize) {
    const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
    lastMaster = Mastering.normalizeLoudness(channels, SAMPLE_RATE, { targetLufs: MASTER_TARGET_LUFS, ceilingDb: MASTER_CEILING_DB });
  }
  return rendered;
}

const masterNote = () => (lastMaster && Number.isFinite(lastMaster.after)
  ? ` · ${lastMaster.after.toFixed(1).replace('.', ',')} LUFS${lastMaster.reductionDb > 0.5 ? `, tepeler en çok ${lastMaster.reductionDb.toFixed(1).replace('.', ',')} dB sınırlandı` : ''}`
  : '');

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
      toast(`Kaydedildi: ${saved}${masterNote()}`);
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
  return Transitions.splitPoints({
    clips: state.clips.map((c) => ({ start: c.start, dur: c.dur, name: c.name })),
    markers: state.markers,
    end: projectEnd(),
  });
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
