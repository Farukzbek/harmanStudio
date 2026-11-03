const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/mastering');

const SR = 44100;
const sine = (hz, peakDb, seconds, sr = SR) => {
  const a = 10 ** (peakDb / 20);
  const x = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin((2 * Math.PI * hz * i) / sr);
  return x;
};

test('LUFS: iki kanalda −23 dBFS tepeli 1 kHz sinüs ≈ −23 LUFS (EBU referansı)', () => {
  const v = M.lufs([sine(1000, -23, 12), sine(1000, -23, 12)], SR);
  assert.ok(Math.abs(v - -23) < 0.3, `ölçülen ${v}`);
});

test('LUFS: kazanç 6 dB artınca 6 LU artar', () => {
  const a = M.lufs([sine(1000, -30, 10), sine(1000, -30, 10)], SR);
  const b = M.lufs([sine(1000, -24, 10), sine(1000, -24, 10)], SR);
  assert.ok(Math.abs(b - a - 6) < 0.1, `fark ${b - a}`);
});

test('LUFS: sessizlik −∞ döner', () => {
  assert.strictEqual(M.lufs([new Float32Array(SR * 2), new Float32Array(SR * 2)], SR), -Infinity);
});

test('LUFS: başka örnekleme hızında (48 kHz) aynı sonuç', () => {
  const v = M.lufs([sine(1000, -23, 12, 48000), sine(1000, -23, 12, 48000)], 48000);
  assert.ok(Math.abs(v - -23) < 0.3, `ölçülen ${v}`);
});

test('Limiter: tepeler tavanın altında kalır, sessiz parça değişmez', () => {
  const loud = sine(200, 6, 3);               // +6 dBFS tepe
  const quiet = sine(200, -20, 3);
  const q0 = Float32Array.from(quiet);
  const red = M.limit([loud, quiet], SR, -1);
  assert.ok(M.samplePeak([loud]) <= 10 ** (-1 / 20) + 1e-4, `tepe ${M.samplePeak([loud])}`);
  assert.ok(red > 6, `kısma ${red}`);
  const noRed = M.limit([q0], SR, -1);
  assert.strictEqual(noRed, 0);
});

test('Limiter: kısa bir tepe çevresini fazla kısmaz', () => {
  const x = sine(100, -20, 2);
  x[SR] = 1.5;                                 // tek örneklik tepe
  M.limit([x], SR, -1);
  assert.ok(M.samplePeak([x]) <= 10 ** (-1 / 20) + 1e-4);
  // 100 ms sonra seviye neredeyse eski haline dönmüş olmalı
  let after = 0;
  for (let i = SR + Math.round(0.5 * SR); i < SR + Math.round(0.5 * SR) + 441; i++) after = Math.max(after, Math.abs(x[i]));
  assert.ok(after > 0.08, `bırakma sonrası tepe ${after}`);        // özgün tepe 0,1 (−20 dBFS)
});

test('normalizeLoudness: hedefe yaklaşır ve tavanı aşmaz', () => {
  const l = new Float32Array(SR * 15);
  const r = new Float32Array(SR * 15);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < l.length; i++) { l[i] = rnd() * 0.12; r[i] = rnd() * 0.12; }   // gürültü: düşük tepe/ortalama oranı
  const res = M.normalizeLoudness([l, r], SR, { targetLufs: -14, ceilingDb: -1 });
  assert.ok(Math.abs(res.after - -14) < 0.6, `sonuç ${res.after}`);
  assert.ok(M.samplePeak([l, r]) <= 10 ** (-1 / 20) + 1e-4);
});

test('normalizeLoudness: çok tepeli içerikte kazanç sınırlanır', () => {
  const l = sine(60, -30, 12);
  l[SR * 3] = 0.9;
  const r = Float32Array.from(l);
  const res = M.normalizeLoudness([l, r], SR, { targetLufs: -8, ceilingDb: -1, maxReductionDb: 8 });
  assert.ok(res.capped, 'kazanç sınırlanmalı');
  assert.ok(res.reductionDb <= 8.5, `kısma ${res.reductionDb}`);
});
