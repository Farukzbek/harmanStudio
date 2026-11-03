'use strict';

// ------------------------------------------------------- geri alma geçmişi
// Her adımın ne yaptığı, öncesi ve sonrası görüntüleri karşılaştırılarak çıkarılır.
const CHANGE_LABELS = [
  [['srcId'], 'Tempo / ton değişti'],
  [['start', 'track'], 'Parça taşındı'],
  [['offset', 'dur'], 'Kırpma / bölme'],
  [['gain'], 'Seviye'],
  [['pan'], 'Sol / sağ denge'],
  [['fadeIn', 'fadeOut'], 'Fade'],
  [['curve'], 'Fade eğrisi'],
  [['stemRamps'], 'Zamanlı geçiş'],
  [['stemGains', 'stemPans'], 'Ses parçası ayarı'],
  [['eqLow', 'eqHigh', 'bassSwap'], 'EQ / bas takası'],
  [['sweep'], 'Filtre süpürmesi'],
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
