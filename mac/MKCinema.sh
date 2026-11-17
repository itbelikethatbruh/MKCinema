#!/bin/sh
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
ARCH="$(/usr/bin/uname -m)"; [ "$(/usr/sbin/sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ] && ARCH="$ARCH (Rosetta)"
MKC_ARCH="$ARCH" MKC_RES="$DIR" exec /usr/bin/osascript -l JavaScript "$DIR/main.js"
