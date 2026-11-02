// Kaydetme penceresinden gelen yoldan dosya yolunu ve biçimi çıkarır.
const path = require('path');

function resolveSaveTarget(chosen, preferred = 'mp3') {
  const ext = path.extname(chosen).toLowerCase();
  if (ext === '.wav') return { filePath: chosen, format: 'wav' };
  if (ext === '.mp3') return { filePath: chosen, format: 'mp3' };
  const format = preferred === 'wav' ? 'wav' : 'mp3';
  return { filePath: `${chosen}.${format}`, format };   // uzantı yoksa seçili çıktı ayarındaki biçim
}

module.exports = { resolveSaveTarget };
