# Idea Studio 2 — end-to-end review and handoff

## Scope and bottom line

Reviewed `ideasstudiosim2.zip` from Google Drive, checked its archive integrity, inspected the application source and its seven original sections, built it, and exercised the new presentation flows in Chromium. This is a prototype/code review, not a comprehensive independent verification of every embedded historical, operational or market claim. The original archive remains unchanged at `google_drive/ideasstudiosim2.zip`; the separate working project is `ideasstudiosim2/`.

**Bottom line:** The package is useful as an interactive ideation and team-discussion tool. It is not a validated operational system. Several features and evidence claims are substantially ahead of their implementation. The most promising general-purpose independent concept is the simulation-to-field testing/evidence workflow behind Phalanx, scoped first to repeatable fault tests and traceable results; TrustLine/BlindSpot is a strong challenge-specific workflow, conditional on actual Nexus and hardware access. These are judgments, not independently measured market demand or judge preferences.

## New presentation

The new showcase provides an interactive problem slide, a solution/how-it-works slide with selectable steps, then the related original preview for six entries:

1. **TrustLine + Aegis-Lite:** illustrative video-click uncertainty and human review; no live Nexus connection.
2. **Fiber-Watch & Sting-Cue:** a proposed disagreement-review concept; links to the related Ground Truth mock, **not** a dedicated working detector or interceptor interface.
3. **CableGuard Causal:** synthetic time-scrubbed maritime behavioral review and rough inspection routing.
4. **ClearHot Stream-14:** canvas-based thermal processing demonstration, with local raw-frame upload.
5. **Phalanx Red-Team Lab:** deterministic toy simulation, formula-based heatmap and illustrative summary.
6. **Ground Truth + BlindSpot:** scripted source disagreements and simulated sensor disconnection.

The original package-review and research-explorer sections remain accessible. Original content can still contain optimistic assertions and unverified claims; the visible warnings explicitly take precedence. Research links are starting points, not proof of every statement attached to them. Wide original panels scroll within their preview on small screens.

## Key findings and changes

### 1. Critical — maritime incident and validation claims are fabricated or unsupported

`src/components/MantaviaCableGuardView.tsx` creates all vessel positions programmatically. Its Samus Swan-inspired track, baseline, gap, heading difference, incident timeline and selected dates are generated fixtures, not loaded historical AIS. The seven-day table is hard-coded; September date selection also generates synthetic data. There is no AIS/Parquet upload in this app. A number such as “43 minutes early” does not demonstrate a real alert. The first anomaly and first threshold-qualified cue are also different concepts. A comparator intentionally scans the whole trajectory and sets an illustrative future score; it must not be mistaken for a causal output or real bug reproduction. The main scoring uses the prefix but still relies on a supplied fixed vessel baseline, not a measured six-hour rolling baseline.

Other limitations: duration increments by three minutes regardless of the input sample spacing; the route uses a fixed heading of 228° for every vessel and simplistic speed/endurance assumptions; the lower-speed comparator count is multiplied by four rather than measured alerts. Fixed cable geometry is illustrative and not established as an authoritative GIS dataset. AIS cannot, by itself, establish anchor state, damage, or intent. Surrounding-week alerts cannot be called false positives without labels.

**Changes:** Added prominent per-idea caveats; relabelled the date selector and incident fixture; softened the top description and the first-anomaly metric; removed a fabricated default lead-time fallback; corrected heading difference wraparound; described the route as an approximation. The deliberately future-looking comparison and hard-coded weekly table remain visible as synthetic illustrations, not validation.

**Next:** obtain actual historical AIS and cable geometries; freeze configuration; test strict prefix-only feature construction, baseline computation and first *qualifying cue*; replay the incident, quantify surrounding-week alert burden and perform the requested blind-date evaluation. Do not claim real lead time or error rates before the data and labels support them. The Danish court dates the Samus Swan event to 26 February 2022, while the earlier challenge brief says 28 February; exact incident time/timezone remains unresolved.

### 2. Critical — the purported swarm evidence and confidence bounds are not real

`PhalanxSwarmView.tsx` computes its 7×7 heatmap with a hand-authored formula. The alleged Wilson upper bound is simply the formula output plus five; no trials, sample count, binary search or Wilson confidence interval exists. The model assigns near-deterministic invented observations based on synthetic truth classes, so apparent classification performance does not establish generalization. The previous summary modal included fabricated hardware validation, operational detection rates, a build hash and a certification claim. There is no HIL, field-data ingestion, signed report or real evidence export.

**Changes:** Replaced the modal with a clearly marked illustrative summary, corrected the most prominent misleading confidence/safety labels, and made displayed neutralization/waste counters respect the current simulated step. The visualization remains a toy and some original narrative remains aspirational. It cannot be used to justify safety, deployment or engagement decisions.

**Next:** log actual repeatable scenarios, random seeds, parameters and outcomes; compute real uncertainty intervals from independently sampled trials when appropriate; separate sensor-observation generation, decision logic and truth; validate sim-to-field assumptions using controlled, non-operational hardware experiments.

### 3. High — TrustLine is a simplified mathematical mock, not independent geolocation validation

`NexusTrustLineView.tsx` uses a flat-ground range formula and parameterized terrain-relief uncertainty; there is no actual DEM ray intersection, camera calibration, real telemetry or live video. The 240 deterministic perturbations reuse model assumptions and are not independent real-world validation. The displayed equal-area radius is not a demonstrated CEP95. No live Nexus integration or API call exists; the previous confirmation text incorrectly said a task was published. Thresholds and staleness inflation are illustrative. Actual coordination, accuracy and authorization are untested.

**Changes:** Replaced the publication claim with a local simulated-handoff message, relabelled key geometry/coverage descriptions and removed the most direct “strike quality” status label. Warnings accompany the original interface. Do not use the computed coordinates or confidence envelope for operational decisions.

**Next:** establish exact coordinate frames, camera model, sensor timestamps, terrain data and calibration; independently test against ground truth including horizon/missed-ray cases; integrate only against verified Nexus documentation and obtain operator review.

### 4. High — privacy, authenticity, source independence and hardware claims are overconfident

`BenchmarkTacticalView.tsx` contains scripted sources, invented Brier scores and predetermined Sybil examples. Its computed weights are not used in the dissent checks. Counting different common-cause group labels does not prove independence; sources can share overlapping dependencies. The simulated Atech toggle never opens a serial port. The RF sniffer and acoustic signatures are invented and not evidence that the user owns those modules.

The regex scrubber does not reliably remove names, location descriptions, non-matching phone numbers, metadata or all coordinate formats. Its replacement for matching coordinates inserts fixed decimal fragments, not a real geospatial grid. Privacy tiers do not authenticate a user or provide anonymity. **Never enter real personal, confidential, location-sensitive or operational data in it.**

**Changes:** Added explicit warnings; relabelled the cable toggle as simulated; fixed reconnect so the original synthetic observation is restored instead of remaining `SILENT_NODE`; replaced privacy-tier guarantees with demo-only warnings. The benchmark GitHub repository and its listed modules exist, but the demo does not import them; the accuracy or suitability of all its functions for defense use was not verified in this review.

**Next:** test actual Atech Frame 10 / Frame 2.1 compatibility and firmware with a USB data cable, and confirm available modules. Use threat modeling and specialist privacy review rather than regex-only anonymization. Validate dependencies individually and use labeled outcomes before making calibration claims.

### 5. High — thermal preview is not a full-resolution FPGA benchmark

`ThermalClearHotView.tsx` draws a 320×256 sample of the 640×512 input, using an 85 ms playback interval, not proven 25 fps at full resolution. The flicker value is selected as 0.3 or 14.8 by toggle rather than measured from frames; resource numbers are hand-estimated and do not follow FPGA synthesis. The feature labelled dual-plateau changes a quantile selection; it is not a demonstrated full dual-plateau local contrast implementation. Column corrections use sampled means rather than a true column median; changing stage toggles cannot by itself prove artifact suppression. The original loader used native-endian `Uint16Array`, accepted truncated/malformed inputs as one frame, and read entire files into memory. Before correction, stage-one borders remained zero.

**Changes:** Added whole-frame size validation and a 200 MiB limit, explicit little-endian decoding, a visible error for invalid files, reset of frame history on upload, preservation of border values, and clearer preview timing wording. A generated one-frame file and a deliberately invalid file were exercised; the actual 180,224,000-byte challenge file was not downloaded or tested. The loader still uses memory proportional to the input and is not a streaming implementation.

**Next:** test exact challenge format and all frames, quantify flicker/ghosting/detail against reference sequences, test browser and native 640×512 throughput, specify complete buffer/bit-width architecture and perform actual target FPGA synthesis.

### 6. Medium — package review exaggerates what has been fixed

`AuditAndMergerView.tsx` maintains triage data only in React memory. Its pending-patch timer produces a notification but has no persistent backend; edits are lost on leaving/reload. The 28→5 rankings and weights are subjective. Several displayed “fixed” code snippets are conceptual and do not match the actual implementation; security and persistence problems in the earlier projects were not fixed merely by creating this new preview. The primary research explorer also asserts specific costs, counts, capabilities and operational results that were not independently checked here.

**Changes:** Adjusted the edit notification to say changes are in memory, removed the global “five bugs verified & fixed” claim by replacing the old header, and placed scope/verification warnings ahead of both original research views. The underlying older project source has not been modified.

## What was actually tested

- ZIP integrity and paths: 22 entries, no detected `..` or absolute-path entries; extracted into its own folder.
- `npm ci`, Vite production build and `npx tsc --noEmit`: passed after changes.
- Chromium: six problem → solution → corresponding preview flows; selectable process steps; original audit and research views; maritime play/pause; thermal invalid and one-frame valid uploads; Phalanx summary modal; simulated Atech disconnect/reconnect. No page errors observed during this smoke test.
- Mobile at 390 px: no page-level horizontal overflow in the six tested flows; some original panels use horizontal scrolling internally.
- Standalone single-file HTML: opened via `file://` with external HTTPS blocked; introductory navigation to preview worked. External research links naturally require internet. This was a smoke test, not exhaustive cross-browser or accessibility testing.
- No actual Nexus service, historical AIS data, complete thermal challenge file, FPGA, physical Atech device, drone, or robot was connected/tested. No security penetration test or deployment audit was performed.

## Sources checked for this review

- Danish Maritime and Commercial Court, Samus Swan date and liability summary: https://www.domstol.dk/soeoghandelsretten/aktuelt/2025/7/begraensningsfond-opretholdes/
- Atech documentation, current USB JSON protocol and browser requirements: https://atech.dev/docs — verify compatibility with the actual board revisions and firmware.
- Ground Truth Circle repository listing: https://github.com/knarayanareddy/benchmark — existence of modules is not proof that this mock integrates them or that their claims transfer to other contexts.
- Earlier detailed plan and incident/source caveats: `Mantavia_Evidence_Pack_and_Evaluation_Plan.md`; overall research handoff: `Hackathon_Complete_Research_Hardware_and_Project_Brief.md`.

## Files

- `Idea_Studio_2_Teammate_Showcase.html` — single-file offline-friendly showcase; open in a modern browser.
- `ideasstudiosim2/` — modified source and `smoke-test.cjs`.
- `google_drive/ideasstudiosim2.zip` — untouched original archive.
