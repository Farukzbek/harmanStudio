'use strict';

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
const tempo = { sweep: false, curve: 'power', bassSwap: true, fadeBeats: 16, refId: null, forClip: null, doTempo: true, doKey: true, semis: 0, semisManual: false, optionsKey: '' };
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
