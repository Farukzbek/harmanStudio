const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pf = require('../src/projectfile');
const { resolveSaveTarget } = require('../src/saveformat');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'harman-test-'));

test('Yan dosya klasörü adı', () => {
  assert.strictEqual(pf.dataDirOf('/a/b.harman'), '/a/b.harman-data');
});

test('Yaz, oku, var mı, ara dosya kalmaz', async () => {
  const dir = tmp();
  await pf.writeBlob(dir, 'stems/k1/vocals.wav', new Uint8Array([1, 2, 3]).buffer);
  assert.ok(await pf.exists(dir, 'stems/k1/vocals.wav'));
  assert.deepStrictEqual([...new Uint8Array(await pf.readBlob(dir, 'stems/k1/vocals.wav'))], [1, 2, 3]);
  assert.strictEqual(await pf.readBlob(dir, 'yok.wav'), null);
  assert.ok(!fs.readdirSync(path.join(dir, 'stems/k1')).some((f) => f.includes('.tmp-')));
});

test('Klasör dışına çıkan yol reddedilir', async () => {
  const dir = tmp();
  await assert.rejects(() => pf.writeBlob(dir, '../kacak.wav', new ArrayBuffer(1)));
  await assert.rejects(() => pf.readBlob(dir, '../../etc/passwd'));
});

test('prune: listede olmayanları ve boş klasörleri siler', async () => {
  const dir = tmp();
  const b = new ArrayBuffer(2);
  await pf.writeBlob(dir, 'audio/a.wav', b);
  await pf.writeBlob(dir, 'stems/k/x.wav', b);
  await pf.prune(dir, ['audio/a.wav']);
  assert.ok(await pf.exists(dir, 'audio/a.wav'));
  assert.ok(!(await pf.exists(dir, 'stems/k/x.wav')));
  assert.ok(!fs.existsSync(path.join(dir, 'stems')));
});

test('writeAtomic mevcut dosyanın üstüne yazar', async () => {
  const dir = tmp();
  const f = path.join(dir, 'p.harman');
  await pf.writeAtomic(f, 'bir');
  await pf.writeAtomic(f, 'iki');
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'iki');
});

test('Kaydetme biçimi uzantıdan anlaşılır', () => {
  assert.deepStrictEqual(resolveSaveTarget('/x/mix.wav'), { filePath: '/x/mix.wav', format: 'wav' });
  assert.deepStrictEqual(resolveSaveTarget('/x/mix.MP3'), { filePath: '/x/mix.MP3', format: 'mp3' });
  assert.deepStrictEqual(resolveSaveTarget('/x/mix'), { filePath: '/x/mix.mp3', format: 'mp3' });
});
