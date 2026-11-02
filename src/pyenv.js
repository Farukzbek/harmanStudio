// Python yan servisleri için ortak yardımcılar: araç bulma, işlem çalıştırma, ayrı ortam (venv) kurma.
// Harman'ın Python parçaları (ayırma motoru, tempo/ton aracı) sistem Python'unu kirletmesin diye
// ~/Library/Application Support/Harman/ altında kendi ortamlarında yaşar.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Finder'dan açılan uygulamanın PATH'i çok kısıtlıdır; bilinen yerleri elle ekleriz.
const EXTRA_PATH = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
const richPath = () => [...EXTRA_PATH, process.env.PATH || ''].join(':');

function findExecutable(names, dirs = EXTRA_PATH) {
  for (const dir of dirs) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function pythonVersion(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], (err, out) => {
      const m = /(\d+)\.(\d+)/.exec(String(out));
      resolve(err || !m ? null : [Number(m[1]), Number(m[2])]);
    });
  });
}

async function findPython() {
  const names = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'];
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      const v = await pythonVersion(p);
      if (v && (v[0] > 3 || (v[0] === 3 && v[1] >= 10))) return p;
    }
  }
  return null;
}

let current = null; // { proc, cancelled }

// Komutu çalıştırır; stdout/stderr satırlarını (\r ile gelen ilerleme çubukları dahil) onLine'a verir.
function run(cmd, args, { onLine, cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: { ...process.env, PATH: richPath(), PYTHONUNBUFFERED: '1', ...env } });
    // Ağır işler arayüzü ve sesi ezmesin: düşük öncelikle çalış.
    try { os.setPriority(proc.pid, 10); } catch { /* öncelik ayarlanamadıysa sorun değil */ }
    const job = { proc, cancelled: false };
    current = job;
    const tail = [];
    let buf = '';
    const feed = (chunk) => {
      buf += chunk.toString();
      const parts = buf.split(/[\r\n]+/);
      buf = parts.pop();
      for (const line of parts) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > 30) tail.shift();
        onLine?.(line);
      }
    };
    proc.stdout.on('data', feed);
    proc.stderr.on('data', feed);
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (current === job) current = null;
      if (job.cancelled) reject(new Error('İptal edildi'));
      else if (code !== 0) reject(new Error(tail.slice(-6).join('\n') || `Komut ${code} koduyla bitti`));
      else resolve();
    });
  });
}

function cancel() {
  if (!current) return;
  current.cancelled = true;
  current.proc.kill('SIGTERM');
}

// Ayrı bir ortam kurar: uv varsa onunla, yoksa Python 3.10+ ile.
//   venv: ortam klasörü, packages: pip paketleri, verify: kurulumdan sonra çalıştırılacak [komut, ...argümanlar]
//   labels: { packages: '... indiriliyor (yaklaşık 1 GB)' }
async function installEnv({ venv, packages, verify, send, labels }) {
  fs.mkdirSync(path.dirname(venv), { recursive: true });
  const uv = findExecutable(['uv']);
  const python = uv ? null : await findPython();
  if (!uv && !python) {
    throw new Error('Python 3.10 veya üstü bulunamadı. Terminalde şunu çalıştırıp tekrar dene: brew install uv');
  }
  const venvPython = path.join(venv, 'bin', 'python');

  send({ phase: 'install', step: 1, steps: 3, text: 'Python ortamı hazırlanıyor' });
  fs.rmSync(venv, { recursive: true, force: true });
  if (uv) await run(uv, ['venv', '--python', '3.12', venv]);
  else await run(python, ['-m', 'venv', venv]);

  send({ phase: 'install', step: 2, steps: 3, text: labels.packages });
  const onLine = (line) => send({ phase: 'install', step: 2, steps: 3, detail: line.slice(0, 120) });
  if (uv) await run(uv, ['pip', 'install', '--python', venvPython, ...packages], { onLine });
  else await run(venvPython, ['-m', 'pip', 'install', ...packages], { onLine });

  send({ phase: 'install', step: 3, steps: 3, text: 'Kurulum doğrulanıyor' });
  await run(...verify);
}

module.exports = { EXTRA_PATH, richPath, findExecutable, findPython, run, cancel, installEnv };
