#!/usr/bin/env bash
# Puts the Windows native player's engine, libmpv-2.dll, into DIR, and builds the zip the Windows app downloads.
#
#   bash tools/release/libmpv.sh DIR [REPO]
#
# The build is pinned: one release of https://github.com/shinchiro/mpv-winbuild-cmake, checked by SHA-256 (the one
# tested on a Windows runner by windows-native.yml). That project removes old releases after a while, so when the
# pinned file is gone the engine zip on REPO's newest release is used instead, after the same DLL check.
# Writes DIR/libmpv-2.dll, DIR/MKCinema-engine-windows-x64.zip (DLL + README.txt) and DIR/engine.env (its SHA-256).
set -euo pipefail
dir=$1 repo=${2:-itbelikethatbruh/MKCinema}

MPV_TAG=20261111
MPV_7Z=mpv-dev-x86_64-20261111-git-bcde6b93cc.7z
MPV_7Z_SHA=273c079b11ea5575822f972756f4c9a71149a5c10130353abeb8586738938452
DLL_SHA=88504ee5560942a955405e99dfb5971368e4cf851321f36565bf2a667271db1b
ZIP=MKCinema-engine-windows-x64.zip

mkdir -p "$dir"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if curl -fsSL --retry 3 -o "$tmp/$MPV_7Z" "https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/$MPV_TAG/$MPV_7Z"; then
  echo "$MPV_7Z_SHA  $tmp/$MPV_7Z" | sha256sum -c -
  7z x -y -o"$tmp" "$tmp/$MPV_7Z" libmpv-2.dll > /dev/null
else
  echo "::warning::$MPV_7Z is gone from mpv-winbuild-cmake, using the engine zip on $repo's newest release"
  curl -fsSL --retry 3 -o "$tmp/prev.zip" "https://github.com/$repo/releases/latest/download/$ZIP"
  (cd "$tmp" && unzip -q -o prev.zip libmpv-2.dll)
fi
echo "$DLL_SHA  $tmp/libmpv-2.dll" | sha256sum -c -
cp "$tmp/libmpv-2.dll" "$dir/libmpv-2.dll"

cat > "$dir/README.txt" <<TXT
The engine of MKCinema for Windows' native player. MKCinema downloads this by itself; you never need to open it.
To use it offline, put libmpv-2.dll next to MKCinema.exe.

libmpv-2.dll is mpv (https://mpv.io), built by https://github.com/shinchiro/mpv-winbuild-cmake release $MPV_TAG
($MPV_7Z). mpv and FFmpeg are free software under the GPL and LGPL. Their source code:
https://github.com/mpv-player/mpv and https://ffmpeg.org, and the build recipe at the project above.

SHA-256 of libmpv-2.dll: $DLL_SHA
TXT
rm -f "$dir/$ZIP"
# fixed dates, so the same DLL always makes the same zip
touch -d 2026-01-01T00:00:00Z "$dir/libmpv-2.dll" "$dir/README.txt"
(cd "$dir" && zip -q -X -9 "$ZIP" libmpv-2.dll README.txt)
echo "ENGINE_SHA=$(sha256sum "$dir/$ZIP" | cut -d' ' -f1)" > "$dir/engine.env"
ls -la "$dir"; cat "$dir/engine.env"
