'use strict';

// Tempo (BPM), vuruş konumu ve ton (key) analizi. Saf JavaScript, bağımlılık yok.
//
// Tempo: spektral akıdan bir "vuruş şiddeti" eğrisi çıkarılır, otokorelasyonla kaba tempo bulunur,
// sonra vuruş dizisiyle (pulse train) 0,05 BPM hassasiyetine inilir.
// Ton: kroma (12 nota) vektörü Krumhansl-Kessler profilleriyle karşılaştırılır.
(function (root) {
  const ONSET_SR = 22050;
  const ONSET_FFT = 1024;
  const ONSET_HOP = 256;
  const KEY_SR = 11025;
  const KEY_FFT = 4096;
  const KEY_HOP = 2048;
  const MAX_SECONDS = 240;          // uzun dosyalarda ortadaki bölüm analiz edilir
  // Tek bir oktav ([80, 160)) aranır: aynı anda hem T hem 2T aday olamaz, ikiye katlama / yarıya bölme
  // belirsizliği baştan ortadan kalkar. 170 BPM'lik bir parça 85, 70 BPM'lik bir parça 140 çıkabilir;
  // eşleştirme her zaman en yakın oktavı seçtiği için bu sorun olmaz, yanlışsa ½ / 2× ile düzeltilir.
  const BPM_MIN = 80;
  const BPM_MAX = 160;
  // Vuruş eğrisindeki zaman kayması (sn): pencere merkezi ile gerçek vuruş arasındaki fark.
  // Sentetik vuruş dizisiyle ölçüldü (bkz. test).
  const ONSET_LATENCY = 0.026;

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ------------------------------------------------------------- yardımcılar
  function toMono(channels) {
    const n = channels[0].length;
    const out = new Float32Array(n);
    for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
    return out;
  }

  // Kutu süzgeciyle tam sayı oranında seyrelt, kalanı doğrusal örnekle.
  function resample(x, srcRate, dstRate) {
    if (srcRate === dstRate) return x;
    const factor = Math.max(1, Math.floor(srcRate / dstRate));
    let y = x;
    if (factor > 1) {
      y = new Float32Array(Math.floor(x.length / factor));
      for (let i = 0; i < y.length; i++) {
        let s = 0;
        for (let j = 0; j < factor; j++) s += x[i * factor + j];
        y[i] = s / factor;
      }
    }
    const rate = srcRate / factor;
    if (Math.abs(rate - dstRate) < 1e-6) return y;
    const out = new Float32Array(Math.floor((y.length * dstRate) / rate));
    for (let i = 0; i < out.length; i++) {
      const pos = (i * rate) / dstRate;
      const i0 = Math.floor(pos);
      const f = pos - i0;
      out[i] = y[i0] * (1 - f) + (y[Math.min(i0 + 1, y.length - 1)] * f);
    }
    return out;
  }

  const fftCache = new Map();
  function fftTables(n) {
    if (!fftCache.has(n)) {
      const bits = Math.log2(n);
      const rev = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        let r = 0;
        for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
        rev[i] = r;
      }
      const cos = new Float32Array(n / 2);
      const sin = new Float32Array(n / 2);
      for (let i = 0; i < n / 2; i++) {
        cos[i] = Math.cos((2 * Math.PI * i) / n);
        sin[i] = -Math.sin((2 * Math.PI * i) / n);
      }
      fftCache.set(n, { rev, cos, sin });
    }
    return fftCache.get(n);
  }

  // Yerinde radix-2 FFT.
  function fft(re, im) {
    const n = re.length;
    const { rev, cos, sin } = fftTables(n);
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const a = start + k;
          const b = a + half;
          const tr = re[b] * cos[t] - im[b] * sin[t];
          const ti = re[b] * sin[t] + im[b] * cos[t];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  const hann = (n) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

  // ------------------------------------------------------------------ tempo
  async function onsetEnvelope(x) {
    const win = hann(ONSET_FFT);
    const frames = Math.max(0, Math.floor((x.length - ONSET_FFT) / ONSET_HOP));
    const re = new Float32Array(ONSET_FFT);
    const im = new Float32Array(ONSET_FFT);
    const maxBin = Math.min(ONSET_FFT / 2 - 1, Math.floor((8000 / ONSET_SR) * ONSET_FFT));
    let prev = new Float32Array(maxBin + 1);
    let cur = new Float32Array(maxBin + 1);
    const flux = new Float32Array(frames);
    const lowFlux = new Float32Array(frames);
    const lowBin = Math.floor((200 / ONSET_SR) * ONSET_FFT);
    for (let f = 0; f < frames; f++) {
      const off = f * ONSET_HOP;
      for (let i = 0; i < ONSET_FFT; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let sum = 0;
      let low = 0;
      for (let k = 1; k <= maxBin; k++) {
        cur[k] = Math.log1p(Math.hypot(re[k], im[k]));
        const d = cur[k] - prev[k];
        if (d > 0) { if (k >= 2) sum += d; if (k <= lowBin) low += d; }
      }
      flux[f] = sum;
      lowFlux[f] = low;
      [prev, cur] = [cur, prev];
      if (f % 1500 === 0) await tick();
    }
    const w = Math.round(0.4 / (ONSET_HOP / ONSET_SR));
    const clean = (raw) => {
      const env = new Float32Array(frames);
      const prefix = new Float64Array(frames + 1);
      for (let i = 0; i < frames; i++) prefix[i + 1] = prefix[i] + raw[i];
      for (let i = 0; i < frames; i++) {
        const lo = Math.max(0, i - w);
        const hi = Math.min(frames - 1, i + w);
        env[i] = Math.max(0, raw[i] - (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1));
      }
      let ss = 0;
      for (let i = 0; i < frames; i++) ss += env[i] * env[i];
      const std = Math.sqrt(ss / Math.max(1, frames)) || 1;
      const sm = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        sm[i] = (0.25 * (env[i - 1] || 0) + 0.5 * env[i] + 0.25 * (env[i + 1] || 0)) / std;
      }
      return sm;
    };
    // all: tempo bulmak için tüm bantlar. beat: vuruş konumu için kick (düşük bant) ağırlıklı;
    // hi-hat'ler kick'ten daha geniş bantlı olduğu için tek başına faza yanlış kilitletir.
    const all = clean(flux);
    const low = clean(lowFlux);
    const beat = new Float32Array(frames);
    for (let i = 0; i < frames; i++) beat[i] = all[i] + 1.5 * low[i];
    return { all, beat };
  }

  const interp = (arr, pos) => {
    if (pos < 0 || pos >= arr.length - 1) return 0;
    const i = Math.floor(pos);
    const f = pos - i;
    return arr[i] * (1 - f) + arr[i + 1] * f;
  };

  // Her aday tempo için bir darbe katarı kurulur; en iyi fazdaki ortalama vuruş enerjisi puandır.
  // Gerçek tempoda her vuruşa bir davul vuruşu denk gelir. 3:2 gibi yanlış oranlarda darbelerin
  // bir kısmı vuruşlar arasına düşer ve ortalama belirgin biçimde azalır.
  function estimateTempo(env) {
    const hopSec = ONSET_HOP / ONSET_SR;
    const n = env.length;
    const prior = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.3) ** 2);
    let best = { bpm: 120, score: -Infinity };
    for (let bpm = BPM_MIN; bpm < BPM_MAX; bpm += 0.25) {
      const P = 60 / bpm / hopSec;
      let top = 0;
      for (let phase = 0; phase < P; phase += 1) {
        let s = 0;
        let count = 0;
        for (let pos = phase; pos < n - 1; pos += P) { s += interp(env, pos); count++; }
        s /= Math.max(1, count);
        if (s > top) top = s;
      }
      const score = top * prior(bpm);
      if (score > best.score) best = { bpm, score };
    }
    return { bpm: best.bpm };
  }

  // Vuruş dizisinin (darbe katarı) vuruş eğrisiyle örtüşmesi: faz ve tempo hassas ayarı.
  function refineTempo(env, coarse) {
    const hopSec = ONSET_HOP / ONSET_SR;
    const n = env.length;
    let best = { bpm: coarse, phase: 0, score: -Infinity };
    for (let bpm = coarse - 1.5; bpm <= coarse + 1.5 + 1e-9; bpm += 0.05) {
      const P = 60 / bpm / hopSec;
      for (let phase = 0; phase < P; phase += 0.5) {
        let s = 0;
        let count = 0;
        for (let pos = phase; pos < n - 1; pos += P) { s += interp(env, pos); count++; }
        s /= Math.max(1, count);
        if (s > best.score) best = { bpm, phase, score: s };
      }
    }
    // Ortalama vuruş şiddetine göre güven: 1'in üstü belirgin bir vuruş demektir.
    return { bpm: best.bpm, phaseSec: best.phase * hopSec + ONSET_LATENCY, strength: best.score };
  }

  // ------------------------------------------------------------------- ton
  async function estimateKey(x) {
    const win = hann(KEY_FFT);
    const frames = Math.max(0, Math.floor((x.length - KEY_FFT) / KEY_HOP));
    const re = new Float32Array(KEY_FFT);
    const im = new Float32Array(KEY_FFT);
    const binHz = KEY_SR / KEY_FFT;
    const lo = Math.ceil(65 / binHz);
    const hi = Math.min(KEY_FFT / 2 - 1, Math.floor(2000 / binHz));
    const pcOf = new Int8Array(hi + 1).fill(-1);
    for (let k = lo; k <= hi; k++) {
      const midi = 69 + 12 * Math.log2((k * binHz) / 440);
      pcOf[k] = ((Math.round(midi) % 12) + 12) % 12;
    }
    const chroma = new Float64Array(12);
    const frame = new Float64Array(12);
    const mag = new Float32Array(KEY_FFT / 2);
    const fundHi = Math.floor(1000 / binHz);
    // Her nota, beşli yukarıya (3., 6. harmonik) ve büyük üçlüye (5. harmonik) kendi enerjisinden
    // pay verir; bunları çıkarmazsak dominant ton olduğundan güçlü görünür.
    const HARMONICS = [[3, 0.6], [5, 0.4], [6, 0.3], [7, 0.2]];
    for (let f = 0; f < frames; f++) {
      const off = f * KEY_HOP;
      for (let i = 0; i < KEY_FFT; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < KEY_FFT / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      for (let k = lo; k <= fundHi; k++) {
        const m = mag[k];
        if (m <= 0) continue;
        for (const [h, w] of HARMONICS) {
          const c = Math.round(h * k);
          for (let j = c - 1; j <= c + 1; j++) if (j < mag.length) mag[j] = Math.max(0, mag[j] - w * m * (j === c ? 1 : 0.5));
        }
      }
      frame.fill(0);
      for (let k = lo; k <= hi; k++) frame[pcOf[k]] += Math.sqrt(mag[k]);
      let sum = 0;
      for (let p = 0; p < 12; p++) sum += frame[p];
      if (sum > 1e-9) for (let p = 0; p < 12; p++) chroma[p] += frame[p] / sum;
      if (f % 200 === 0) await tick();
    }
    const corr = (a, b) => {
      const ma = a.reduce((s, v) => s + v, 0) / 12;
      const mb = b.reduce((s, v) => s + v, 0) / 12;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < 12; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
      return sab / Math.sqrt(saa * sbb || 1);
    };
    const scores = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      const rot = (profile) => Array.from({ length: 12 }, (_, i) => profile[(i - tonic + 12) % 12]);
      scores.push({ tonic, mode: 'major', score: corr(chroma, rot(MAJOR_PROFILE)) });
      scores.push({ tonic, mode: 'minor', score: corr(chroma, rot(MINOR_PROFILE)) });
    }
    scores.sort((a, b) => b.score - a.score);
    return { tonic: scores[0].tonic, mode: scores[0].mode, score: scores[0].score, margin: scores[0].score - scores[1].score };
  }

  // ---------------------------------------------- müzik teorisi yardımcıları
  // Camelot çarkı: majör C = 8B, minör A = 8A. Beşli çevrimde bir adım = 7 yarım ton.
  function camelot(key) {
    const majorTonic = key.mode === 'major' ? key.tonic : (key.tonic + 3) % 12;
    const num = ((majorTonic * 7 + 7) % 12) + 1;
    return { num, letter: key.mode === 'major' ? 'B' : 'A', code: `${num}${key.mode === 'major' ? 'B' : 'A'}` };
  }

  function keyName(key) {
    return `${NOTE_NAMES[key.tonic]} ${key.mode === 'major' ? 'majör' : 'minör'}`;
  }

  function shiftKey(key, semitones) {
    return { ...key, tonic: (((key.tonic + semitones) % 12) + 12) % 12 };
  }

  // key'i ref ile aynı Camelot numarasına (aynı ya da bağıl ton) getiren en küçük yarım ton kaydırması.
  function semitonesToMatch(key, ref) {
    let s = (7 * (camelot(ref).num - camelot(key).num)) % 12;
    if (s < 0) s += 12;
    return s > 6 ? s - 12 : s;
  }

  // ------------------------------------------------------------- ana giriş
  // channels: Float32Array[] (kanal verileri), sampleRate: Hz.
  async function analyzeSamples(channels, sampleRate, onProgress = () => {}) {
    let mono = toMono(channels);
    const maxLen = MAX_SECONDS * sampleRate;
    let startOffsetSec = 0;
    if (mono.length > maxLen) {
      const start = Math.floor((mono.length - maxLen) / 2);
      mono = mono.subarray(start, start + maxLen);
      startOffsetSec = start / sampleRate;
    }
    await tick();
    onProgress(0.1);
    const onsetX = resample(mono, sampleRate, ONSET_SR);
    const { all, beat } = await onsetEnvelope(onsetX);
    onProgress(0.5);
    const { bpm: coarse } = estimateTempo(beat);
    const fine = refineTempo(beat, coarse);
    onProgress(0.7);
    const keyX = resample(mono, sampleRate, KEY_SR);
    const key = await estimateKey(keyX);
    onProgress(1);

    // Tam sayıya çok yakın değerleri (±0,05) tam sayıya yapıştır; daha fazlası uzun şarkılarda vuruş ızgarasını kaydırır.
    let bpm = fine.bpm;
    if (Math.abs(bpm - Math.round(bpm)) < 0.05) bpm = Math.round(bpm);

    // Tüm dosyaya göre ilk vuruş: analiz ortadaki bölümde yapıldıysa periyoda indir.
    const period = 60 / bpm;
    let phase = fine.phaseSec + startOffsetSec;
    phase = ((phase % period) + period) % period;
    return {
      bpm: Math.round(bpm * 100) / 100,
      beatPhase: phase,
      beatStrength: fine.strength,
      key,
    };
  }

  const api = { analyzeSamples, camelot, keyName, shiftKey, semitonesToMatch, NOTE_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analysis = api;
}(typeof window !== 'undefined' ? window : globalThis));
