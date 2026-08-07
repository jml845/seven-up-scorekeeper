#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
browser=$(command -v chromium || command -v google-chrome-stable)
result=$($browser --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=1800 --dump-dom "file://$repo_dir/tests/cast-animation-harness.html" 2>/dev/null | grep -o 'data-queue="[^"]*"')
expected='data-queue="p1:bust,p1:flip7,p1:x2,p1:freeze,p1:fire,p1:electric|held:0"'
test "$result" = "$expected"
echo "Cast animation runtime queue passed: $result"
