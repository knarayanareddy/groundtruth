# Ground Truth + BlindSpot — identical independent implementation assignment

## Read in order
1. This file.
2. `01_IMPLEMENTATION_SPEC.md` — binding scope, exact reference fixture, semantics, tests and deliverables.
3. `02_SEND_TO_BOTH.md` — copyable message for both agents.
4. `03_BASELINE_INSPECTION.md` — inspected behavior, risks and actual baseline checks.
5. `starting_point/src/App.tsx`, `starting_point/src/components/BenchmarkTacticalView.tsx`, source data and project configuration.
6. `context/Idea_Studio_2_End_to_End_Review.md` and relevant Continuity Desk findings in `context/IdeaHackReviews_Independent_Review.md`; `context/legacy_examples/` contains earlier isolated UI examples, not a standalone runnable project.

## The shared task

Each agent independently builds the **same** runnable local-first dashboard for reviewing source availability, heartbeat freshness, observation age, declared shared dependencies and limited comparable-source disagreement. Start with **software simulation and local imported logs**: no physical hardware is required. Demonstrate a source missing its updates, becoming stale/unknown and later recovering, using actual timestamped input events and the implementation's state machine—not a toggle that simply changes canned text. Show human-readable uncertainty, a timeline, multiple sources and a locally exportable/replayable record. A current heartbeat is not proof that a sensor is correct or that an area is safe.

This project focuses on **the observation system's sources and dependencies**. Fiber-Watch's separate task focuses on reviewing an event; Phalanx tests robot behavior. A small structured discrepancy cue is in scope, but no live detection, classified-target identification, autonomous action, legal conclusion, Nexus integration or robot control is needed.

## Existing code is a mock, not the product

`App.tsx` mounts the same `BenchmarkTacticalView` for Fiber-Watch and Ground Truth. Its source statuses, ages, confidence figures, source reports and Atech unplug are scripted; no actual device, monitoring backend or imported data is connected. Its legacy inner panel claims detection, calibration, independent source groups and privacy that are not established. Exclude or rewrite it in the final main app and bundle; an outer disclaimer alone is not enough. The separate older examples demonstrate UI ideas but include simulated feeds and assumptions. None is proof of a functioning sensor system. No benchmark-repository modules are supplied or integrated.

## Setup starting point

On a Mac after extracting the ZIP, use Node.js 20.19+ within the 20.x series or Node.js 22.12+, and npm (Vite 7 does not support Node 21):

```sh
cd GroundTruth_BlindSpot_Agent_Handoff/starting_point
npm ci
npm run build
npx tsc --noEmit
npm run dev -- --host 127.0.0.1
```

The first install may need internet; the existing single-file `dist/index.html` works locally after build. Follow the delivered implementation's own instructions for its offline demo. Each agent works in an independent copy. No actual Atech/Pi, sensor recordings or personal information is included.

## Deliver

A ZIP from each agent with full source, lockfile, local runnable app, synthetic fixtures, portable tests and actual results, Mac instructions, five-minute demo, results/limitations and provenance. No shared role split. Clearly state any partial or untested requirements.
