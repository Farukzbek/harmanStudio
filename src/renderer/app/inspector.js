'use strict';

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
  el.insSweep.setAttribute('aria-checked', String(!!clip.sweep));
  el.insCurve.value = clip.curve || 'power';
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
el.transCurve.addEventListener('change', () => { tempo.curve = el.transCurve.value; });
el.insSweep.addEventListener('click', () => {
  const clip = selected();
  if (!clip) return;
  const on = !clip.sweep;
  mutate(() => { for (const c of selectedClips()) c.sweep = on || undefined; });
  updateInspector();
  onEdited();
});
el.transSweep.addEventListener('click', () => {
  tempo.sweep = !tempo.sweep;
  el.transSweep.setAttribute('aria-checked', String(tempo.sweep));
});
el.transBass.addEventListener('click', () => {
  tempo.bassSwap = !tempo.bassSwap;
  el.transBass.setAttribute('aria-checked', String(tempo.bassSwap));
});

// Fade eğrisi: seçili tüm parçalara uygulanır.
el.insCurve.addEventListener('change', () => {
  if (!selected()) return;
  const v = el.insCurve.value === 'power' ? undefined : el.insCurve.value;
  mutate(() => { for (const c of selectedClips()) c.curve = v; });
  layoutAll();
  onEdited();
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

// Müzik klasörü ekleme: klasördeki şarkılar sırayla çözülür ve analiz edilir, yalnızca BPM / ton bilgisi
// kütüphaneye yazılır (ses belleğe tutulmaz, projeye parça eklenmez). Durdur ile yarıda kesilebilir.
const libScan = { running: false, cancel: false };
async function scanLibraryFolder() {
  if (libScan.running) { libScan.cancel = true; el.libFolder.textContent = 'Durduruluyor…'; return; }
  const picked = await window.harman.libraryPickFolder();
  if (!picked) return;
  const known = new Set((await window.harman.libraryList()).map((e) => e.path));
  const bad = new Set(await window.harman.libraryFailedList());
  const todo = picked.files.filter((f) => !known.has(f) && !bad.has(f));
  if (!picked.files.length) return toast('Bu klasörde ses dosyası bulunamadı');
  if (!todo.length) return toast(`Klasördeki ${picked.files.length} dosyanın hepsi zaten kütüphanede ya da daha önce okunamadı`);
  libScan.running = true;
  libScan.cancel = false;
  el.libFolder.textContent = 'Durdur';
  let done = 0;
  let failed = 0;
  for (const file of todo) {
    if (libScan.cancel) break;
    const name = file.split('/').pop().replace(/\.[^.]+$/, '');
    el.libHint.textContent = `Analiz ediliyor ${done + failed + 1} / ${todo.length}: ${name}`;
    try {
      const buffer = await decodeFile(file);
      const channels = [buffer.getChannelData(0)];
      if (buffer.numberOfChannels > 1) channels.push(buffer.getChannelData(1));
      const r = await Analysis.analyzeSamples(channels, SAMPLE_RATE);
      await window.harman.libraryUpsert({ path: file, name, bpm: r.bpm, key: { tonic: r.key.tonic, mode: r.key.mode }, dur: buffer.duration });
      done++;
    } catch (err) {
      console.error('Kütüphane analizi başarısız', file, err);
      window.harman.libraryMarkFailed(file).catch(() => {});
      failed++;
    }
    await new Promise((r) => setTimeout(r, 30));          // arayüze nefes aldır
  }
  libScan.running = false;
  el.libFolder.textContent = 'Müzik klasörü ekle…';
  el.libHint.textContent = libScan.cancel ? `Durduruldu: ${done} şarkı eklendi.` : `Bitti: ${done} şarkı eklendi${failed ? `, ${failed} dosya okunamadı` : ''}.`;
  toast(el.libHint.textContent);
}
el.libFolder.addEventListener('click', scanLibraryFolder);

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
// Parçanın çaldığı bölümün ses yüksekliği (LUFS): ses parçaları varsa seviyeleriyle karıştırılır.
// −∞ dönerse parça sessizdir. Parça kazancı (gain) hesaba katılmaz; eşitlerken ayrıca uygulanır.
function clipLufs(clip) {
  const src = sourceOf(clip);
  const parts = hasStems(clip) && Object.values(clip.stemGains).some((g) => g !== 1)
    ? Object.entries(src.stems).map(([n, s]) => ({ buffer: s.buffer, g: stemGain(clip, n) }))
    : [{ buffer: src.buffer, g: 1 }];
  const i0 = Math.max(0, Math.floor(clip.offset * SAMPLE_RATE));
  const i1 = Math.min(src.buffer.length, Math.floor((clip.offset + clip.dur) * SAMPLE_RATE));
  const len = Math.max(0, i1 - i0);
  const out = [new Float32Array(len), new Float32Array(len)];
  for (const p of parts) {
    for (let ch = 0; ch < 2; ch++) {
      const data = p.buffer.getChannelData(Math.min(ch, p.buffer.numberOfChannels - 1));
      for (let i = 0; i < len; i++) out[ch][i] += data[i0 + i] * p.g;
    }
  }
  return Mastering.lufs(out, SAMPLE_RATE);
}

// Seviye eşitleme: seçili parçaların ses yüksekliği (LUFS, kapılı ölçüm) birbirine yaklaştırılır; hedef,
// seçilenlerin ortancasıdır. Parça başına kazanç en çok %150 olabilir.
function equalizeLevels() {
  const clips = selectedClips();
  if (clips.length < 2) return toast('Seviyeyi eşitlemek için en az iki parça seç');
  const measured = clips.map((c) => ({ c, l: clipLufs(c) })).filter((m) => Number.isFinite(m.l));
  if (measured.length < 2) return toast('Seçilen parçalar neredeyse sessiz');
  const eff = measured.map((m) => m.l + 20 * Math.log10(Math.max(m.c.gain, 1e-4))).sort((a, b) => a - b);
  const target = eff[Math.floor((eff.length - 1) / 2)];
  let capped = 0;
  mutate(() => {
    for (const { c, l } of measured) {
      const want = 10 ** ((target - l) / 20);
      c.gain = Math.round(clamp(want, 0, 1.5) * 100) / 100;
      if (want > 1.5) capped++;
      layoutClip(c);
    }
  });
  updateInspector();
  onEdited();
  toast(capped ? `Seviyeler eşitlendi, ${capped} parça en yüksek seviyede kaldı` : `Seviyeler eşitlendi (yaklaşık ${target.toFixed(1).replace('.', ',')} LUFS). ⌘Z ile geri alabilirsin`);
}
el.insLevel.addEventListener('click', equalizeLevels);
wireSlider(el.zoom, (v) => setZoom(ppsFromSlider(v)));
