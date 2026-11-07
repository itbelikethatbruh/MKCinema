#!/usr/bin/env bash
# Rewrites site/download/SHA256SUMS from the files the website serves.
#   tools/download-checksums.sh <folder>   the download folder of the site deploy copy
# The app files are not kept in git; only this list is.
set -euo pipefail
src="${1:?usage: tools/download-checksums.sh <folder with the site download files>}"
out="$(cd "$(dirname "$0")/../site/download" && pwd)/SHA256SUMS"
cd "$src"
find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%f\n' | LC_ALL=C sort | xargs -d '\n' sha256sum > "$out"
cat "$out"
