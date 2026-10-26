#!/bin/sh
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
MKC_RES="$DIR" exec /usr/bin/osascript -l JavaScript "$DIR/main.js"
