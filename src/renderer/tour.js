'use strict';

// Giriş rehberi: adım adım bir arayüz bölümünü aydınlık bırakıp geri kalanı karartır; vurgu ve açıklama
// kutusu bir adımdan ötekine yumuşakça kayar. Arayüze bağımlılığı yoktur; adımları çağıran verir.
//
// Tour.start(steps, { onEnd(reason) })   reason: 'done' | 'skip'
//   step: { targets: ['#id', ...], title, html, pad? }  (targets boşsa tüm ekran kararır, kutu ortada durur)
(function (root) {
  const MARGIN = 14;
  const GAP = 14;
  const FADE_MS = 140;

  let ui = null;
  let state = null;

  const el = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  };

  function build() {
    const overlay = el('div', 'tour');
    const spot = el('div', 'tour-spot empty', overlay);
    const card = el('div', 'tour-card', overlay);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    const count = el('div', 'tour-count', card);
    const title = el('h3', 'tour-title', card);
    const body = el('div', 'tour-body', card);
    const actions = el('div', 'tour-actions', card);
    const skip = el('button', 'btn ghost tour-skip', actions);
    skip.textContent = 'Turu atla';
    el('span', 'tour-spacer', actions);
    const back = el('button', 'btn solid', actions);
    back.textContent = 'Geri';
    const next = el('button', 'btn primary', actions);
    document.body.appendChild(overlay);
    return { overlay, spot, card, count, title, body, skip, back, next };
  }

  // Hedeflerin (birden çok olabilir) birleşik dikdörtgeni; padding eklenir.
  function targetRect(step) {
    const rects = (step.targets || []).map((s) => document.querySelector(s)).filter(Boolean)
      .map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const pad = step.pad ?? 8;
    const left = Math.min(...rects.map((r) => r.left)) - pad;
    const top = Math.min(...rects.map((r) => r.top)) - pad;
    const right = Math.max(...rects.map((r) => r.right)) + pad;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + pad;
    return { left, top, width: right - left, height: bottom - top };
  }

  function placeSpot(rect) {
    const vw = innerWidth;
    const vh = innerHeight;
    const r = rect || { left: vw / 2, top: vh / 2, width: 0, height: 0 };   // hedef yoksa ortada sıfır boyut: her yer kararır
    const s = ui.spot.style;
    s.setProperty('left', `${r.left}px`);
    s.setProperty('top', `${r.top}px`);
    s.setProperty('width', `${r.width}px`);
    s.setProperty('height', `${r.height}px`);
    ui.spot.classList.toggle('empty', !rect);
  }

  function placeCard(rect) {
    const vw = innerWidth;
    const vh = innerHeight;
    const cw = ui.card.offsetWidth;
    const ch = ui.card.offsetHeight;
    const clampX = (x) => Math.min(Math.max(MARGIN, x), vw - cw - MARGIN);
    const clampY = (y) => Math.min(Math.max(MARGIN, y), vh - ch - MARGIN);
    let x;
    let y;
    if (!rect) {
      x = (vw - cw) / 2;
      y = (vh - ch) / 2;
    } else if (rect.width * rect.height > vw * vh * 0.4) {
      // Büyük hedef (zaman çizelgesi): kutu hedefin içinde, biraz aşağıda durur.
      x = clampX(rect.left + rect.width / 2 - cw / 2);
      y = clampY(rect.top + rect.height * 0.5 - ch / 2);
    } else {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const options = [
        [rect.top + rect.height + GAP + ch + MARGIN <= vh, () => [clampX(cx - cw / 2), rect.top + rect.height + GAP]],
        [rect.top - GAP - ch >= MARGIN, () => [clampX(cx - cw / 2), rect.top - GAP - ch]],
        [rect.left - GAP - cw >= MARGIN, () => [rect.left - GAP - cw, clampY(cy - ch / 2)]],
        [rect.left + rect.width + GAP + cw + MARGIN <= vw, () => [rect.left + rect.width + GAP, clampY(cy - ch / 2)]],
      ];
      const fit = options.find(([ok]) => ok);
      [x, y] = fit ? fit[1]() : [clampX(cx - cw / 2), clampY(cy - ch / 2)];
    }
    ui.card.style.setProperty('left', `${Math.round(x)}px`);
    ui.card.style.setProperty('top', `${Math.round(y)}px`);
  }

  function fill(step, i) {
    const last = i === state.steps.length - 1;
    ui.count.textContent = `${i + 1} / ${state.steps.length}`;
    ui.title.textContent = step.title;
    ui.body.innerHTML = step.html;
    ui.back.hidden = i === 0;
    ui.skip.hidden = last;
    ui.next.textContent = last ? 'Bitir' : i === 0 ? 'Başla' : 'İleri';
  }

  function show(i, { instant = false } = {}) {
    const step = state.steps[i];
    state.i = i;
    const rect = targetRect(step);
    placeSpot(rect);                                  // vurgu hemen kaymaya başlar
    const swap = () => {
      fill(step, i);
      placeCard(rect);
      ui.card.classList.remove('fading');
      ui.next.focus({ preventScroll: true });
    };
    if (instant) { swap(); return; }
    ui.card.classList.add('fading');                  // metin solar, kutu kayar, yeni metin belirir
    clearTimeout(state.swapTimer);
    state.swapTimer = setTimeout(swap, FADE_MS);
  }

  function go(delta) {
    const i = state.i + delta;
    if (i < 0) return;
    if (i >= state.steps.length) { end('done'); return; }
    show(i);
  }

  function end(reason) {
    if (!state) return;
    const { onEnd } = state;
    clearTimeout(state.swapTimer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    const overlay = ui.overlay;
    overlay.classList.add('closing');
    state = null;
    ui = null;
    setTimeout(() => overlay.remove(), 320);
    onEnd?.(reason);
  }

  function onKey(e) {
    if (!state) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Rehber açıkken tuşlar uygulamaya gitmez (Boşluk çalmasın, Backspace parça silmesin).
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); end('skip'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
    if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); go(1); return; }
    if (e.target?.tagName !== 'BUTTON') e.preventDefault();
  }

  function onResize() {
    if (state) show(state.i, { instant: true });
  }

  function start(steps, { onEnd } = {}) {
    if (state) return;
    ui = build();
    state = { steps, i: 0, onEnd, swapTimer: null };
    ui.skip.addEventListener('click', () => end('skip'));
    ui.back.addEventListener('click', () => go(-1));
    ui.next.addEventListener('click', () => go(1));
    addEventListener('keydown', onKey, true);
    addEventListener('resize', onResize);
    show(0, { instant: true });
    // İlk açılışta karartma yumuşakça gelsin.
    requestAnimationFrame(() => ui.overlay.classList.add('on'));
  }

  const api = { start, get active() { return !!state; } };
  root.Tour = api;
}(window));
