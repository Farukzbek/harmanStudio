'use strict';

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
    && !clip.eqLow && !clip.eqHigh && !clip.bassSwap && !clip.curve && !clip.sweep
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
      eqLow: undefined, eqHigh: undefined, bassSwap: undefined, curve: undefined, sweep: undefined,
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
    fadeIn: c.fadeIn, fadeOut: c.fadeOut, gain: c.gain, pan: c.pan, hue: c.hue, mute: c.mute, solo: c.solo, curve: c.curve, sweep: c.sweep, eqLow: c.eqLow, eqHigh: c.eqHigh, bassSwap: c.bassSwap, ...copyMixParams(c),
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
      if (tempo.sweep) { a.sweep = true; b.sweep = true; }
      a.curve = b.curve = tempo.curve === 'power' ? undefined : tempo.curve;
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
const transitionCost = (a, b) => Transitions.transitionCost(a, b, Analysis);

// Sıra açgözlü kurulur: seçilen ilk şarkıdan başlar, her adımda tempoca ve tonca en yakın kalan gelir.
// maxCost: bundan uyumsuz bir sonraki şarkı kalırsa dizilim durur (kalanlar atlanır).
// targetSec: tahmini toplam süre buna ulaşınca durur (0 = hepsi).
function planOrder(clips, opts = {}) {
  const items = clips.map((c) => ({ id: c.id, bpm: sourceOf(c).bpm, key: sourceOf(c).key, dur: c.dur, start: c.start }));
  const r = Transitions.orderSongs(items, Analysis, opts);
  const byId = new Map(clips.map((c) => [c.id, c]));
  return { order: r.order.map((id) => byId.get(id)), skipped: r.skipped.map((id) => byId.get(id)), estimate: r.estimate };
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
  return { fadeBeats: tempo.fadeBeats, bassSwap: tempo.bassSwap, doTempo: tempo.doTempo, doKey: tempo.doKey, curve: tempo.curve, sweep: tempo.sweep };
}

function applyTemplate(t) {
  tempo.fadeBeats = t.fadeBeats;
  tempo.bassSwap = !!t.bassSwap;
  tempo.doTempo = !!t.doTempo;
  tempo.doKey = !!t.doKey;
  tempo.curve = t.curve || 'power';
  tempo.sweep = !!t.sweep;
  el.transCurve.value = tempo.curve;
  el.transSweep.setAttribute('aria-checked', String(tempo.sweep));
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
