// Tempo ve ton değiştirme (Rubber Band, pedalboard paketi içinde gelir). Küçük, ayrı bir Python
// ortamında çalışır: ~/Library/Application Support/Harman/tools/venv (yaklaşık 30 MB).
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, installEnv } = require('./pyenv');

const STRETCH_SCRIPT = path.join(__dirname, '..', 'tools', 'stretch.py');
// engine.cleanup yalnızca bu önekli geçici klasörleri siler.
const TEMP_PREFIX = 'harman-sep-';

// HARMAN_TOOLS_DIR yalnızca test içindir.
const toolsDir = () => process.env.HARMAN_TOOLS_DIR || path.join(app.getPath('appData'), 'Harman', 'tools');
const venvDir = () => path.join(toolsDir(), 'venv');
const pythonBin = () => path.join(venvDir(), 'bin', 'python');
const readyMarker = () => path.join(toolsDir(), '.ready');

const status = () => ({ installed: fs.existsSync(readyMarker()) && fs.existsSync(pythonBin()) });

async function install(send) {
  await installEnv({
    venv: venvDir(),
    packages: ['pedalboard', 'numpy'],
    verify: [pythonBin(), ['-c', 'import pedalboard, numpy']],
    send,
    labels: { packages: 'Tempo ve ton aracı indiriliyor (yaklaşık 30 MB)' },
  });
  fs.writeFileSync(readyMarker(), 'ok');
}

// wav: 32-bit float WAV baytları. stretch: hız çarpanı (1.05 = %5 hızlı, süre kısalır). semitones: ton.
// Döndürdüğü: işlenmiş WAV baytları.
async function stretch({ wav, stretch: factor, semitones }) {
  if (!status().installed) throw new Error('Tempo ve ton aracı kurulu değil');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'harman-tempo-'));
  try {
    const input = path.join(work, 'in.wav');
    const output = path.join(work, 'out.wav');
    await fs.promises.writeFile(input, Buffer.from(wav));
    await run(pythonBin(), [STRETCH_SCRIPT, input, output, '--stretch', String(factor), '--semitones', String(semitones)]);
    const out = await fs.promises.readFile(output);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// İşlenmiş (türetilmiş) bir sesi ayırma motoruna vermek için geçici WAV dosyası yazar.
async function writeTempWav(wav) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const file = path.join(dir, 'source.wav');
  await fs.promises.writeFile(file, Buffer.from(wav));
  return { dir, file };
}

module.exports = { status, install, stretch, writeTempWav };
