#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
browser=$(command -v chromium || command -v google-chrome-stable)
result=$($browser --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=700 --dump-dom "file://$repo_dir/tests/cast-animation-concurrency-harness.html" 2>/dev/null | grep -o 'data-concurrency="[^"]*"')
expected='data-concurrency="1,3"'
test "$result" = "$expected"
echo "Cast adaptive concurrency passed: $result"
