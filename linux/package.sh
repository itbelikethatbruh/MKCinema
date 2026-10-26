#!/bin/sh
# Builds mkcinema_1.0_amd64.deb and mkcinema-1.0-linux-x86_64.tar.gz. Needs gcc, libwebkit2gtk-4.1-dev, python3-pil, dpkg-deb.
set -e
cd "$(dirname "$0")"; SRC=$PWD; OUT=${OUT:-$SRC/build}; V=1.0
rm -rf "$OUT"; mkdir -p "$OUT"
gcc -O2 -Wall -o "$OUT/mkcinema" mkcinema.c $(pkg-config --cflags --libs webkit2gtk-4.1); strip "$OUT/mkcinema"
D=$OUT/deb; mkdir -p $D/DEBIAN $D/usr/bin $D/usr/share/applications
install -m755 "$OUT/mkcinema" $D/usr/bin/mkcinema; install -m644 mkcinema.desktop $D/usr/share/applications/
for s in 48 64 128 256 512; do mkdir -p $D/usr/share/icons/hicolor/${s}x${s}/apps
  python3 -c "from PIL import Image;Image.open('$SRC/icon-512.png').resize(($s,$s),Image.LANCZOS).save('$D/usr/share/icons/hicolor/${s}x${s}/apps/mkcinema.png')"; done
cat > $D/DEBIAN/control <<C
Package: mkcinema
Version: $V
Section: video
Priority: optional
Architecture: amd64
Depends: libwebkit2gtk-4.1-0, libgtk-3-0
Maintainer: MKCinema <noreply@mkcinema.pages.dev>
Homepage: https://mkcinema-site.pages.dev
Description: Your Stremio addons in a premium cinema
 MKCinema in its own window, with your library, addons and sign-in kept between sessions.
C
dpkg-deb --root-owner-group --build $D "$OUT/mkcinema_${V}_amd64.deb" >/dev/null
T=$OUT/mkcinema-$V; mkdir -p $T; cp "$OUT/mkcinema" mkcinema.desktop $T/; cp $D/usr/share/icons/hicolor/512x512/apps/mkcinema.png $T/
cat > $T/install.sh <<'I'
#!/bin/sh
# Installs MKCinema for this user (no sudo). Needs WebKitGTK 4.1: sudo apt install libwebkit2gtk-4.1-0, or sudo dnf install webkit2gtk4.1
set -e; cd "$(dirname "$0")"
mkdir -p ~/.local/bin ~/.local/share/applications ~/.local/share/icons/hicolor/512x512/apps
install -m755 mkcinema ~/.local/bin/mkcinema
install -m644 mkcinema.png ~/.local/share/icons/hicolor/512x512/apps/mkcinema.png
sed "s|^Exec=mkcinema|Exec=$HOME/.local/bin/mkcinema|" mkcinema.desktop > ~/.local/share/applications/mkcinema.desktop
echo "MKCinema installed. Find it in your app menu, or run ~/.local/bin/mkcinema"
I
chmod 755 $T/install.sh $T/mkcinema
tar -C "$OUT" -czf "$OUT/mkcinema-$V-linux-x86_64.tar.gz" mkcinema-$V
ls -la "$OUT"/*.deb "$OUT"/*.tar.gz
