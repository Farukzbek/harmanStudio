const test = require('node:test');
const assert = require('node:assert');
const Transitions = require('../src/renderer/transitions');
const Analysis = require('../src/renderer/analysis');

const energy = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i));
const track = (over = {}) => ({
  bpm: 120, beatPhase: 0, key: { tonic: 0, mode: 'major' }, rootKey: { tonic: 0, mode: 'major' },
  energy: energy(240, (i) => (i < 200 ? 1 : 0.3)), energyHop: 0.5, offset: 0, dur: 120, start: 0, ...over,
});

test('Önerilen geçiş istenen vuruş uzunluğunda', () => {
  for (const beats of [8, 16, 32]) {
    const list = Transitions.suggestTransitions(track(), track({ start: 120 }), Analysis, { crossfadeBeats: beats });
    assert.ok(list.length > 0, `${beats} vuruş için öneri yok`);
    for (const s of list) assert.ok(Math.abs(s.beats - beats) < 0.01, `${beats} istendi, ${s.beats} geldi`);
  }
});

test('Aynı tempo ve ton: tempo değişimi ve kaydırma yok', () => {
  const [s] = Transitions.suggestTransitions(track(), track({ start: 120 }), Analysis);
  assert.strictEqual(s.semis, 0);
  assert.ok(Math.abs(s.tempoPct) < 1e-6);
});

test('Giren parça A\'nın tempo katına yaklaştırılır', () => {
  const [s] = Transitions.suggestTransitions(track(), track({ bpm: 61, start: 120 }), Analysis);
  assert.ok(Math.abs(s.targetBpm - 120) < 1e-6 || Math.abs(s.targetBpm - 60) < 1e-6);
});

test('Geçiş noktaları A\'nın vuruş ızgarasında', () => {
  const a = track({ beatPhase: 0.27 });
  const list = Transitions.suggestTransitions(a, track({ start: 120 }), Analysis);
  const period = 60 / a.bpm;
  for (const s of list) {
    const k = (s.aPoint - a.beatPhase) / period;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6);
  }
});
