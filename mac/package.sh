#!/bin/sh
# Builds MKCinema-1.0.dmg on Linux. Needs mkfs.hfsplus (hfsprogs) and the dmg and hfsplus tools from mozilla/libdmg-hfsplus ($DMGTOOLS).
set -e
cd "$(dirname "$0")"; SRC=$PWD; OUT=${OUT:-$SRC/build}; T=${DMGTOOLS:?set DMGTOOLS to your libdmg-hfsplus build folder}
rm -rf "$OUT"; mkdir -p "$OUT/stage/MKCinema.app/Contents/MacOS" "$OUT/stage/MKCinema.app/Contents/Resources"
A=$OUT/stage/MKCinema.app/Contents
cp Info.plist $A/; printf 'APPL????' > $A/PkgInfo
cp MKCinema.sh $A/MacOS/MKCinema; chmod 755 $A/MacOS/MKCinema
cp main.js MKCinema.icns $A/Resources/
cp MKCinema.icns "$OUT/stage/.VolumeIcon.icns"
dd if=/dev/zero of="$OUT/raw.img" bs=1M count=8 status=none
mkfs.hfsplus -v MKCinema "$OUT/raw.img" >/dev/null
$T/hfs/hfsplus "$OUT/raw.img" addall "$OUT/stage"
$T/hfs/hfsplus "$OUT/raw.img" chmod 755 /MKCinema.app/Contents/MacOS/MKCinema
$T/hfs/hfsplus "$OUT/raw.img" symlink /Applications /Applications
$T/hfs/hfsplus "$OUT/raw.img" attr / com.apple.FinderInfo 0000000000000000040000000000000000000000000000000000000000000000 2>/dev/null || true
$T/dmg/dmg build "$OUT/raw.img" "$OUT/MKCinema-1.0.dmg" >/dev/null
ls -la "$OUT/MKCinema-1.0.dmg"
