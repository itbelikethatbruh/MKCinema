#!/bin/sh
# Builds MKCinema.apk. Needs the Android SDK (build-tools 35, platform 35) at $SDK and the signing key in keystore/.
set -e
cd "$(dirname "$0")"
SDK=${SDK:-$ANDROID_HOME}; BT=$SDK/build-tools/35.0.0; JAR=$SDK/platforms/android-35/android.jar
OUT=${OUT:-build}; rm -rf $OUT; mkdir -p $OUT/c $OUT/classes $OUT/dex
$BT/aapt2 compile --dir res -o $OUT/c/res.zip
$BT/aapt2 link -I $JAR --manifest AndroidManifest.xml -o $OUT/base.apk $OUT/c/res.zip --auto-add-overlay
javac -source 11 -target 11 -nowarn -cp $JAR -d $OUT/classes $(find src -name '*.java')
$BT/d8 --release --min-api 24 --lib $JAR --output $OUT/dex $(find $OUT/classes -name '*.class')
cp $OUT/base.apk $OUT/unsigned.apk; (cd $OUT/dex && zip -q ../unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
$BT/apksigner sign --ks keystore/mkcinema.jks --ks-pass file:keystore/password.txt --out $OUT/MKCinema.apk $OUT/aligned.apk
$BT/apksigner verify --print-certs $OUT/MKCinema.apk | head -3
