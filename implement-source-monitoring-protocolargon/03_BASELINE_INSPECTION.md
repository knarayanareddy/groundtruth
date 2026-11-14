# Ground Truth + BlindSpot baseline inspection

## Starting source and relevant prior work

`starting_point/` is a clean copy of the previously reviewed `ideasstudiosim2/` working project. The original unmodified archive and the delivered standalone showcase are preserved under `context/`. `src/App.tsx` uses the same `BenchmarkTacticalView.tsx` component for both the Fiber-Watch and Ground Truth cards. Neither is a dedicated event-monitoring implementation.

`BenchmarkTacticalView.tsx` contains hard-coded source records, fixed statuses, age values, confidence and Brier figures. The simulated Atech switch changes those records and restores them when clicked again; it opens no device port. A canned duplicate-report toggle adds pre-quarantined invented entries. Computed source weights are not used in the two dissent conditions. Counting different one-label groups does not prove independence. No supplied real sensor, independent calibration, Atech, Raspberry Pi, detector, source authentication, Nexus connection, actual database or report export is implemented. The view's inner text still contains unsupported identification, operational action, trust, hardware and privacy claims. An outer banner is inadequate for a new product: replace/remove the legacy panel from the shipped workflow and runtime bundle.

The regex-based scrubber misses sensitive formats and its location replacement is not a real privacy transformation. Do not reuse it as an anonymity or safety feature. No `benchmark` modules are actually imported; the repository is not supplied. See `context/Idea_Studio_2_End_to_End_Review.md` for full detail.

`context/legacy_examples/BlindSpot.tsx`, `SignalCheck.tsx` and `SensorBridge.tsx` are extracted illustrative React components from the older `hackreview` work, provided only as design references. Their common `../ui` dependencies are not included and they are not standalone apps. Their status transitions and observations are simulated; some UI labels imply too much, including that ungrouped reports are independent or that a live status proves readings are real. Do not inherit these claims. Use ideas such as a status timeline and transparent unknown state, not the unsupported conclusions.

`context/IdeaHackReviews_Independent_Review.md` also describes a different Next.js Continuity Desk. It is **not included as the implementation baseline**. Important independently reproduced design risks: cached fresh cards remained visible after API failure, and a recent arrival of an old observation could display as fresh. A long-gap recovery and sequence handling also had edge cases. Avoid those failure modes; if implementing only local deterministic replay, do not pretend those network scenarios were tested. No local physical device or real database was exercised.

## Fresh-copy checks for this package

Linux x86_64 sandbox, Node v20.20.2, npm 10.8.2:

```text
npm ci --no-audit --no-fund  PASS (96 packages)
npm run build                PASS (single-file Vite output)
npx tsc --noEmit             PASS
```

A limited headless Chromium/Playwright smoke check opened the fresh `dist/index.html` via `file://`, navigated to Ground Truth, and toggled the **simulated** Atech control off and back on. No page errors or HTTP(S) requests were observed in that flow. The harness used a pre-existing sandbox Playwright installation and is not included as a portable test; the agents must create their own. This does not test a device, real heartbeat, robust clock, saved data, source independence, network security, field behavior or the user's Mac.

Fresh build SHA-256: `c35ae335cc624c815b17dfcd005d5664c955fe6da0b51c68ee9090f652171977`. It is not byte-identical to the earlier showcase because the source copy excludes local test scripts and generated assets that can influence Tailwind content scanning. Earlier showcase SHA-256: `3891a9219036ed30b6f63134061933c4c66f5df8570535880d6cbd03357522ca`. Original incoming ZIP SHA-256: `eed8132952f41fe5aced326966698a4f433f0e053b7ab07115112f832eed2d1a`.

The user owns Atech Frame 10 and Frame 2.1 boards, but firmware, protocol compatibility and attached modules are unverified. Atech's published docs describe USB serial / JSON for supported devices, but an agent must not claim that these specific boards work without connecting and testing them. Hardware is optional for this assignment.
