#!/bin/sh
# Builds MKCinema.apk. Needs the Android SDK (build-tools 35, platform 35) at $SDK and the signing key in keystore/.
set -e
cd "$(dirname "$0")"
SDK=${SDK:-$ANDROID_HOME}; BT=$SDK/build-tools/35.0.0; JAR=$SDK/platforms/android-35/android.jar
OUT=${OUT:-build}; rm -rf $OUT; mkdir -p $OUT/c $OUT/classes $OUT/dex
$BT/aapt2 compile --dir res -o $OUT/c/res.zip
$BT/aapt2 link -I $JAR --manifest AndroidManifest.xml -o $OUT/base.apk $OUT/c/res.zip --auto-add-overlay
# 1.7.0: ExoPlayer (Media3) and Guava jars in libs/ (libs/fetch.sh downloads them)
# 1.8.1: androidx.webkit (bridge key reaches only MKCinema's own pages, see MainActivity.bridgeJs)
[ -f libs/media3-exoplayer-1.8.0.jar ] && [ -f libs/webkit-1.12.1.jar ] && [ -f libs/ass-media-0.4.0.jar ] && [ -f libs/ass-jni/arm64-v8a/libass.so ] || sh libs/fetch.sh
LIBS=$(ls libs/*.jar | tr '\n' ':')
javac -source 11 -target 11 -nowarn -cp $JAR:$LIBS -d $OUT/classes $(find src -name '*.java')
$BT/d8 --release --min-api 24 --lib $JAR --output $OUT/dex $(find $OUT/classes -name '*.class') libs/*.jar
cp $OUT/base.apk $OUT/unsigned.apk; (cd $OUT/dex && zip -q ../unsigned.apk classes*.dex)
# 1.3.0: torrent engine binaries (built from windows/cmd/mkp2p, see jniLibs/README.md), stored as lib/<abi>/libmkp2p.so
# 1.9.0: libass (libs/ass-jni, from libs/fetch.sh) for styled ASS/SSA subtitles in the TV player
mkdir -p $OUT/lib
if [ -d jniLibs ]; then cp -r jniLibs/* $OUT/lib/ && rm -f $OUT/lib/README.md; fi
if [ -d libs/ass-jni ]; then cp -r libs/ass-jni/* $OUT/lib/; fi
if [ -n "$(ls $OUT/lib)" ]; then (cd $OUT && zip -q -r unsigned.apk lib); fi
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
# KS / KS_PASS (apksigner --ks-pass form, e.g. file:/path or env:VAR) can point at a key kept outside the repo
$BT/apksigner sign --ks "${KS:-keystore/mkcinema.jks}" --ks-pass "${KS_PASS:-file:keystore/password.txt}" --out $OUT/MKCinema.apk $OUT/aligned.apk
$BT/apksigner verify --print-certs $OUT/MKCinema.apk | head -3
