'use strict';

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
