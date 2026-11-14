#!/usr/bin/env bash
# Runs every check and stores the real output under test-results/. Works on macOS and Linux.
# Usage: npm run test:all     (first time only: npx playwright install chromium)
set -u
cd "$(dirname "$0")/.."
mkdir -p test-results
OUT=test-results
{
  echo "date (wall clock, informational only): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "uname: $(uname -srm)"
  echo "node: $(node -v)   npm: $(npm -v)"
  echo "vitest: $(npx vitest --version)"
  echo "playwright: $(npx playwright --version)"
} > "$OUT/environment.txt"
rc=0
run() { # name, command...
  local name="$1"; shift
  echo "== $name: $*" | tee "$OUT/$name.txt"
  "$@" >> "$OUT/$name.txt" 2>&1; local c=$?
  echo "exit code: $c" | tee -a "$OUT/$name.txt"
  [ $c -ne 0 ] && rc=1
  return 0
}
run 01-typecheck npm run typecheck
run 02-build npm run build
run 03-unit npx vitest run
run 04-e2e npx playwright test
echo "overall exit: $rc" | tee "$OUT/00-summary.txt"
exit $rc
