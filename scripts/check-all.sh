#!/usr/bin/env bash
# Runs every project's checks. Usage: ./scripts/check-all.sh
# Browser tests are attempted but skipped (not failed) when no Playwright browser is installed,
# because that download needs internet access to cdn.playwright.dev.
set -u
cd "$(dirname "$0")/.."
rc=0

section() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

run() { # run <project-dir> <label> <command...>
  local dir="$1" label="$2"; shift 2
  section "$label"
  if (cd "$dir" && "$@"); then
    printf 'PASS  %s\n' "$label"
  else
    printf 'FAIL  %s\n' "$label"; rc=1
  fi
}

has_browser() {
  (cd "$1" && npx playwright install --dry-run chromium >/dev/null 2>&1) &&
    ls "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" >/dev/null 2>&1 &&
    [ -n "$(ls -A "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" 2>/dev/null)" ]
}

CANONICAL=implement-source-monitoring-prototype-claude
LEGACY=implement-source-monitoring-protocolargon

for proj in "$CANONICAL" "$LEGACY"; do
  if [ ! -d "$proj/node_modules" ]; then
    section "$proj: npm ci"
    (cd "$proj" && npm ci --no-audit --no-fund) || { printf 'FAIL  %s install\n' "$proj"; exit 1; }
  fi
done

run "$CANONICAL" "canonical: typecheck" npm run typecheck
run "$CANONICAL" "canonical: build" npm run build
run "$CANONICAL" "canonical: unit + component tests" npx vitest run

run "$LEGACY" "superseded: typecheck" npx tsc --noEmit
run "$LEGACY" "superseded: build" npm run build
run "$LEGACY" "superseded: unit tests" npx vitest run

section "browser tests"
if has_browser "$CANONICAL"; then
  run "$CANONICAL" "canonical: playwright e2e" npx playwright test
else
  echo "SKIP  no Playwright browser installed (run: npx playwright install chromium)"
fi

printf '\n\033[1moverall exit: %d\033[0m\n' "$rc"
exit $rc
