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

test('minPlayed: A en az o kadar çaldıktan sonra geçilir', () => {
  const a = track({ dur: 40, energy: energy(80, () => 1) });
  const early = Transitions.suggestTransitions(a, track({ start: 40 }), Analysis, { max: 5 });
  const late = Transitions.suggestTransitions(a, track({ start: 40 }), Analysis, { max: 5, minPlayed: 24 });
  assert.ok(Math.min(...early.map((s) => s.aPoint)) < 24, 'kısıtsız öneri erken bir nokta içermeli');
  for (const s of late) assert.ok(s.aPoint >= 24 - 1e-6, `aPoint ${s.aPoint}`);
});

test('Fade eğrileri: uç değerler ve toplam özellikleri', () => {
  const f = (c, u) => Transitions.fadeShape(c, u);
  for (const c of ['power', 'linear', 'smooth']) {
    assert.ok(Math.abs(f(c, 0)) < 1e-9 && Math.abs(f(c, 1) - 1) < 1e-9, `${c} uçları`);
  }
  for (let u = 0; u <= 1; u += 0.1) {
    assert.ok(Math.abs(f('power', u) ** 2 + f('power', 1 - u) ** 2 - 1) < 1e-9, 'eşit güç: karelerin toplamı 1');
    assert.ok(Math.abs(f('linear', u) + f('linear', 1 - u) - 1) < 1e-9, 'doğrusal: toplam 1');
    assert.ok(Math.abs(f('smooth', u) + f('smooth', 1 - u) - 1) < 1e-9, 'yumuşak: toplam 1');
  }
  assert.strictEqual(f(undefined, 0.5), f('power', 0.5));            // bilinmeyen / boş → eşit güç
  assert.strictEqual(f('linear', -1), 0);                              // sınırlandırma
  assert.strictEqual(f('linear', 2), 1);
});
