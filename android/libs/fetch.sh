#!/bin/sh
# 1.7.0: ExoPlayer (Media3 1.8.0) and Guava, which build.sh compiles into the APK. Only the classes.jar of each AAR is
# used: none of these need Android resources for what PlayerActivity calls. Checked against SHA256SUMS.
set -e
cd "$(dirname "$0")"
G=https://dl.google.com/android/maven2/androidx/media3; M=https://repo1.maven.org/maven2/com/google/guava
for a in exoplayer common datasource decoder extractor container database exoplayer-hls; do
  [ -f media3-$a-1.8.0.jar ] && continue
  curl -sSfL -o x.aar $G/media3-$a/1.8.0/media3-$a-1.8.0.aar && unzip -p x.aar classes.jar > media3-$a-1.8.0.jar && rm x.aar
done
[ -f webkit-1.12.1.jar ] || { curl -sSfL -o x.aar https://dl.google.com/android/maven2/androidx/webkit/webkit/1.12.1/webkit-1.12.1.aar && unzip -p x.aar classes.jar > webkit-1.12.1.jar && rm x.aar; }  # 1.8.1: document-start script for the bridge key
[ -f collection-1.2.0.jar ] || curl -sSfL -o collection-1.2.0.jar https://dl.google.com/android/maven2/androidx/collection/collection/1.2.0/collection-1.2.0.jar  # ExoPlayer's async MediaCodec queue (Android 12+)
[ -f guava-33.3.1-android.jar ] || curl -sSfL -o guava-33.3.1-android.jar $M/guava/33.3.1-android/guava-33.3.1-android.jar
[ -f failureaccess-1.0.2.jar ] || curl -sSfL -o failureaccess-1.0.2.jar $M/failureaccess/1.0.2/failureaccess-1.0.2.jar
# 1.9.0: libass for full ASS/SSA subtitles (ass-media + ass-kt 0.4.0, MIT, built for Media3 1.8.0) and the Kotlin
# runtime they need. The native libraries go to ass-jni/<abi>/, which build.sh adds to the APK.
C=https://repo1.maven.org/maven2; C2=https://maven-central.storage-download.googleapis.com/maven2
get() { curl -sSfL -o "$2" "$C/$1" || curl -sSfL -o "$2" "$C2/$1"; }
[ -f ass-media-0.4.0.jar ] || { get io/github/peerless2012/ass-media/0.4.0/ass-media-0.4.0.aar x.aar && unzip -p x.aar classes.jar > ass-media-0.4.0.jar && rm x.aar; }
if [ ! -f ass-kt-0.4.0.jar ] || [ ! -f ass-jni/arm64-v8a/libass.so ]; then
  get io/github/peerless2012/ass-kt/0.4.0/ass-kt-0.4.0.aar x.aar && unzip -p x.aar classes.jar > ass-kt-0.4.0.jar
  for abi in arm64-v8a armeabi-v7a; do mkdir -p ass-jni/$abi; for so in libass.so libasskt.so libc++_shared.so; do unzip -p x.aar jni/$abi/$so > ass-jni/$abi/$so; done; done
  rm x.aar
fi
[ -f kotlin-stdlib-2.2.0.jar ] || get org/jetbrains/kotlin/kotlin-stdlib/2.2.0/kotlin-stdlib-2.2.0.jar kotlin-stdlib-2.2.0.jar
sha256sum -c SHA256SUMS
