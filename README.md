# Ground Truth + BlindSpot

Local-first source-monitoring and uncertainty-review prototype, built from the assignment in
`GroundTruth_BlindSpot_Agent_Handoff/`.

## Which implementation to use

**[`implement-source-monitoring-prototype-claude/`](implement-source-monitoring-prototype-claude/) is the canonical implementation.**

Both implementations were reviewed end to end (see [`.review/REVIEW.md`](.review/REVIEW.md)). Their
replay engines were found to be **equally correct** — all seven expected state snapshots from spec §4
and the same six-transition list, verified by harnesses that drive each project's shipped engine
directly rather than a reimplementation. The canonical copy was chosen on claim hygiene and
documentation accuracy, and the genuinely additive feature from the other implementation (the
optional §7 test-feed adapter) was ported into it.

## Directory structure

| Path | Role |
|---|---|
| `GroundTruth_BlindSpot_Agent_Handoff/` | The assignment: spec, baseline inspection, `starting_point/` baseline app, context reviews, `SHA256SUMS.txt` |
| `implement-source-monitoring-prototype-claude/` | **Canonical implementation.** Complete app, fixtures, 149 unit/component tests, browser tests, docs |
| `implement-source-monitoring-protocolargon/` | Independent implementation by Protocol Argon — **superseded**, kept for provenance and auditability |
| `.review/` | The end-to-end review, the verification harnesses used for it, and the side-by-side preview server |

## Verify it yourself

```sh
cd implement-source-monitoring-prototype-claude
npm ci                 # needs internet once; exact-pinned dependencies
npm run typecheck      # tsc for app and tests
npm run build          # single-file dist/index.html with a restrictive CSP
npm test               # 149 unit + component tests

# Browser tests need a one-time download; they cannot run where cdn.playwright.dev is unreachable.
npx playwright install chromium
npx playwright test
```

Or run every project's checks at once: `./scripts/check-all.sh`.

To open the built app without a server: `open implement-source-monitoring-prototype-claude/dist/index.html`.

## Known state of the superseded implementation

`implement-source-monitoring-protocolargon/` is functionally correct but ships the retained Idea
Studio showcase in its production bundle, including vocabulary spec §1 forbids (`Brier` ×12,
`Sybil` ×1, `OPSEC scrubbing` ×1). Its `RESULTS_AND_LIMITATIONS.md` §1 row has been corrected to
record this, and its own README carries a superseded banner. Its bare `npx vitest run` was failing
(no Vitest config, so it picked up a Playwright script) and has been fixed.

## Reproducing the review

```sh
cd implement-source-monitoring-protocolargon && npx tsx ../.review/harness-argon.mts
node .review/preview-server.mjs        # serves both builds at http://localhost:4173
```
