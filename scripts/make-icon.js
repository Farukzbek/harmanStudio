// Kullanım: npx electron scripts/make-icon.js  → build/icon-1024.png üretir (şeffaf köşeli).
// build/icon.icns için scripts/package.sh bunu otomatik çağırır.
//
// Logo: iki eğri birbirini keser — biri yükselir (fade in), biri alçalır (fade out).
// Harman'ın yaptığı iş tam olarak bu: iki şarkıyı birbirine geçirmek.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const draw = () => {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');

  // macOS ikon ızgarası: 1024'lük tuvalde 824'lük gövde, çevresinde gölge payı.
  const BODY = 824;
  const x0 = (S - BODY) / 2;
  const half = BODY / 2;
  const squircle = (ctx2d) => {
    // Süper elips (n=5): macOS'un sürekli köşeli şekline çok yakın.
    const n = 5;
    ctx2d.beginPath();
    for (let i = 0; i <= 360; i++) {
      const a = (i * Math.PI) / 180;
      const cos = Math.cos(a), sin = Math.sin(a);
      const x = S / 2 + half * Math.sign(cos) * Math.abs(cos) ** (2 / n);
      const y = S / 2 + half * Math.sign(sin) * Math.abs(sin) ** (2 / n);
      i ? ctx2d.lineTo(x, y) : ctx2d.moveTo(x, y);
    }
    ctx2d.closePath();
  };

  // Gölge + gövde
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 14;
  squircle(g);
  const bg = g.createLinearGradient(0, x0, 0, x0 + BODY);
  bg.addColorStop(0, '#2f333d');
  bg.addColorStop(1, '#14161a');
  g.fillStyle = bg;
  g.fill();
  g.restore();

  // Gövdenin içinde kal
  g.save();
  squircle(g);
  g.clip();

  // Yumuşak merkez ışığı
  const glow = g.createRadialGradient(S / 2, S * 0.42, 20, S / 2, S * 0.42, 420);
  glow.addColorStop(0, 'rgba(255,140,90,0.16)');
  glow.addColorStop(1, 'rgba(255,140,90,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);

  // Üst kenar ışığı
  const rim = g.createLinearGradient(0, x0, 0, x0 + 90);
  rim.addColorStop(0, 'rgba(255,255,255,0.14)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rim;
  g.fillRect(0, x0, S, 90);
  g.restore();

  // İki eğri (S şeklinde, merkezde kesişir)
  const L = 274, R = 750, T = 340, B = 684, W = 76;
  const mx = (L + R) / 2;
  const curve = (ctx2d, up) => {
    ctx2d.beginPath();
    if (up) { ctx2d.moveTo(L, B); ctx2d.bezierCurveTo(mx, B, mx, T, R, T); }
    else { ctx2d.moveTo(L, T); ctx2d.bezierCurveTo(mx, T, mx, B, R, B); }
    ctx2d.lineCap = 'round';
  };

  // Alçalan eğri ayrı katmanda çizilir; yükselen eğrinin etrafı oyulur (örgü görünümü).
  const layer = document.createElement('canvas');
  layer.width = S; layer.height = S;
  const lg = layer.getContext('2d');
  const white = lg.createLinearGradient(L, 0, R, 0);
  white.addColorStop(0, '#ffffff');
  white.addColorStop(1, '#c7ccd6');
  lg.strokeStyle = white;
  lg.lineWidth = W;
  curve(lg, false);
  lg.stroke();
  lg.globalCompositeOperation = 'destination-out';
  lg.lineWidth = W + 34;
  curve(lg, true);
  lg.stroke();

  g.save();
  squircle(g);
  g.clip();
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 6;
  g.drawImage(layer, 0, 0);
  g.restore();

  g.save();
  squircle(g);
  g.clip();
  const orange = g.createLinearGradient(L, B, R, T);
  orange.addColorStop(0, '#ff6a2b');
  orange.addColorStop(1, '#ffa06a');
  g.strokeStyle = orange;
  g.lineWidth = W;
  g.shadowColor = 'rgba(255,106,43,0.35)';
  g.shadowBlur = 26;
  curve(g, true);
  g.stroke();
  g.restore();

  return c.toDataURL('image/png');
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,<body></body>');
  const dataUrl = await win.webContents.executeJavaScript(`(${draw.toString()})()`);
  const out = path.join(__dirname, '..', 'build');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon-1024.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  app.quit();
});
