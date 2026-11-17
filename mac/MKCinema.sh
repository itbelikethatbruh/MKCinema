#!/bin/sh
# The app's launcher. On Apple silicon it always runs natively: if macOS started it under Rosetta (Intel
# translation), it restarts osascript as arm64, where WebKit starts quickly. Info.plist asks for arm64 first as well.
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
if [ "$(/usr/sbin/sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then
  MKC_ARCH="arm64 (restarted from Rosetta)" MKC_RES="$DIR" exec /usr/bin/arch -arm64 /usr/bin/osascript -l JavaScript "$DIR/main.js"
fi
MKC_ARCH="$(/usr/bin/uname -m)" MKC_RES="$DIR" exec /usr/bin/osascript -l JavaScript "$DIR/main.js"
