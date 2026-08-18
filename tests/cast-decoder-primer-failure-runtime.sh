#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
browser=$(command -v chromium || command -v google-chrome-stable)
result=$($browser --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=4200 --dump-dom "file://$repo_dir/tests/cast-decoder-primer-failure-harness.html" 2>/dev/null | grep -o 'data-primer-failure="[^"]*"')
expected='data-primer-failure="0,0,1"'
test "$result" = "$expected"
echo "Cast decoder-primer failure fallback passed: $result"
