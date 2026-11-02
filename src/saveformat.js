// Kaydetme penceresinden gelen yoldan dosya yolunu ve biçimi çıkarır.
const path = require('path');

function resolveSaveTarget(chosen) {
  const ext = path.extname(chosen).toLowerCase();
  if (ext === '.wav') return { filePath: chosen, format: 'wav' };
  if (ext === '.mp3') return { filePath: chosen, format: 'mp3' };
  return { filePath: `${chosen}.mp3`, format: 'mp3' };   // bilinmeyen uzantı: MP3 olarak kaydet
}

module.exports = { resolveSaveTarget };
