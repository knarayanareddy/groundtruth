# Ground Truth + BlindSpot — end-to-end repository review

**Reviewed:** 2026-11-14 · branch `arena/bd8e4dd7-groundtruth` @ `8f7621c`
**Environment:** Linux x86_64, Node v22.22.3, npm 10.9.8 (note: both agents built and tested on Node v20.20.2)
**Scratch:** harnesses kept in `.review/` (untracked); no repository file was modified.

---

## 1. What this repository is

Three areas, one commit of history:

| Path | What it is |
|---|---|
| `GroundTruth_BlindSpot_Agent_Handoff/` | The assignment: spec, baseline inspection, `starting_point/` baseline app, context reviews |
| `implement-source-monitoring-protocolargon/` | Independent implementation A ("Protocol Argon") |
| `implement-source-monitoring-prototype claude/` | Independent implementation B ("Claude") |

Both agents were given the same 9-section spec and asked to build a local-first, deterministic
source-monitoring replay prototype. The spec's hard part is **semantic**: heartbeat freshness vs.
observation age vs. transport age must be kept distinct, replay must be strictly causal, and the
app must not overclaim (no independence, no calibration, no "clear scene", no privacy scrubber).

## 2. How I verified (not what I read)

I did not rely on either team's claims. Everything below was executed in this sandbox:

- **Integrity:** `sha256sum -c` on the handoff manifest → **29/29 OK**.
- **Install/build/typecheck:** both projects `npm ci` → `tsc --noEmit` → `vite build`.
- **Engine harness (the core check):** I wrote independent harnesses that import each team's *shipped*
  engine (`deriveReplaySnapshot` / `deriveAt`), load the *checked-in* fixture from disk, and assert
  every snapshot in spec §4. No reimplementation, no stubs.
- **Validation/round-trip harness:** 14 malformed/hostile inputs per engine, export→reimport
  determinism, tamper detection, note causality, dependency-overlap categories.
- **Bundle scan:** occurrence counts (`grep -o | wc -l`, not `grep -c`) against both built
  `dist/index.html` files for the forbidden claim vocabulary.
- **Live server test:** ran Claude's `serve-local.mjs` and probed it with curl + `ss`.

## 3. Headline result: both engines are correct

This is the most important finding, and it is good news. **Both implementations produce exactly the
state machine the spec demands.** Driving the real code with the real fixtures:

| T | Spec expects (A / B / C) | Argon | Claude |
|---|---|---|---|
| 0 | FRESH / FRESH / WAITING | ✅ | ✅ |
| 2 | FRESH / FRESH / WAITING + disagreement visible | ✅ (1 disagreement) | ✅ (1 disagreement) |
| 5 | **FRESH** / **STALE** / WAITING | ✅ exact-threshold rule correct | ✅ |
| 6 | FRESH / **STALE** / WAITING | ✅ backfill did *not* restore heartbeat | ✅ |
| 7 | FRESH / **FRESH** / WAITING | ✅ recovery recorded | ✅ |
| 10 | **STALE** / FRESH / WAITING | ✅ | ✅ |
| 12 | STALE / **STALE** / WAITING | ✅ | ✅ |

Both produce the identical 6-transition list (A@0, B@0, B@5 timeout, B@7 recovery, A@10, B@12),
both keep `lastHeartbeatReceivedAt=0` / `lastPacketReceivedAt=6` at T=6 (the trap the spec sets for
backfilled observations), and both derive state as a **pure function of T** — so play/step/seek
equivalence is structural rather than something that has to be tested into existence.

Dependency semantics are also correct in both: `A↔B` reports `gateway-1` as the only shared
dependency, disjoint `power-1`/`power-2` is **not** converted into an independence claim, `C`'s pairs
stay `unknown_or_partial`, and neither codebase contains any independence/trust/Brier score field.

Import validation is solid in both. Every hostile input I threw was rejected all-or-nothing with a
path-specific error (malformed JSON, duplicate event ID, unresolved source ref, unresolved dependency
ref, bad enum, bad schema version, negative threshold, negative time, >1 MiB, duplicate source ID).
Claude additionally ships 8 checked-in invalid fixtures and rejects all 8 with correct JSON paths;
both flag a tampered `derivedSnapshot` on import and let the recomputation win.

**Neither has an XSS surface:** zero `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`
or `document.write` in either `src/`.

## 4. Findings

### High — Argon ships the forbidden claim vocabulary in its production bundle

Spec §1 says not to present "invented calibrations, `true independent groups`, Sybil conclusions".
Argon's `RESULTS_AND_LIMITATIONS.md` §1 asserts **"No regex PII scrubber, Brier score, Sybil claim …
is included."** Occurrence counts in the built `dist/index.html`:

| Term | Argon | Claude |
|---|---|---|
| Brier | **12** | 0 |
| Sybil | **1** | 0 |
| "OPSEC scrubbing" | **1** | 0 |
| Raspberry Pi | **9** | 0 |

Sources: `src/data/reviewData.ts`, `src/data/ukraineResearchData.ts`,
`src/components/NexusTrustLineView.tsx`. Concrete example still shipping:
`"3-Tier OPSEC Anonymity & PII Scrubber"` (`ukraineResearchData.ts:167`) and
`"Brier-calibrated expert scoring, 3-tier anonymity OPSEC scrubbing, Sybil/collusion burst
detection"`. These are user-reachable — `App.tsx` still renders six showcase tabs
(`benchmark, nexus, fiber, mantavia, thermal, phalanx`) and `AuditAndMergerView.tsx` carries no
disclaimer.

**Why their own check missed it:** their verification command greps only four literals
(`QUARANTINED_SYBIL|REDACTED-VANTAGE-POINT|SAM MISSILE SAVED|TelegramBot_UA_Watch88`) — all specific
to the deleted `BenchmarkTacticalView.tsx`. I ran that exact command: it passes. But it tests one
file's strings, not the claim class the spec forbids. To their credit, `CHANGES_AND_PROVENANCE.md`
§3 *does* disclose retaining `reviewData.ts` and the other views — so the deliverable contradicts
itself rather than concealing the retention.

*For accuracy:* Claude's bundle reports 3 hits for "Atech" — all are the substring in React's
`rateChange` DOM event name. Claude disclosed this exact false positive in its own limitations doc.
Its true count of hardware/privacy claims is **zero**.

### Medium — Argon's bare `npx vitest run` fails

Argon has no `vitest.config.ts`, so Vitest's default glob picks up `tests/browser-e2e.spec.ts` — a
hand-rolled Playwright script, not a Vitest suite. Result: `1 failed | 1 passed`, plus an unhandled
`process.exit(1)` rejection. The documented command (`npx vitest run tests/engineAndUi.test.tsx`)
passes 15/15, so this is a robustness/portability wart rather than a broken suite — but a reviewer
typing the obvious command gets a red run. `package.json` also defines **no** test scripts at all
(only `dev`/`build`/`preview`), unlike Claude's ten.

### Medium — Argon accepts fractional `receivedAt`; its own doc says integer

`grep -n isInteger src/engine/validator.ts` → **no matches**. Feeding `receivedAt: 1.5` is accepted
(`ok=true`) with only an out-of-order warning. Claude rejects it at `$.events[0].receivedAt`.
Determinism survives (events are still sorted), so this is a claim-accuracy defect, not a
correctness bug — but Argon's §3 row claims "integer/finite elapsed seconds".

### Low — cited evidence that isn't in the repository

- **Argon** §9 cites `GroundTruth_BlindSpot_Prototype_Deliverable.zip` and `dist/index.html`. The ZIP
  does not exist anywhere in the repo; `dist/` is excluded by the root `.gitignore`.
- **Claude** cites `test-results/artifacts/screenshot-reference-T12.png` and
  `screenshot-narrow-375.png`. Neither is on disk or in git (only 3 JSON artifacts are).

Both are "the evidence path doesn't resolve", not "the claim is false".

### Low — Argon's provenance statement is slightly wrong (in the safe direction)

`CHANGES_AND_PROVENANCE.md` lists `vite.config.ts` as "Reused Unchanged", but the baseline
`starting_point/vite.config.ts` contains `server: { host: "0.0.0.0", allowedHosts: true }` and
Argon's copy has that block **removed**. That is the right call — it satisfies §2's "no
outward-facing default server" — the provenance table just doesn't record the edit.

### Low — repository hygiene

- No CI, no root manifest, no root test runner: each project must be verified separately by hand.
- Directory name `implement-source-monitoring-prototype claude` **contains a space**, which breaks
  naive shell scripting and some tooling. Worth renaming to `…-claude`.
- Argon duplicated the four handoff `.md` files, `SHA256SUMS.txt` and `context/` (528 KB) into its
  own directory — I confirmed all five docs are **byte-identical** to the handoff copies.
- Single commit; no incremental history to audit.

## 5. What I could not verify

- **Browser E2E, for both teams.** No Playwright browser is installed here and
  `cdn.playwright.dev` is not reachable — I confirmed this rather than assumed it
  (`curl` → `000`, `SSL_ERROR_SYSCALL`), while `registry.npmjs.org` returns `200`. Argon's 36
  assertions and Claude's 15 are therefore **unreproduced**. Their logged outputs are internally
  consistent and detailed, but I did not execute them.
- **Accessibility, keyboard nav, narrow-viewport behaviour** — requires a real browser.
- **Anything on macOS.** Both teams say so themselves.
- **Physical hardware** — correctly declared out of scope by both.

## 6. Documentation quality: a stark contrast

Claude's `RESULTS_AND_LIMITATIONS.md` is unusually disciplined: it self-rates §2 and §8 as
**PARTIAL**, §7 as **NOT IMPLEMENTED**, enumerates spec latitude it took (flag-not-reject clock skew,
sort-not-reject out-of-order), discloses that its CSP comes from a post-build hook that
`npx vite build` would skip, and even pre-discloses the `rateChange` false positive I found
independently. I re-ran its unit suite: **109 passed, 0 skipped** once `dist/` exists — its claim
checks out exactly (my first run showed 107 + 2 skipped only because the build hadn't run yet).

Argon's is more confident than its evidence supports: eight of nine sections rated **PASS**, with the
§1 assertion above being the concrete counterexample.

## 7. Recommended actions, in priority order

1. **Argon:** delete or quarantine `src/data/reviewData.ts`, `src/data/ukraineResearchData.ts` and the
   four non-Ground-Truth showcase views from the shipped app, or gate them behind an explicit
   "archived mock, contains unsupported claims" screen. Then broaden the bundle check from four
   literals to the claim vocabulary (`Brier|Sybil|scrub|calibrat|independent group|Atech|OPSEC`).
2. **Argon:** correct the §1 row in `RESULTS_AND_LIMITATIONS.md` to match what the bundle contains.
3. **Argon:** add a `vitest.config.ts` excluding `tests/browser-e2e.spec.ts`, and add `test` /
   `test:e2e` scripts to `package.json`.
4. **Argon:** either enforce `Number.isInteger(receivedAt)` or soften the "integer" claim.
5. **Both:** commit the cited artifacts (screenshots / deliverable ZIP) or drop the references.
6. **Repo:** add CI running typecheck + build + unit tests for both projects; rename the
   space-containing directory; de-duplicate the handoff docs.

## 8. Overall

| | Argon | Claude |
|---|---|---|
| Engine correctness vs spec §4 | **Pass** (7/7, independently reproduced) | **Pass** (7/7, independently reproduced) |
| Validation / import-export (§6) | Pass (30/31 harness checks) | Pass (all, + 8 checked-in invalid fixtures) |
| Typecheck / build | Pass (539.38 kB) | Pass (311.06 kB, CSP-hardened) |
| Unit tests | 15 pass; bare `vitest run` fails | 109 pass, 0 skipped (reproduced) |
| Browser E2E | Claimed 36 — not reproducible here | Claimed 15 — not reproducible here |
| Spec §1 claim hygiene | **Fails** for the shipped bundle | Pass (zero forbidden claims) |
| Documentation honesty | Overstates | Accurate, self-critical |

**The core engineering is sound on both sides** — the deterministic replay semantics that this spec
exists to test are implemented correctly and identically by two independent agents. The differentiator
is not correctness but **discipline around claims**: Claude shipped a smaller, purpose-built,
CSP-hardened app with no legacy baggage and an honest limitations ledger; Argon shipped a more
featureful app (including the optional §7 adapter harness, which Claude skipped) but carried the old
showcase's unsupported claims into production and over-rated its own compliance.

If you want one implementation to move forward, **Claude's** is the lower-risk base. Argon's engine is
equally correct and its §7 adapter harness is a genuine asset — it mainly needs the legacy showcase
excised and its compliance matrix corrected.

---

# Addendum — remediation applied (2026-11-14)

The findings above were fixed by keeping the stronger implementation as the base, porting the one
genuinely additive feature from the other, and correcting both projects' records. Everything below
was executed and verified in this environment.

## Decision

Canonical base: **`implement-source-monitoring-prototype-claude/`** (renamed from
`implement-source-monitoring-prototype claude` to remove the embedded space). Ported in from Argon:
the optional §7 test-feed adapter.

## What was added

| Item | Where | Verification |
|---|---|---|
| §7 adapter state machine | `src/engine/adapter.ts` | 28 unit tests (`tests/unit/adapter.test.ts`) |
| §7 adapter panel | `src/ui/AdapterPanel.tsx` | 11 DOM component tests (`tests/unit/ui.test.tsx`) |
| Component test harness (this project had none) | `tests/unit/ui.test.tsx`, `vitest.config.ts` | renders the real `App`, drives the real panel |

The port kept Argon's guarantees (monotonic callback sequence, immediate loss of the fresh card on
failure, locally advancing age, recovery reporting) and tightened four things: non-integer callback
sequences are refused; the threshold falls back safely on `0`/negative/`NaN`; the "recovered after Ns"
note clears on the next healthy poll instead of persisting forever; opt-out discards the cache.
Argon's `Atech`-specific labels became device-neutral, since this codebase's bundle test forbids that
token and no board was attached.

## What was fixed

| Finding | Fix | Verified by |
|---|---|---|
| Argon's bare `npx vitest run` failed | added `vitest.config.ts` excluding the Playwright script; added `typecheck`/`test`/`test:e2e` scripts | `npx vitest run` → 15 passed (was 1 failed suite) |
| Argon's §1 row claimed no Brier/Sybil in the bundle | row corrected to **PARTIAL** with the measured counts and file paths; §2 Command 2 annotated as too narrow, with the broader grep shown | `RESULTS_AND_LIMITATIONS.md` diff |
| CSP only added by the `postbuild` hook | `cspMeta()` plugin in `vite.config.ts`; `harden-dist.mjs` is now a verifier that fails the build if directives are missing | `npx vite build --outDir /tmp/rawbuild` emits `default-src 'none'` |
| Dead modulepreload polyfill (the bundle's only `fetch(`) | `build.modulePreload.polyfill: false` | `grep -o 'fetch(' dist/index.html \| wc -l` → **0** (was 1) |
| Brittle test hard-coding minifier output `fetch(_.href,x)` | rewritten to assert the property, not the mangled name | surfaced by the rebuild, now passes across renames |
| Cited screenshots not in the repo | doc now says they are produced by the e2e run and are not committed | `RESULTS_AND_LIMITATIONS.md` |
| No CI, no single way to check everything | `.github/workflows/ci.yml` (typecheck/build/unit for both, e2e for canonical, plus a direct grep of the shipped bundle) and `scripts/check-all.sh` | `./scripts/check-all.sh` → 6 PASS, 1 SKIP, exit 0 |
| Directory name contained a space | `git mv` to `implement-source-monitoring-prototype-claude` | `npm ci` + full suite after the move |
| Dependencies installed with `^` against an exact-pin convention | reinstalled with `--save-exact` | no `^`/`~` remains; `npm ci` → 173 packages |

## Measured state after remediation

```
canonical   npm ci                 173 packages, exit 0
canonical   npm run typecheck      exit 0
canonical   npm run build          dist/index.html 321.06 kB, CSP verified
canonical   npx vitest run         149 passed, 0 failed, 0 skipped  (was 109)
superseded  npx tsc --noEmit       exit 0
superseded  npm run build          dist/index.html 539.38 kB
superseded  npx vitest run         15 passed                        (was failing)
```

The count moved 109 → 149 = +28 adapter, +11 component, +1 determinism case auto-added by
`heartbeat.test.ts`'s `it.each` over engine source files (it picks up `adapter.ts` automatically).

## Still open

- **Browser E2E was not re-run in this environment — but CI ran it.** No Playwright browser can be
  installed here (`cdn.playwright.dev` unreachable; `registry.npmjs.org` returns 200). The new CI
  workflow did install Chromium and run the suite on the merged build: job `canonical`, step 9
  "Browser tests" → **success** (run 43613213976). So the 15 e2e tests do pass against the adapter
  panel, the CSP plugin and the polyfill removal. The exact per-test count could not be read back,
  because the artifact host (`*.blob.core.windows.net`) is unreachable from this environment.
  No *new* browser test was added for the adapter — it is covered by the 28 unit and 11 component
  tests instead.
- **Argon's legacy showcase content was not deleted**, only labelled superseded and its claims
  corrected. Removing `reviewData.ts`, `ukraineResearchData.ts` and the four non-Ground-Truth views
  from that build would be the fix if it is ever revived; its bundle still reports `Brier` ×12.
- macOS, non-Chromium browsers and accessibility remain untested, as before.
