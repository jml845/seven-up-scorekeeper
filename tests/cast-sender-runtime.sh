#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
browser=$(command -v chromium || command -v google-chrome-stable)
result=$($browser --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=500 --dump-dom "file://$repo_dir/tests/cast-sender-harness.html" 2>/dev/null | grep -o 'data-result="[^"]*"')
expected='data-result="2,1,1,origin,true,true,90,1,true,0"'
test "$result" = "$expected"
echo "Cast sender handshake passed: $result"
