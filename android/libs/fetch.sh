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
[ -f collection-1.2.0.jar ] || curl -sSfL -o collection-1.2.0.jar https://dl.google.com/android/maven2/androidx/collection/collection/1.2.0/collection-1.2.0.jar  # ExoPlayer's async MediaCodec queue (Android 12+)
[ -f guava-33.3.1-android.jar ] || curl -sSfL -o guava-33.3.1-android.jar $M/guava/33.3.1-android/guava-33.3.1-android.jar
[ -f failureaccess-1.0.2.jar ] || curl -sSfL -o failureaccess-1.0.2.jar $M/failureaccess/1.0.2/failureaccess-1.0.2.jar
sha256sum -c SHA256SUMS
