#!/usr/bin/env bash
# Harman.dmg üretir (sürüm package.json'dan). Uygulama imzasızdır: başka bir Mac'te ilk açılışta
# sağ tık → Aç demek gerekir. Çıktı: dist-dmg/Harman-<sürüm>.dmg
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
OUT=dist-dmg
STAGE="$OUT/stage"
rm -rf "$OUT" && mkdir -p "$STAGE"

# İkon yoksa (temiz kopya) package.sh'ın ikon adımını çalıştırmak için önce onu üret.
if [ ! -f build/icon.icns ]; then
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

./node_modules/.bin/electron-packager . Harman \
  --platform=darwin --arch=arm64 --out="$OUT/app" --overwrite \
  --icon=build/icon.icns \
  --ignore='^/(dist|dist-next|dist-dmg|assets|scripts|test|build/icon-1024\.png|\.gitignore|README\.md)' \
  --app-bundle-id=com.harman.app

cp -R "$OUT/app/Harman-darwin-arm64/Harman.app" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Harman" -srcfolder "$STAGE" -ov -format UDZO "$OUT/Harman-$VERSION.dmg" >/dev/null
rm -rf "$STAGE" "$OUT/app"
echo "Hazır: $PWD/$OUT/Harman-$VERSION.dmg"
