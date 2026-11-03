'use strict';

// Ses yüksekliği ölçümü (ITU-R BS.1770 / EBU R128 LUFS) ve çevrimdışı tepe sınırlayıcı. Saf JavaScript;
// arayüzden bağımsız, test edilebilir.
//
// lufs(channels, sr): entegre ses yüksekliği (K ağırlıklı, 400 ms bloklar, mutlak −70 ve bağıl −10 LU kapı).
// limit(channels, sr, ceilingDb): tepeleri tavanın altında tutar (ileri bakışlı, yumuşak kazanç eğrisi).
// normalizeLoudness(channels, sr, { targetLufs, ceilingDb, maxReductionDb }): hedefe getirir, sınırlayıcıyla taşmayı önler.
(function (root) {
  // --- K ağırlıklandırma: yüksek raf + 38 Hz yüksek geçiren (BS.1770-4), herhangi bir örnekleme hızı için
  function kFilters(sr) {
    const shelf = (() => {
      const f0 = 1681.974450955533;
      const G = 3.999843853973347;
      const Q = 0.7071752369554196;
      const K = Math.tan((Math.PI * f0) / sr);
      const Vh = 10 ** (G / 20);
      const Vb = Vh ** 0.4996667741545416;
      const a0 = 1 + K / Q + K * K;
      return {
        b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
        a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
      };
    })();
    const hp = (() => {
      const f0 = 38.13547087602444;
      const Q = 0.5003270373238773;
      const K = Math.tan((Math.PI * f0) / sr);
      const a0 = 1 + K / Q + K * K;
      return { b: [1 / a0, -2 / a0, 1 / a0], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
    })();
    return [shelf, hp];
  }

  function biquad(x, { b, a }) {
    const y = new Float32Array(x.length);
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  }

  const kWeight = (x, sr) => kFilters(sr).reduce((sig, f) => biquad(sig, f), x);

  // Her 100 ms'de bir başlayan 400 ms'lik bloklar; her kanalın kare ortalamalarının toplamı (L, R için ağırlık 1).
  function blockEnergies(channels, sr) {
    const weighted = channels.map((c) => kWeight(c, sr));
    const block = Math.round(0.4 * sr);
    const hop = Math.round(0.1 * sr);
    const n = weighted[0].length;
    const out = [];
    for (let start = 0; start + block <= n; start += hop) {
      let sum = 0;
      for (const w of weighted) {
        let acc = 0;
        for (let i = start; i < start + block; i++) acc += w[i] * w[i];
        sum += acc / block;
      }
      out.push(sum);
    }
    return out;
  }

  const toLufs = (energy) => -0.691 + 10 * Math.log10(energy);

  function lufs(channels, sr) {
    const blocks = blockEnergies(channels, sr);
    if (!blocks.length) return -Infinity;
    const abs = blocks.filter((e) => toLufs(e) > -70);
    if (!abs.length) return -Infinity;
    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const gate = toLufs(mean(abs)) - 10;
    const rel = abs.filter((e) => toLufs(e) > gate);
    return rel.length ? toLufs(mean(rel)) : -Infinity;
  }

  const samplePeak = (channels) => {
    let p = 0;
    for (const c of channels) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; }
    return p;
  };

  // Tepe sınırlayıcı: gereken kazanç, örnek başına min(1, tavan / |x|); ileri bakış penceresindeki en küçük
  // değer alınır, sonra aynı uzunlukta hareketli ortalamayla yumuşatılır (tepeye varmadan kazanç iner, sert
  // kenar olmaz); bırakma yavaştır. Çevrimdışı olduğu için gecikme yoktur. Dönüş: en büyük kazanç kısması (dB).
  function limit(channels, sr, ceilingDb = -1, { lookaheadMs = 5, releaseMs = 120 } = {}) {
    const ceiling = 10 ** (ceilingDb / 20);
    const n = channels[0].length;
    const L = Math.max(2, Math.round((lookaheadMs / 1000) * sr));
    const need = new Float32Array(n).fill(1);
    let any = false;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (const c of channels) { const v = Math.abs(c[i]); if (v > m) m = v; }
      if (m > ceiling) { need[i] = ceiling / m; any = true; }
    }
    if (!any) return 0;
    // ileri bakışlı en küçük değer (monoton kuyruk)
    const mn = new Float32Array(n);
    const dq = [];
    let head = 0;
    for (let i = n - 1; i >= 0; i--) {
      while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop();
      dq.push(i);
      while (dq[head] > i + L) head++;
      mn[i] = need[dq[head]];
    }
    // yumuşatma: ileriye doğru L örneklik hareketli ortalama (kazanç tepeden önce iner)
    const g = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < Math.min(L, n); i++) acc += mn[i];
    for (let i = 0; i < n; i++) {
      g[i] = acc / L;
      const add = i + L < n ? mn[i + L] : 1;
      acc += add - mn[i];
    }
    // bırakma: kazanç artışı sınırlı (kısılmış kazanç yavaş geri döner)
    const rise = 1 / ((releaseMs / 1000) * sr);
    for (let i = 1; i < n; i++) {
      if (g[i] > g[i - 1] + rise) g[i] = g[i - 1] + rise;
    }
    let maxRed = 0;
    for (let i = 0; i < n; i++) {
      const gi = Math.min(g[i], need[i]);        // asla gerekenden az kısma (tavanı garanti et)
      g[i] = gi;
      if (gi < 1) maxRed = Math.max(maxRed, -20 * Math.log10(gi));
    }
    for (const c of channels) for (let i = 0; i < n; i++) c[i] *= g[i];
    return maxRed;
  }

  // Hedef ses yüksekliğine getirir. Kazanç, tepelerin tavanın en fazla maxReductionDb üstüne çıkacağı kadarla
  // sınırlıdır (aşırı sıkıştırma olmasın); sonra sınırlayıcı tavanı garanti eder.
  function normalizeLoudness(channels, sr, { targetLufs = -14, ceilingDb = -1, maxReductionDb = 8 } = {}) {
    const before = lufs(channels, sr);
    if (!Number.isFinite(before)) return { before, after: before, gainDb: 0, reductionDb: 0, capped: false };
    const peak = samplePeak(channels);
    let gainDb = targetLufs - before;
    const peakDbAfter = 20 * Math.log10(peak || 1e-9) + gainDb;
    const allowed = ceilingDb + maxReductionDb;
    let capped = false;
    if (peakDbAfter > allowed) { gainDb -= peakDbAfter - allowed; capped = true; }
    const gain = 10 ** (gainDb / 20);
    for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= gain;
    const reductionDb = limit(channels, sr, ceilingDb);
    return { before, after: lufs(channels, sr), gainDb, reductionDb, capped };
  }

  const api = { lufs, limit, normalizeLoudness, samplePeak, kWeight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mastering = api;
}(typeof window !== 'undefined' ? window : globalThis));
