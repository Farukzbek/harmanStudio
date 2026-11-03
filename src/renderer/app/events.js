'use strict';

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
