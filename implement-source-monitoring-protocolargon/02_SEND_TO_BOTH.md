# Send this exact message and ZIP to both Claude and Argon

> Please independently implement the project in the attached `GroundTruth_BlindSpot_Agent_Handoff.zip`, each working in a separate copy. Both agents receive the same starting point and complete task; don't depend on each other's work.
>
> Start with `00_START_HERE.md`, `01_IMPLEMENTATION_SPEC.md`, `03_BASELINE_INSPECTION.md`, then inspect `starting_point/src/App.tsx` and `starting_point/src/components/BenchmarkTacticalView.tsx`. Consult the independent reviews and earlier illustrative UI snippets under `context/`. Confirm that you can access the files before proceeding.
>
> Build the local-first **source monitoring and uncertainty-review prototype** from the spec on top of the supplied source. It must replay actual timestamped synthetic/imported events, correctly derive source heartbeat and observation timing, show missing/stale and recovery states, display declared overlapping or unknown dependencies, expose limited comparable report disagreement, and export/import a reproducible record. Implement the exact reference fixture and tests. It should be useful without any physical hardware.
>
> Replace or exclude the old misleading scripted panel in the new workflow and bundle; do not simply add a warning. Don't equate a new heartbeat with correct sensor operation or silence with a clear scene; don't claim sources are independent merely because they have different IDs. Do not claim real detection, hardware connection, privacy protection, certification or field validation. All example information is synthetic. No recording, cloud service, Nexus connection, robot or device is required. Any hardware adapter is optional, separate and must be honestly labelled tested or untested.
>
> Return one ZIP containing full runnable source, pinned dependencies, fixture, portable automated tests with actual observed results, Mac setup and a five-minute local demo. Include `RESULTS_AND_LIMITATIONS.md` with PASS / PARTIAL / NOT IMPLEMENTED for the numbered spec sections, and `CHANGES_AND_PROVENANCE.md`. State clearly what you could not implement or test.
