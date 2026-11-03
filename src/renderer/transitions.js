'use strict';

// Akıllı geçiş önerileri: çıkan parça (A) ve giren parça (B) için en iyi geçişleri bulur.
// Saf JavaScript; arayüzden bağımsız, test edilebilir.
//
// Bir geçiş = A'nın belirli bir vuruşunda B'nin girmesi, aralarında bir crossfade. Puan şunlardan oluşur:
//   tempo  : B'yi A'nın temposuna getirmek ne kadar küçük bir değişiklik
//   ton    : B'yi A'ya uyumlu tona getirmek için gereken yarım ton kaydırması
//   çıkış  : A'nın enerjisi bu noktadan sonra düşüyor mu (outro, ara bölüm)
//   giriş  : B'nin girişi sakin mi ya da B güçlü bir bölüme (drop) giriyor mu
//   konum  : geçiş A'nın sonuna uygun uzaklıkta mı (ne çok erken ne çok geç)
// Geçiş noktaları A'nın vuruş ızgarasında, 8 vuruşluk adımlarla aranır; 16 vuruşluk cümle başları tercih edilir.
(function (root) {
  const PHRASE_BEATS = 16;
  const STEP_BEATS = 8;
  const CROSSFADE_BEATS = 16;
  const SEARCH_BACK = 110;          // sn: A'nın son 110 saniyesinde aranır
  const MIN_FADE_BEATS = 4;
  const WEIGHTS = { tempo: 0.30, key: 0.15, out: 0.28, enter: 0.15, place: 0.12 };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function meanEnergy(curve, hop, t0, t1) {
    if (!curve) return null;
    const i0 = Math.max(0, Math.floor(t0 / hop));
    const i1 = Math.min(curve.length, Math.ceil(t1 / hop));
    if (i1 <= i0) return 0;
    let sum = 0;
    for (let i = i0; i < i1; i++) sum += curve[i];
    return sum / (i1 - i0);
  }

  function medianEnergy(curve) {
    if (!curve || !curve.length) return 0;
    const sorted = Float32Array.from(curve).sort();
    return sorted[Math.floor(sorted.length / 2)];
  }

  // a, b: { bpm, beatPhase, key, rootKey?, energy?, energyHop?, offset, dur, start }
  //   zaman alanları kaynak (şarkı) saniyesidir; start zaman çizelgesindeki konumdur.
  // H: { semitonesToMatch(key, refKey) } (analysis.js)
  function suggestTransitions(a, b, H, { max = 3, crossfadeBeats = CROSSFADE_BEATS, minPlayed = 0 } = {}) {
    const pA = 60 / a.bpm;
    const pB = 60 / b.bpm;

    // Tempo: B'yi A'nın temposuna (ya da yarısına/iki katına, hangisi yakınsa) getir.
    const dist = (f) => Math.abs(Math.log((a.bpm * f) / b.bpm));
    const factor = [0.5, 1, 2].reduce((best, f) => (dist(f) < dist(best) ? f : best), 1);
    const targetBpm = a.bpm * factor;
    const rate = targetBpm / b.bpm;                      // B'nin hız çarpanı (1,03 = %3 hızlı)
    const tempoPct = rate - 1;
    const tempoScore = 1 - clamp(Math.abs(tempoPct) / 0.12, 0, 1);

    // Ton: B'nin orijinal tonundan, A'ya uyumlu olan en küçük yarım ton kaydırması.
    const semis = H.semitonesToMatch(b.rootKey ?? b.key, a.key);
    const keyScore = semis === 0 ? 1 : 1 - 0.8 * clamp(Math.abs(semis) / 6, 0, 1);

    const aEnd = a.offset + a.dur;
    const bEnd = b.offset + b.dur;
    const crossfade0 = crossfadeBeats * pA;
    const refB = medianEnergy(b.energy);

    // B giriş noktaları (B'nin kaynak saniyesi): çalan kısmın ilk vuruşu ve en güçlü "drop".
    const gridB = (m) => b.beatPhase + m * pB;
    const m0 = Math.max(0, Math.ceil((b.offset - b.beatPhase) / pB - 1e-6));
    const entries = [{ t: gridB(m0), kind: 'start' }];
    if (b.energy && refB > 0) {
      let best = null;
      for (let m = m0 + PHRASE_BEATS; gridB(m) < Math.min(bEnd - 8 * pB, gridB(m0) + 100); m += PHRASE_BEATS) {
        const t = gridB(m);
        const next = meanEnergy(b.energy, b.energyHop, t, t + PHRASE_BEATS * pB);
        const prev = meanEnergy(b.energy, b.energyHop, t - PHRASE_BEATS * pB, t);
        const jump = (next - prev) / refB;
        if (jump > 0.25 && (!best || jump > best.jump)) best = { t, jump };
      }
      if (best) entries.push({ t: best.t, kind: 'drop', jump: best.jump });
    }

    // minPlayed: A'nın geçişten önce en az bu kadar (kaynak sn) çalması istenir (otomatik karıştırmada kısa parçalar çok erken kesilmesin).
    const lo = Math.max(a.offset + STEP_BEATS * pA, aEnd - SEARCH_BACK, a.offset + minPlayed);
    const hi = aEnd - MIN_FADE_BEATS * pA;
    const step = STEP_BEATS * pA;
    const first = a.beatPhase + Math.ceil((lo - a.beatPhase) / step - 1e-6) * step;

    const found = [];
    for (let t = first; t <= hi + 1e-6; t += step) {
      const remaining = aEnd - t;
      const crossfade = Math.min(crossfade0, remaining);
      if (crossfade < MIN_FADE_BEATS * pA) continue;
      const beatIndex = Math.round((t - a.beatPhase) / pA);
      const onPhrase = beatIndex % PHRASE_BEATS === 0;

      const before = meanEnergy(a.energy, a.energyHop, t - PHRASE_BEATS * pA, t);
      const after = meanEnergy(a.energy, a.energyHop, t, t + crossfade);
      const drop = before > 1e-9 ? (before - after) / before : 0;
      const outScore = a.energy ? clamp(0.5 + drop * 0.7, 0, 1) : 0.5;

      // Konum: ideal olarak geçişten sonra A'dan crossfade + en fazla 40 sn kalsın.
      let placeScore;
      if (remaining < crossfade0 * 0.6) placeScore = 0.2;
      else if (remaining <= crossfade0 + 40) placeScore = 1;
      else placeScore = Math.max(0.3, 1 - (remaining - (crossfade0 + 40)) / 60);
      if (!onPhrase) placeScore *= 0.85;

      const tlA = a.start + (t - a.offset);
      for (const entry of entries) {
        // B hız çarpanıyla değişince kaynak saniyeleri 1/rate ölçeklenir.
        //  start: B'nin ilk vuruşu A'nın geçiş vuruşuna oturur; crossfade bu noktadan sonra olur.
        //  drop : B'nin güçlü bölümü A'nın geçiş vuruşuna (A'nın bittiği yere) iner; öncesinde en fazla
        //         bir crossfade uzunluğunda giriş A'nın sonuyla karışır, B'nin fazla girişi atılır.
        const lead = entry.kind === 'drop' ? Math.min(crossfade, (entry.t - b.offset) / rate) : 0;
        const bStart = tlA - (entry.kind === 'drop' ? lead : (entry.t - b.offset) / rate);
        if (bStart < -1e-6) continue;
        // drop girişinde crossfade, B'nin drop'tan önceki malzemesiyle sınırlıdır.
        const fade = entry.kind === 'drop' ? lead : crossfade;
        if (fade < MIN_FADE_BEATS * pA) continue;

        const window = crossfade * rate;                 // B'nin kaynak saniyesi cinsinden pencere
        let enterScore = 0.5;
        const reasons = [];
        if (b.energy && refB > 0) {
          const intro = meanEnergy(b.energy, b.energyHop, entry.t, entry.t + window);
          if (entry.kind === 'start') {
            const lowness = clamp(1 - intro / refB, 0, 1);
            enterScore = 0.45 + 0.55 * lowness;
            if (lowness > 0.3) reasons.push('B sakin bir girişle başlıyor');
          } else {
            const rise = (intro - meanEnergy(b.energy, b.energyHop, entry.t - window, entry.t)) / refB;
            enterScore = clamp(0.4 + rise * 0.8, 0, 1);
            reasons.push('B, güçlü bir bölümüne (drop) giriyor');
          }
        }
        if (a.energy && drop > 0.12) reasons.unshift(`A'nın enerjisi bu noktadan sonra %${Math.round(drop * 100)} düşüyor`);

        const total = WEIGHTS.tempo * tempoScore + WEIGHTS.key * keyScore + WEIGHTS.out * outScore
          + WEIGHTS.enter * enterScore + WEIGHTS.place * placeScore;

        found.push({
          aPoint: t, tlA, bPoint: entry.t, bStart, lead, entryKind: entry.kind,
          crossfade: fade, truncated: fade < crossfade0 - 1e-6, beats: fade / pA, targetBpm, tempoPct, semis,
          score: Math.round(total * 100),
          parts: { tempo: tempoScore, key: keyScore, out: outScore, enter: enterScore, place: placeScore },
          reasons,
        });
      }
    }

    // En yüksek puanlılar; birbirine çok yakın (aynı girişli) olanlardan yalnızca en iyisi.
    // İstenen uzunlukta bir geçiş mümkünse A'nın sonunda kısalan (kırpılmış) geçişler elenir.
    if (found.some((c) => !c.truncated)) found.splice(0, found.length, ...found.filter((c) => !c.truncated));
    found.sort((x, y) => y.score - x.score || x.tlA - y.tlA);
    const picked = [];
    for (const c of found) {
      if (picked.some((p) => p.entryKind === c.entryKind && Math.abs(p.aPoint - c.aPoint) < PHRASE_BEATS * pA)) continue;
      picked.push(c);
      if (picked.length >= max) break;
    }
    return picked;
  }

  // Fade / crossfade eğrileri: u (0..1) → kazanç. Çıkış fade'i aynı eğrinin tersidir (1 − u).
  //   power  : eşit güç (sin): ilişkisiz iki parçada geçişte ses çukuru olmaz (varsayılan)
  //   linear : doğrusal: aynı kaynaktan iki kopya / vuruşu hizalı parçalarda genlik toplamı sabit
  //   smooth : sin²: yumuşak giriş ve çıkış, geçişin ortasında daha hızlı değişir
  const FADE_CURVES = {
    power: (u) => Math.sin((u * Math.PI) / 2),
    linear: (u) => u,
    smooth: (u) => Math.sin((u * Math.PI) / 2) ** 2,
  };
  const fadeShape = (curve, u) => (FADE_CURVES[curve] || FADE_CURVES.power)(clamp(u, 0, 1));

  // İki şarkı arasındaki "geçiş maliyeti": tempo farkı (%, yarıya/iki katına en yakın) ve gereken yarım ton kayması.
  // Düşük = uyumlu. a, b: { bpm, key }. H: { semitonesToMatch } (analysis.js)
  function transitionCost(a, b, H) {
    const dist = (f) => Math.abs(Math.log((a.bpm * f) / b.bpm));
    const factor = [0.5, 1, 2].reduce((best, f) => (dist(f) < dist(best) ? f : best), 1);
    const pct = Math.abs((a.bpm * factor) / b.bpm - 1) * 100;
    const semis = Math.abs(H.semitonesToMatch(b.key, a.key));
    return pct * 0.6 + semis * 1.2;
  }

  // Açgözlü sıralama: start'tan başlar, her adımda maliyeti en düşük kalan şarkı gelir.
  // items: [{ id, bpm, key, dur, start }]. maxCost: bundan uyumsuzsa durur; targetSec: tahmini süre buna ulaşınca
  // durur (en az iki şarkı olmadan durmaz). Dönüş: { order: [id], skipped: [id], estimate (sn) }.
  function orderSongs(items, H, { start = null, maxCost = Infinity, targetSec = 0 } = {}) {
    const rest = [...items].sort((x, y) => x.start - y.start);
    const first = rest.splice(Math.max(0, rest.findIndex((c) => c.id === start)), 1)[0];
    const order = [first];
    let total = first.dur * 0.8;
    while (rest.length) {
      if (targetSec > 0 && total >= targetSec && order.length >= 2) break;
      const cur = order[order.length - 1];
      let best = 0;
      let bestCost = Infinity;
      rest.forEach((c, i) => {
        const cost = transitionCost(cur, c, H);
        if (cost < bestCost) { bestCost = cost; best = i; }
      });
      if (bestCost > maxCost) break;
      const next = rest.splice(best, 1)[0];
      order.push(next);
      total += next.dur * 0.8;
    }
    return { order: order.map((c) => c.id), skipped: rest.map((c) => c.id), estimate: total };
  }

  // Mix'in bölüneceği yerler. İşaretçi varsa onlar; yoksa ardışık parçaların geçiş ortaları (boşluk varsa ilkinin bitişi).
  // clips: [{ start, dur, name }], markers: [{ t, name }]. Dönüş: [{ name, t0, t1 }] (en az iki parça yoksa boş).
  function splitPoints({ clips, markers, end }) {
    const marks = [...markers].filter((m) => m.t > 0.05 && m.t < end - 0.05).sort((a, b) => a.t - b.t);
    if (marks.length) {
      const starts = [{ t: 0, name: 'Başlangıç' }, ...marks.map((m) => ({ t: m.t, name: m.name }))];
      return starts.map((s, i) => ({ name: s.name, t0: s.t, t1: i + 1 < starts.length ? starts[i + 1].t : end }));
    }
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    if (sorted.length < 2) return [];
    const cuts = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const aEnd = sorted[i].start + sorted[i].dur;
      cuts.push(sorted[i + 1].start < aEnd ? (sorted[i + 1].start + aEnd) / 2 : aEnd);
    }
    return sorted.map((c, i) => ({ name: c.name, t0: i === 0 ? 0 : cuts[i - 1], t1: i + 1 < sorted.length ? cuts[i] : end }));
  }

  const api = { suggestTransitions, meanEnergy, fadeShape, FADE_CURVES, transitionCost, orderSongs, splitPoints };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Transitions = api;
}(typeof window !== 'undefined' ? window : globalThis));
