'use strict';

// Proje dosyası ve yan dosyaları (türetilmiş sesler, ayrılmış parçalar) için disk işlemleri.
//
//   Şarkı.harman            proje (JSON): parçalar, ayarlar, kaynak bilgileri
//   Şarkı.harman-data/      ses verisi: audio/<anahtar>.wav, stems/<anahtar>/<parça>.wav
//
// Her yazma önce geçici dosyaya, sonra yeniden adlandırarak yapılır; yarım kalan bir yazma
// var olan projeyi bozmaz.
const fs = require('fs');
const path = require('path');

const dataDirOf = (projectPath) => `${projectPath}-data`;

async function writeAtomic(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);
}

// dir dışına çıkan göreli yolları reddeder.
function inside(dir, rel) {
  const full = path.resolve(dir, rel);
  if (full !== path.resolve(dir) && !full.startsWith(path.resolve(dir) + path.sep)) throw new Error('Geçersiz dosya yolu');
  return full;
}

async function writeBlob(dir, rel, bytes) {
  await writeAtomic(inside(dir, rel), Buffer.from(bytes));
}

async function readBlob(dir, rel) {
  try {
    const buf = await fs.promises.readFile(inside(dir, rel));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function exists(dir, rel) {
  try { await fs.promises.access(inside(dir, rel)); return true; } catch { return false; }
}

async function walk(dir, base = dir) {
  const out = [];
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

// keep listesinde olmayan yan dosyaları siler (proje kaydedilince eski/artık sesler temizlenir).
async function prune(dir, keep) {
  const keepSet = new Set(keep);
  for (const rel of await walk(dir)) {
    if (!keepSet.has(rel)) await fs.promises.rm(path.join(dir, rel), { force: true });
  }
  // Boş kalan klasörleri topla.
  const sweep = async (d) => {
    let entries;
    try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isDirectory()) await sweep(path.join(d, e.name));
    if (d !== dir && !(await fs.promises.readdir(d)).length) await fs.promises.rmdir(d).catch(() => {});
  };
  await sweep(dir);
}

module.exports = { dataDirOf, writeAtomic, writeBlob, readBlob, exists, prune };
