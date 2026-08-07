#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
browser=$(command -v chromium || command -v google-chrome-stable)
result=$($browser --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=1400 --dump-dom "file://$repo_dir/tests/cast-animation-failure-harness.html" 2>/dev/null | grep -o 'data-failure="[^"]*"')
expected='data-failure="2,0,1"'
test "$result" = "$expected"
echo "Cast persistent-failure recovery passed: $result"
