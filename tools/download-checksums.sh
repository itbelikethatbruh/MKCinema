#!/usr/bin/env bash
# Rewrites site/download/SHA256SUMS after a file in site/download changes.
set -euo pipefail
cd "$(dirname "$0")/../site/download"
find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%f\n' | LC_ALL=C sort | xargs -d '\n' sha256sum > SHA256SUMS
cat SHA256SUMS
