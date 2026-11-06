#!/bin/sh
# Builds MKCinema-1.1.1-mac.zip, plus MKCinema-1.1.1.dmg when the dmg tools are present: mkfs.hfsplus (hfsprogs) and
# the dmg and hfsplus tools from mozilla/libdmg-hfsplus ($DMGTOOLS). Needs Go 1.24+ and python3 for the torrent
# engine, which is built from the Windows app's p2p code as one universal (Apple silicon + Intel) program.
set -e
cd "$(dirname "$0")"; SRC=$PWD; OUT=${OUT:-$SRC/build}; T=${DMGTOOLS:-}; V=1.1.1
GOSRC=${GOSRC:-$(cd "$SRC/.." && if [ -d mkcinema-windows ]; then echo "$PWD/mkcinema-windows"; else echo "$PWD/windows"; fi)}
rm -rf "$OUT"; mkdir -p "$OUT/stage/MKCinema.app/Contents/MacOS" "$OUT/stage/MKCinema.app/Contents/Resources"
A=$OUT/stage/MKCinema.app/Contents
cp Info.plist $A/; printf 'APPL????' > $A/PkgInfo
cp MKCinema.sh $A/MacOS/MKCinema; chmod 755 $A/MacOS/MKCinema
cp main.js MKCinema.icns $A/Resources/
# the torrent engine (only downloads, never uploads; see main.js). Go signs the Apple silicon half ad hoc.
for a in arm64 amd64; do (cd "$GOSRC" && GOOS=darwin GOARCH=$a CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$OUT/mkp2p-$a" ./cmd/mkp2p); done
python3 -I "$SRC/makefat.py" "$A/Resources/mkp2p" "$OUT/mkp2p-arm64" "$OUT/mkp2p-amd64"; chmod 755 "$A/Resources/mkp2p"
(cd "$OUT/stage" && rm -f "$OUT/MKCinema-$V-mac.zip" && zip -qr -X "$OUT/MKCinema-$V-mac.zip" MKCinema.app)
ls -la "$OUT/MKCinema-$V-mac.zip"
if command -v mkfs.hfsplus >/dev/null && [ -x "$T/dmg/dmg" ]; then
  cp MKCinema.icns "$OUT/stage/.VolumeIcon.icns"
  dd if=/dev/zero of="$OUT/raw.img" bs=1M count=48 status=none
  mkfs.hfsplus -v MKCinema "$OUT/raw.img" >/dev/null
  $T/hfs/hfsplus "$OUT/raw.img" addall "$OUT/stage"
  $T/hfs/hfsplus "$OUT/raw.img" chmod 755 /MKCinema.app/Contents/MacOS/MKCinema
  $T/hfs/hfsplus "$OUT/raw.img" chmod 755 /MKCinema.app/Contents/Resources/mkp2p
  $T/hfs/hfsplus "$OUT/raw.img" symlink /Applications /Applications
  $T/hfs/hfsplus "$OUT/raw.img" attr / com.apple.FinderInfo 0000000000000000040000000000000000000000000000000000000000000000 2>/dev/null || true
  $T/dmg/dmg build "$OUT/raw.img" "$OUT/MKCinema-$V.dmg" >/dev/null
  ls -la "$OUT/MKCinema-$V.dmg"
else
  echo "dmg tools not found: built the zip only"
fi
