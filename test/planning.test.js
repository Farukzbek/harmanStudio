const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/renderer/transitions');
const A = require('../src/renderer/analysis');

const song = (id, bpm, tonic, mode = 'major', dur = 200, start = id * 10) => ({ id, bpm, key: { tonic, mode }, dur, start });

test('Maliyet: aynı tempo ve ton 0, tempo farkı ve kayma maliyeti artırır', () => {
  assert.strictEqual(T.transitionCost(song(1, 120, 0), song(2, 120, 0), A), 0);
  const tempoOnly = T.transitionCost(song(1, 120, 0), song(2, 126, 0), A);
  const keyOnly = T.transitionCost(song(1, 120, 0), song(2, 120, 6), A);
  assert.ok(tempoOnly > 0 && keyOnly > 0);
  assert.ok(T.transitionCost(song(1, 120, 0), song(2, 150, 5), A) > tempoOnly);
});

test('Maliyet: yarı / iki kat tempo yakın sayılır', () => {
  assert.ok(T.transitionCost(song(1, 120, 0), song(2, 60, 0), A) < 1e-9);
  assert.ok(T.transitionCost(song(1, 62, 0), song(2, 124, 0), A) < 1e-9);
});

test('Sıralama: en yakın tempo/ton önce gelir', () => {
  const items = [song(1, 124, 9, 'minor'), song(2, 150, 3), song(3, 126, 9, 'minor'), song(4, 90, 1)];
  const r = T.orderSongs(items, A, { start: 1 });
  assert.deepStrictEqual(r.order.slice(0, 2), [1, 3]);
  assert.strictEqual(r.order.length, 4);
});

test('Sıralama: başlangıç şarkısı seçilebilir, yoksa en soldaki', () => {
  const items = [song(1, 124, 0, 'major', 100, 0), song(2, 128, 0, 'major', 100, 50), song(3, 126, 0, 'major', 100, 100)];
  assert.strictEqual(T.orderSongs(items, A).order[0], 1);
  assert.strictEqual(T.orderSongs(items, A, { start: 3 }).order[0], 3);
});

test('Sıralama: uyumsuz şarkılar atlanır', () => {
  const items = [song(1, 124, 0, 'major', 100, 0), song(2, 126, 0, 'major', 100, 10), song(3, 100, 6, 'minor', 100, 20)];
  const r = T.orderSongs(items, A, { start: 1, maxCost: 14 });
  assert.deepStrictEqual(r.order, [1, 2]);
  assert.deepStrictEqual(r.skipped, [3]);
});

test('Sıralama: hedef süre en az iki şarkıyla durur', () => {
  const items = [1, 2, 3, 4].map((i) => song(i, 124 + i, 0, 'major', 300, i));
  const short = T.orderSongs(items, A, { start: 1, targetSec: 60 });
  assert.strictEqual(short.order.length, 2);                          // 1 şarkı ≥ hedef olsa da en az 2
  const mid = T.orderSongs(items, A, { start: 1, targetSec: 600 });
  assert.ok(mid.order.length >= 3 && mid.order.length < 4);
  assert.ok(mid.estimate >= 600);
});

test('Bölme planı: işaretçilerden', () => {
  const plan = T.splitPoints({ clips: [], markers: [{ t: 50, name: 'Köprü' }, { t: 20, name: 'Nakarat' }, { t: 999, name: 'Dışarıda' }], end: 100 });
  assert.deepStrictEqual(plan.map((p) => [p.name, p.t0, p.t1]), [['Başlangıç', 0, 20], ['Nakarat', 20, 50], ['Köprü', 50, 100]]);
});

test('Bölme planı: geçişlerin ortasından, boşlukta ilkinin bitişinden', () => {
  const clips = [{ start: 0, dur: 40, name: 'A' }, { start: 32, dur: 40, name: 'B' }, { start: 80, dur: 20, name: 'C' }];
  const plan = T.splitPoints({ clips, markers: [], end: 100 });
  assert.deepStrictEqual(plan.map((p) => [p.name, p.t0, p.t1]), [['A', 0, 36], ['B', 36, 72], ['C', 72, 100]]);
});

test('Bölme planı: tek parça ve işaretçisiz → boş', () => {
  assert.deepStrictEqual(T.splitPoints({ clips: [{ start: 0, dur: 10, name: 'A' }], markers: [], end: 10 }), []);
});
