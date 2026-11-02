#!/usr/bin/env bash
# Harman.app'i derler ve masaüstüne kısayol koyar.
set -euo pipefail
cd "$(dirname "$0")/.."

# İkon: PNG → .icns (logo betiği değiştiyse yeniden üretilir)
if [ ! -f build/icon.icns ] || [ build/icon.icns -ot scripts/make-icon.js ]; then
  ./node_modules/.bin/electron scripts/make-icon.js
  ICONSET=build/icon.iconset
  rm -rf "$ICONSET" && mkdir -p "$ICONSET"
  for s in 16 32 128 256 512; do
    sips -z $s $s build/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) build/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o build/icon.icns
  rm -rf "$ICONSET"
fi

# Harman şu an açıksa onun dosyalarını silmek açık penceredeki çalışmayı bozabilir. Bu durumda yeni
# sürüm ayrı bir klasöre (dist-next) derlenir, çalışan uygulamaya ve masaüstü kısayoluna dokunulmaz.
OUT=dist
RUNNING=0
if pgrep -f "Harman.app/Contents/MacOS/Harman" >/dev/null 2>&1; then
  RUNNING=1
  OUT=dist-next
  echo "Harman şu an çalışıyor: yeni sürüm $OUT/ klasörüne derlenir, açık uygulamaya dokunulmaz."
fi

./node_modules/.bin/electron-packager . Harman \
  --platform=darwin --arch=arm64 --out="$OUT" --overwrite \
  --icon=build/icon.icns \
  --ignore='^/(dist|dist-next|dist-dmg|assets|test|scripts|build/icon-1024\.png|\.gitignore|README\.md)' \
  --extend-info=scripts/Info-extra.plist \
  --app-bundle-id=com.harman.app

if [ "$RUNNING" = 1 ]; then
  echo "Hazır: $PWD/$OUT/Harman-darwin-arm64/Harman.app"
  echo "Çalışmanı bitirip Harman'ı kapattıktan sonra tekrar 'npm run package' çalıştır; kısayol o zaman güncellenir."
  exit 0
fi

APP="$PWD/dist/Harman-darwin-arm64/Harman.app"
LINK="$HOME/Desktop/Harman.app"
[ -L "$LINK" ] && rm "$LINK"
if [ -e "$LINK" ]; then
  echo "Masaüstünde zaten gerçek bir Harman.app var, dokunmadım: $LINK"
else
  ln -s "$APP" "$LINK"
  echo "Masaüstü kısayolu: $LINK"
fi
