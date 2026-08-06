#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
browser=$(command -v chromium || command -v google-chrome-stable)
result=$($browser --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=1800 --dump-dom "file://$repo_dir/tests/cast-animation-harness.html" 2>/dev/null | grep -o 'data-queue="[^"]*"')
expected='data-queue="p1:bust|held:1"'
test "$result" = "$expected"
echo "Cast animation runtime queue passed: $result"
