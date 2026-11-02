// Vokal / enstrüman ayırma motoru (Python yan servisi).
// Python'u, uygulamanın dışında, kullanıcı klasöründe ayrı bir ortamda (venv) tutarız:
//   ~/Library/Application Support/Harman/engine/{venv,models}
// Böylece uygulamayı yeniden derlemek motoru ve indirilen modelleri silmez.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, cancel, installEnv } = require('./pyenv');

const PACKAGE = 'mlx-audio-separator[convert]';
const STEM_DIR_PREFIX = 'harman-sep-';
const SEPARATE_SCRIPT = path.join(__dirname, '..', 'tools', 'separate.py');

// MLX, sınırsız bırakılınca 4 dakikalık bir şarkıda 4-5 GB bellek alıp 8 GB'lık Mac'i dondurur.
// Toplam belleğin yaklaşık %18'i ile sınırlarız (8 GB'ta ≈ 1,5 GB); hız etkilenmez.
const LOW_MEMORY_BYTES = 9 * 1024 ** 3;
function memoryLimitMB() {
  return Math.round(Math.min(4000, Math.max(1200, (os.totalmem() / 1024 ** 2) * 0.18)));
}

// speed: gerçek zamana göre kat (M2'de 4 dakikalık şarkıyla ölçüldü, yük altında düşebilir, bu yüzden
// temkinli). sizeMB: ilk kullanımda indirilen model. memoryGB: ayırma sırasındaki tepe bellek.
const MODELS = [
  {
    key: 'fast', file: 'htdemucs.yaml', speed: 8, sizeMB: 85, memoryGB: 2,
    label: 'Hızlı', engine: 'Demucs',
    desc: 'Vokal, davul, bas ve diğer olarak 4 parçaya ayırır. Çoğu şarkı için yeterli.',
  },
  {
    key: 'quality', file: 'htdemucs_ft.yaml', speed: 2.5, sizeMB: 330, memoryGB: 3.3,
    label: 'Kaliteli', engine: 'Demucs fine-tuned',
    desc: 'Aynı 4 parça, daha az sızıntıyla. Daha yavaş.',
  },
  {
    key: 'vocal', file: 'model_bs_roformer_ep_317_sdr_12.9755.ckpt', speed: 0.8, sizeMB: 640, memoryGB: 2.1,
    label: 'En temiz vokal', engine: 'BS-RoFormer',
    desc: 'Yalnızca vokal ve enstrüman. En temiz vokal, en yavaş. Model ticari kullanıma kapalı.',
  },
];

// HARMAN_ENGINE_DIR yalnızca test içindir (gerçek motoru bozmadan kurulumu denemek için).
const engineDir = () => process.env.HARMAN_ENGINE_DIR || path.join(app.getPath('appData'), 'Harman', 'engine');
const venvDir = () => path.join(engineDir(), 'venv');
const modelsDir = () => path.join(engineDir(), 'models');
const separatorBin = () => path.join(venvDir(), 'bin', 'mlx-audio-separator');

function status() {
  return {
    installed: fs.existsSync(separatorBin()),
    lowMemory: os.totalmem() < LOW_MEMORY_BYTES,
    models: MODELS.map((m) => ({ ...m, ready: fs.existsSync(path.join(modelsDir(), m.file)) })),
  };
}

function install(send) {
  return installEnv({
    venv: venvDir(),
    packages: [PACKAGE],
    verify: [separatorBin(), ['--version']],
    send,
    labels: { packages: 'Ayırma paketleri indiriliyor (yaklaşık 1 GB)' },
  });
}

// tqdm indirme çubuğundan yüzde ve boyut çıkarır: "42%|████| 35.1M/84.1M [...]"
const DOWNLOAD_RE = /(\d+)%\|[^|]*\|\s*([\d.]+\w*)\/([\d.]+\w*)/;

async function separate(filePath, modelKey, send) {
  const model = MODELS.find((m) => m.key === modelKey);
  if (!model) throw new Error('Bilinmeyen model');
  if (!status().installed) throw new Error('Ayırma motoru kurulu değil');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), STEM_DIR_PREFIX));
  const input = path.join(work, `input${path.extname(filePath) || '.wav'}`);
  try {
    await fs.promises.symlink(filePath, input);
  } catch {
    await fs.promises.copyFile(filePath, input);
  }
  const outDir = path.join(work, 'out');
  fs.mkdirSync(modelsDir(), { recursive: true });

  send({ phase: 'prepare' });
  try {
    await run(path.join(venvDir(), 'bin', 'python'), [
      SEPARATE_SCRIPT, input, '-m', model.file, '--model_file_dir', modelsDir(),
      '--output_dir', outDir, '--output_format', 'WAV', '--save_converted_safetensors',
    ], {
      env: { HARMAN_MEM_LIMIT_MB: String(memoryLimitMB()), HARMAN_CACHE_LIMIT_MB: '128' },
      onLine: (line) => {
        const dl = DOWNLOAD_RE.exec(line);
        if (dl) send({ phase: 'download', pct: Number(dl[1]), detail: `${dl[2]} / ${dl[3]}` });
        else if (/Converting|conversion/i.test(line)) send({ phase: 'convert' });
        else if (/Separating|Starting separation/i.test(line)) send({ phase: 'separate' });
        else if (/Writing stem/i.test(line)) send({ phase: 'write' });
      },
    });
  } catch (err) {
    fs.rmSync(work, { recursive: true, force: true });
    throw err;
  }

  // Çıktı adları: input_(vocals)_<model>.wav
  const stems = fs.readdirSync(outDir)
    .map((f) => ({ f, m: /^input_\((.+?)\)_/.exec(f) }))
    .filter(({ m }) => m)
    .map(({ f, m }) => ({ name: m[1].toLowerCase(), path: path.join(outDir, f) }));
  if (!stems.length) {
    fs.rmSync(work, { recursive: true, force: true });
    throw new Error('Ayırma bir çıktı üretmedi');
  }
  return { work, stems };
}

// Yalnızca kendi geçici klasörlerimizi siler.
function cleanup(dir) {
  const base = path.basename(String(dir));
  if (path.dirname(String(dir)) === os.tmpdir() && base.startsWith(STEM_DIR_PREFIX)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { status, install, separate, cancel, cleanup };
