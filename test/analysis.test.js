const test = require('node:test');
const assert = require('node:assert');
const Analysis = require('../src/renderer/analysis');

const SR = 44100;

// Belirli BPM'de, her vuruşta alçalan bir "kick" (düşen frekanslı sinüs) içeren sentetik şarkı.
function clickTrack(bpm, seconds, firstBeat = 0.3) {
  const x = new Float32Array(Math.floor(seconds * SR));
  const period = 60 / bpm;
  for (let t = firstBeat; t < seconds - 0.2; t += period) {
    const i0 = Math.round(t * SR);
    for (let i = 0; i < 0.18 * SR && i0 + i < x.length; i++) {
      const tt = i / SR;
      const f = 50 + 90 * Math.exp(-tt * 28);
      x[i0 + i] += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 14) * 0.9;
    }
  }
  return x;
}

// Sürekli bir akor: kök, üçlü, beşli.
function chord(rootHz, minor, seconds) {
  const x = new Float32Array(Math.floor(seconds * SR));
  const third = rootHz * 2 ** ((minor ? 3 : 4) / 12);
  const fifth = rootHz * 2 ** (7 / 12);
  for (const f of [rootHz, third, fifth, rootHz * 2]) {
    for (let i = 0; i < x.length; i++) x[i] += Math.sin((2 * Math.PI * f * i) / SR) * 0.25;
  }
  return x;
}

test('BPM: 124 BPM vuruş dizisi 0,5 içinde bulunur', async () => {
  const r = await Analysis.analyzeSamples([clickTrack(124, 40)], SR);
  assert.ok(Math.abs(r.bpm - 124) < 0.5, `bulunan ${r.bpm}`);
});

test('BPM: 98 BPM vuruş dizisi', async () => {
  const r = await Analysis.analyzeSamples([clickTrack(98, 40)], SR);
  assert.ok(Math.abs(r.bpm - 98) < 0.5, `bulunan ${r.bpm}`);
});

test('İlk vuruş konumu birkaç milisaniye içinde bulunur', async () => {
  const bpm = 120;
  const r = await Analysis.analyzeSamples([clickTrack(bpm, 40, 0.3)], SR);
  const period = 60 / bpm;
  let d = (r.beatPhase - 0.3) % period;
  if (d > period / 2) d -= period;
  if (d < -period / 2) d += period;
  assert.ok(Math.abs(d) < 0.03, `fark ${d}`);
});

test('Ton: A minör akoru', async () => {
  const r = await Analysis.analyzeSamples([chord(220, true, 20)], SR);
  assert.strictEqual(Analysis.NOTE_NAMES[r.key.tonic], 'A');
  assert.strictEqual(r.key.mode, 'minor');
});

test('Camelot ve yarım ton yardımcıları', () => {
  assert.strictEqual(Analysis.camelot({ tonic: 9, mode: 'minor' }).code, '8A');
  assert.strictEqual(Analysis.camelot({ tonic: 0, mode: 'major' }).code, '8B');
  assert.strictEqual(Analysis.semitonesToMatch({ tonic: 0, mode: 'major' }, { tonic: 0, mode: 'major' }), 0);
  const s = Analysis.semitonesToMatch({ tonic: 2, mode: 'major' }, { tonic: 0, mode: 'major' });
  assert.ok(Math.abs(s) <= 6);
});
