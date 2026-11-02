// Kullanım: npx electron scripts/make-icon.js  → build/icon-1024.png üretir (şeffaf köşeli).
// build/icon.icns için scripts/package.sh bunu otomatik çağırır.
//
// Logo: bir bağla toplanmış çapraz iki buğday başağı (harman = hasat, iki şarkının karışımı).
// Elle çizilmiş görünümlü: düz renk, titrek mürekkep çizgisi, kaymış dolgu, kağıt tanesi.
// Seçenekler (VARIANT=h|bars|discs|wheat) denenmiş eski tasarımlardır; varsayılan wheat.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');


const VARIANTS = {
  // A: iki çubuk (iki şarkı) ve aralarında S eğrisi (geçiş) — H harfi
  h(g, { squircle }) {
    const PW = 96, PT = 262, PB = 762, LX = 306, RX = 718;           // sütun genişliği, üst/alt, merkez x'leri
    const white = g.createLinearGradient(0, PT, 0, PB); white.addColorStop(0, '#ffffff'); white.addColorStop(1, '#bfc5d1');
    const orange = g.createLinearGradient(0, PT, 0, PB); orange.addColorStop(0, '#ffa36e'); orange.addColorStop(1, '#ff5f1f');
    g.save(); squircle(g); g.clip();
    const pill = (x, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x - PW / 2, PT, PW, PB - PT, PW / 2); g.fill(); };
    // geçiş eğrisi: soldaki sütunun altından sağdakinin üstüne yükselir
    const bar = g.createLinearGradient(LX, 0, RX, 0); bar.addColorStop(0, '#ffffff'); bar.addColorStop(0.5, '#ffd0b2'); bar.addColorStop(1, '#ff7a35');
    g.strokeStyle = bar; g.lineWidth = PW * 0.86; g.lineCap = 'butt';
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 22; g.shadowOffsetY = 8;
    g.beginPath(); g.moveTo(LX, 616); g.bezierCurveTo((LX + RX) / 2, 616, (LX + RX) / 2, 408, RX, 408); g.stroke();
    pill(LX, white); pill(RX, orange);
    g.restore();
  },
  // B: ses dalgası çubukları; renk soldan sağa beyazdan turuncuya geçer (crossfade)
  bars(g, { squircle }) {
    const H = [150, 270, 410, 560, 460, 330, 400, 280, 170];
    const n = H.length, W = 54, GAP = 30, total = n * W + (n - 1) * GAP, x0 = 512 - total / 2;
    const A = [255, 255, 255], B = [255, 98, 38];
    g.save(); squircle(g); g.clip();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), k = t * t * (3 - 2 * t);
      const col = A.map((v, j) => Math.round(v + (B[j] - v) * k));
      const x = x0 + i * (W + GAP), h = H[i];
      const grad = g.createLinearGradient(0, 512 - h / 2, 0, 512 + h / 2);
      grad.addColorStop(0, `rgb(${col.map((v) => Math.min(255, v + 16)).join()})`);
      grad.addColorStop(1, `rgb(${col.map((v) => Math.max(0, v - 28)).join()})`);
      g.shadowColor = i > 4 ? 'rgba(255,98,38,0.35)' : 'rgba(0,0,0,0.3)'; g.shadowBlur = 20; g.shadowOffsetY = 6;
      g.fillStyle = grad; g.beginPath(); g.roundRect(x, 512 - h / 2, W, h, W / 2); g.fill();
    }
    g.restore();
  },
  // C: iki plak üst üste biner; kesişim bölgesi iki şarkının karışımı
  discs(g, { squircle }) {
    const R = 232, cy = 512, lx = 396, rx = 628;
    g.save(); squircle(g); g.clip();
    const disc = (cx, c0, c1) => { const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); };
    g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
    disc(lx, '#ffffff', '#b9c0cd'); disc(rx, '#ff9a60', '#ff5a1a');
    g.shadowColor = 'transparent';
    // plak yivleri
    const grooves = (cx, col) => { g.strokeStyle = col; g.lineWidth = 3; for (const r of [188, 150, 112]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); } };
    g.save(); g.beginPath(); g.arc(lx, cy, R, 0, Math.PI * 2); g.clip(); grooves(lx, 'rgba(20,22,26,0.10)'); g.restore();
    g.save(); g.beginPath(); g.arc(rx, cy, R, 0, Math.PI * 2); g.clip(); grooves(rx, 'rgba(60,15,0,0.14)'); g.restore();
    // kesişim: iki rengin karışımı, koyu
    g.save(); g.beginPath(); g.arc(lx, cy, R, 0, Math.PI * 2); g.clip();
    g.beginPath(); g.arc(rx, cy, R, 0, Math.PI * 2);
    const mix = g.createLinearGradient(lx + 40, cy - R, rx - 40, cy + R); mix.addColorStop(0, '#fff1e6'); mix.addColorStop(0.55, '#ffb98f'); mix.addColorStop(1, '#ff8040');
    g.fillStyle = mix; g.fill(); g.restore();
    // kesişimin çevresine ince parlak kenar
    g.save(); g.beginPath(); g.arc(lx, cy, R, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.0)'; g.lineWidth = 0; g.restore();
    g.save(); g.beginPath(); g.arc(rx, cy, R, 0, Math.PI * 2); g.clip();
    g.restore();
    g.restore();
  },
  // D: elle çizilmiş görünümlü çapraz iki başak (harman = hasat): düz renk, titrek mürekkep çizgisi, kaymış dolgu
  wheat(g, { S, squircle }) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const INK = '#231a14', CREAM = '#fff0d6', BG = '#f0592a', GOLD = '#ffc247';
    g.save(); squircle(g); g.clip();
    g.fillStyle = BG; g.fillRect(0, 0, S, S);
    // kağıt tanesi
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,230,200,0.07)' : 'rgba(60,15,0,0.06)'; const r = 0.6 + rnd() * 1.8; g.beginPath(); g.arc(rnd() * S, rnd() * S, r, 0, 7); g.fill(); }

    // titrek kapalı yol: noktalar arası yumuşak eğri
    const wobble = (pts, amp) => pts.map(([x, y]) => [x + (rnd() - 0.5) * amp * 2, y + (rnd() - 0.5) * amp * 2]);
    const smooth = (pts) => { g.beginPath(); const n = pts.length; g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } g.closePath(); };
    // damla (tane) ana hattı: başlangıç (0,0) → uç (0,-len)
    const drop = (len, wid) => { const pts = []; const N = 14;
      for (let i = 0; i <= N; i++) { const t = i / N; pts.push([wid * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.15 * t), -len * t]); }
      for (let i = N - 1; i >= 1; i--) { const t = i / N; pts.push([-wid * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.15 * t), -len * t]); }
      return pts; };
    const inkShape = (pts, ox, oy, rot, fill) => {
      const place = (arr) => arr.map(([x, y]) => { const c = Math.cos(rot), s = Math.sin(rot); return [ox + x * c - y * s, oy + x * s + y * c]; });
      if (fill) { g.fillStyle = fill; smooth(place(wobble(pts, 3)).map(([x, y]) => [x + 9, y + 7])); g.fill(); }
      g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
      for (const [w, a] of [[9, 3.5], [5, 5]]) { g.lineWidth = w; smooth(place(wobble(pts, a))); g.stroke(); }
    };
    const ear = (bx, by, rot, fill) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      const at = (u, v) => [bx + u * s + v * c * -1 * -1 * 0 + (-v) * -s * 0, 0];           // yer tutucu (kullanılmıyor)
      void at;
      const along = (d, lat) => [bx + d * s + lat * c, by - d * c + lat * s];                 // gövde ekseninde d ileri, lat yana
      // sap: eğri çizgi
      g.strokeStyle = INK; g.lineCap = 'round';
      for (const [w, a] of [[16, 3], [8, 4]]) { g.lineWidth = w; g.beginPath(); const p0 = along(-105, 0), p1 = along(120, 10 + a), p2 = along(560, -6);
        g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.stroke(); }
      const grains = [[140, 0.0], [215, 0.0], [290, 0.0], [365, 0.0], [440, 0.0]];
      grains.forEach(([d], i) => {
        const len = 150 - i * 13, wid = 36 - i * 2.5;
        for (const side of [-1, 1]) { const [gx, gy] = along(d, 0); inkShape(drop(len, wid), gx, gy, rot + side * 0.62, fill); }
      });
      const [tx, ty] = along(500, 0); inkShape(drop(125, 30), tx, ty, rot, fill);
    };
    ear(512, 735, -0.44, CREAM);
    ear(512, 735, 0.44, GOLD);
    // bağ: iki başağı toplayan şerit
    const band = (cx, cy) => { const pts = [[-74, -22], [-28, -29], [34, -26], [76, -19], [80, 19], [26, 29], [-34, 26], [-78, 20]];
      g.fillStyle = INK; smooth(pts.map(([x, y]) => [cx + x + (rnd() - 0.5) * 6, cy + y + (rnd() - 0.5) * 6])); g.fill(); };
    band(512, 728);
    g.restore();
  },
};

const draw = (VARIANT) => {
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

  VARIANTS[VARIANT](g, { S, squircle });

  return c.toDataURL('image/png');
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,<body></body>');
  const dataUrl = await win.webContents.executeJavaScript(`(() => { const VARIANTS = {${Object.values(VARIANTS).map((f) => f.toString()).join(',')}}; return (${draw.toString()})(${JSON.stringify(process.env.VARIANT || 'wheat')}); })()`);
  const out = path.join(__dirname, '..', 'build');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(process.env.OUT || path.join(out, 'icon-1024.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  app.quit();
});
