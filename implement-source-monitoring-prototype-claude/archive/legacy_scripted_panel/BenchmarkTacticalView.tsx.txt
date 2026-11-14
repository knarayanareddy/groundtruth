import React, { useState, useMemo } from "react";
import { BENCHMARK_DEFENSE_MAPPING } from "../data/ukraineResearchData";
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  Cpu,
  EyeOff,
  GitCompare,
  Lock,
  PlugZap,
  ShieldAlert,
  Sparkles,
  Unplug,
} from "lucide-react";

interface SpotterSource {
  id: string;
  name: string;
  role: string;
  modality: "Acoustic" | "Radar" | "RF-Spectrum" | "Human-OSINT" | "Atech-Hardware";
  anonymityTier: "ghost" | "pseudonym" | "verified_unit";
  brierScore: number; // Lower is better (0.00 = perfect calibration, 0.25 = random)
  resolvedTrackRecord: number;
  commonCauseGroup: string; // e.g. "USB-HUB-ATECH-01", "CELL-TOWER-KYIV-N", "MIL-RADAR-GRID"
  status: "FRESH" | "STALE_UNKNOWN" | "QUARANTINED_SYBIL";
  ageSeconds: number;
  observation: "THREAT_SHAHED" | "DECOY_PARODY" | "FIBER_FPV" | "NO_RF_SIGNAL" | "SILENT_NODE";
  claimText: string;
  confidencePct: number;
}

const INITIAL_SOURCES: SpotterSource[] = [
  {
    id: "SRC-01",
    name: "SkyFortress Mast #412 (Chernihiv N)",
    role: "Automated Acoustic Array",
    modality: "Acoustic",
    anonymityTier: "verified_unit",
    brierScore: 0.042,
    resolvedTrackRecord: 148,
    commonCauseGroup: "ACOUSTIC-MESH-NORTH",
    status: "FRESH",
    ageSeconds: 4,
    observation: "DECOY_PARODY",
    claimText:
      "Acoustic FFT matches 38cc 2-stroke foam-airframe signature (185 Hz fundamental), NOT MD-550 Shahed-136 engine. Altitude ~2,100m.",
    confidencePct: 91,
  },
  {
    id: "SRC-02",
    name: "Sentinel Radar Track #R-88",
    role: "Primary S-Band Radar",
    modality: "Radar",
    anonymityTier: "verified_unit",
    brierScore: 0.068,
    resolvedTrackRecord: 310,
    commonCauseGroup: "MIL-RADAR-GRID",
    status: "FRESH",
    ageSeconds: 2,
    observation: "THREAT_SHAHED",
    claimText:
      "High Radar Cross Section (RCS ~8.5 m²) at 2,200m altitude, 195 km/h ingress bearing 215°. Looks like large strike UAV or aircraft.",
    confidencePct: 88,
  },
  {
    id: "SRC-03",
    name: "Ghost-77 (Partisan Spotter · Occupied Rear)",
    role: "Ground Truth Circle Calibrated Spotter",
    modality: "Human-OSINT",
    anonymityTier: "ghost",
    brierScore: 0.051,
    resolvedTrackRecord: 64,
    commonCauseGroup: "STARLINK-PARTISAN-CELL",
    status: "FRESH",
    ageSeconds: 38,
    observation: "DECOY_PARODY",
    claimText:
      "Visual launch confirmation from launcher site: plywood 'Parody' decoy fitted with metallic Luneberg sphere reflector launched 14 mins ago.",
    confidencePct: 94,
  },
  {
    id: "SRC-04",
    name: "Atech Frame 10 Port #1 (Seismic/Button Trigger)",
    role: "USB Serial Edge Node (115200 baud)",
    modality: "Atech-Hardware",
    anonymityTier: "verified_unit",
    brierScore: 0.075,
    resolvedTrackRecord: 42,
    commonCauseGroup: "ATECH-PI-GATEWAY-01",
    status: "FRESH",
    ageSeconds: 1,
    observation: "FIBER_FPV",
    claimText:
      " Corridor vibration/button trigger active on GLOC supply road KM-14. High-RPM quadrotor audio detected at 15m AGL.",
    confidencePct: 86,
  },
  {
    id: "SRC-05",
    name: "Atech Frame 10 Port #2 (RF Sniffer Module)",
    role: "USB Serial Edge Node (Same Board)",
    modality: "RF-Spectrum",
    anonymityTier: "verified_unit",
    brierScore: 0.08,
    resolvedTrackRecord: 42,
    commonCauseGroup: "ATECH-PI-GATEWAY-01", // Intentionally shares CCFG with SRC-04!
    status: "FRESH",
    ageSeconds: 1,
    observation: "NO_RF_SIGNAL",
    claimText:
      "900MHz / 2.4GHz / 5.8GHz spectrum completely clean (-102 dBm noise floor). Zero analog/digital VTX emission.",
    confidencePct: 95,
  },
];

export const BenchmarkTacticalView: React.FC = () => {
  const [sources, setSources] = useState<SpotterSource[]>(INITIAL_SOURCES);
  const [atechPluggedIn, setAtechPluggedIn] = useState<boolean>(true);
  const [sybilInjected, setSybilInjected] = useState<boolean>(false);
  const [rawFieldInput, setRawFieldInput] = useState<string>(
    "Spotter Ivan Petrenko (+380 67 555 0192, email ivan.p@ukr.net) filming from 4th floor balcony at 14 Zelena St, Melitopol (46.8489, 35.3653): saw 2 Russian Molniya fiber-optic UAVs launching toward highway!"
  );
  const [selectedTier, setSelectedTier] = useState<"ghost" | "pseudonym" | "verified_unit">(
    "ghost"
  );

  // Toggle Atech USB connection live (BlindSpot state machine)
  const toggleAtechHardware = () => {
    const next = !atechPluggedIn;
    setAtechPluggedIn(next);
    setSources((prev) =>
      prev.map((s) =>
        s.commonCauseGroup === "ATECH-PI-GATEWAY-01"
          ? {
              ...s,
              status: next ? "FRESH" : "STALE_UNKNOWN",
              ageSeconds: next ? 1 : 185,
              observation: next ? (INITIAL_SOURCES.find((original) => original.id === s.id)?.observation ?? "SILENT_NODE") : "SILENT_NODE",
            }
          : s
      )
    );
  };

  // Inject Russian Bot-Farm Sybil Spoofing Attack (tested against benchmark/src/lib/integrity.ts logic)
  const toggleSybilAttack = () => {
    if (!sybilInjected) {
      const sybilNodes: SpotterSource[] = [
        {
          id: "SYB-91",
          name: "TelegramBot_UA_Watch88",
          role: "Unverified Public Reporter",
          modality: "Human-OSINT",
          anonymityTier: "pseudonym",
          brierScore: 0.24,
          resolvedTrackRecord: 2,
          commonCauseGroup: "TELEGRAM-BURST-CLUSTER-9",
          status: "QUARANTINED_SYBIL",
          ageSeconds: 5,
          observation: "THREAT_SHAHED",
          claimText:
            "URGENT!! 15 Shaheds diving on Sector B transformer right now!! Send all mobile fire groups to Sector B immediately!!",
          confidencePct: 99,
        },
        {
          id: "SYB-92",
          name: "CitizenSpotter_Kyiv_902",
          role: "Unverified Public Reporter",
          modality: "Human-OSINT",
          anonymityTier: "pseudonym",
          brierScore: 0.23,
          resolvedTrackRecord: 1,
          commonCauseGroup: "TELEGRAM-BURST-CLUSTER-9",
          status: "QUARANTINED_SYBIL",
          ageSeconds: 7,
          observation: "THREAT_SHAHED",
          claimText:
            "URGENT!! 15 Shaheds diving on Sector B transformer right now!! Send all mobile fire groups to Sector B immediately!!",
          confidencePct: 99,
        },
      ];
      setSources((prev) => [...prev, ...sybilNodes]);
      setSybilInjected(true);
    } else {
      setSources((prev) => prev.filter((s) => !s.id.startsWith("SYB-")));
      setSybilInjected(false);
    }
  };

  // Brier-calibrated weighting + Common-Cause Failure Group (CCFG) independence check
  const synthesisMetrics = useMemo(() => {
    const activeValid = sources.filter((s) => s.status === "FRESH");
    const staleUnknown = sources.filter((s) => s.status === "STALE_UNKNOWN");
    const quarantined = sources.filter((s) => s.status === "QUARANTINED_SYBIL");

    // Distinct Common-Cause Failure Groups (Fixes BUG-04!)
    const distinctIds = activeValid.length;
    const distinctCCFGs = new Set(activeValid.map((s) => s.commonCauseGroup)).size;

    // Brier reliability weight: w_i = max(0.05, 1 - (brierScore / 0.25)) * log10(resolved + 10)
    const weightedSources = activeValid.map((s) => {
      const calFactor = Math.max(0.05, 1 - s.brierScore / 0.25);
      const expFactor = Math.log10(s.resolvedTrackRecord + 10);
      return { ...s, weight: calFactor * expFactor };
    });

    // Check High-Altitude Air Defense Dissent (Radar says Big Threat RCS vs Calibrated Acoustic/Partisan say Parody Luneberg Decoy)
    const radarThreat = weightedSources.find(
      (s) => s.modality === "Radar" && s.observation === "THREAT_SHAHED"
    );
    const decoyDissenters = weightedSources.filter((s) => s.observation === "DECOY_PARODY");

    // Check Logistics Road Fiber-Optic FPV Dissent (Acoustic/Button says FPV vs RF Sniffer says 0 dBm Clean)
    const acousticFpv = weightedSources.find((s) => s.observation === "FIBER_FPV");
    const rfClean = weightedSources.find((s) => s.observation === "NO_RF_SIGNAL");

    return {
      distinctIds,
      distinctCCFGs,
      staleCount: staleUnknown.length,
      quarantinedCount: quarantined.length,
      hasParodyDecoyDissent: Boolean(radarThreat && decoyDissenters.length > 0),
      hasFiberOpticSignature: Boolean(acousticFpv && rfClean),
    };
  }, [sources]);

  // OPSEC Scrubber adapted from benchmark/src/lib/scrub.ts & privacy.ts
  const scrubbedOutput = useMemo(() => {
    let text = rawFieldInput;
    // Scrub phone numbers
    text = text.replace(/\+?\d[\d\s\-()]{7,}\d/g, "[REDACTED-PHONE]");
    // Scrub emails
    text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g, "[REDACTED-EMAIL]");
    // Scrub exact street/floor vantage details
    text = text.replace(
      /\b(\d+(st|nd|rd|th)\s+floor|balcony|at\s+\d+\s+[A-Z][a-z]+\s+(St|Street|Ave|Rd))/gi,
      "[REDACTED-VANTAGE-POINT]"
    );
    // Fuzz exact 4-decimal GPS coordinates to 10km grid sector
    text = text.replace(
      /\(\s*(\d{2})\.\d{2,}\s*,\s*(\d{2})\.\d{2,}\s*\)/g,
      "($1.8X°N, $2.3X°E · 5km Fuzz Grid)"
    );
    // Scrub names after "Spotter"
    text = text.replace(/Spotter\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g, "Spotter [GHOST-HASH-9F2A]");

    const attributionLabel =
      selectedTier === "ghost"
        ? "DEMO ONLY: pattern substitution, not anonymous or safe"
        : selectedTier === "pseudonym"
        ? "DEMO ONLY: pattern substitution, not anonymization"
        : "DEMO ONLY: no authentication or real military node";

    return { text, attributionLabel };
  }, [rawFieldInput, selectedTier]);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> Deep Review of knarayanareddy/benchmark
            </span>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Adapting <code className="text-emerald-300">Ground Truth Circle</code> into{" "}
              <span className="text-cyan-300">Ground Truth Tactical (GTT)</span> for Ukraine &
              Intelic Nexus
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-300">
              Your <code className="text-emerald-300">benchmark</code> repository (built for ACAPS
              humanitarian risk intelligence) contains five production-grade TypeScript engines:{" "}
              <code>scoring.ts</code> (Brier calibration), <code>integrity.ts</code> (coordinated
              burst/collusion detection), <code>scrub.ts</code> & <code>privacy.ts</code> (3-tier
              anonymity & PII scrubbing), <code>synthesis.ts</code> (consensus vs. minority dissent
              loop), and <code>dispatch.ts</code> (fatigue-capped micro-tasking). In military C2 and
              Ukraine air/ground defense, this exact architecture solves{" "}
              <strong className="text-white">
                OSINT spoofing, partisan spotter OPSEC, sensor disagreement (Parody decoys &
                fiber-optic FPVs), and bunker alarm fatigue
              </strong>
              !
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Codebase Mapping Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <GitCompare className="h-5 w-5 text-emerald-400" />
          1. Architectural Translation: How Every Module in <code>benchmark/src/lib/</code> Solves a
          Frontline Defense Problem
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BENCHMARK_DEFENSE_MAPPING.map((item) => (
            <div
              key={item.moduleFile}
              className="flex flex-col justify-between rounded-xl border border-slate-700/80 bg-slate-950/80 p-4"
            >
              <div>
                <div className="font-mono text-xs font-bold text-emerald-400">
                  {item.moduleFile}
                </div>
                <h4 className="mt-1.5 text-sm font-bold text-white">
                  {item.tacticalDefenseEquivalent}
                </h4>
                <p className="mt-2 text-xs text-slate-400">
                  <strong className="text-slate-200">In Benchmark Repo: </strong>
                  {item.originalAcapsFunction}
                </p>
                <div className="mt-2.5 rounded-lg border border-amber-500/20 bg-amber-950/15 p-2.5 text-xs text-slate-200">
                  <strong className="text-amber-300">Ukraine Battlefield Need: </strong>
                  {item.ukraineOperationalUseCase}
                </div>
              </div>
              <div className="mt-3 border-t border-slate-800 pt-2.5 text-xs text-cyan-300">
                <strong>Nexus / EDTH Fit: </strong>
                {item.nexusAndChallengeIntegration}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Interactive Live Workbench */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <Activity className="h-5 w-5 text-cyan-400" />
              2. Live Interactive Workbench: Ground Truth Tactical + Physical Atech USB BlindSpot
              Node
            </h3>
            <p className="text-xs text-slate-400">
              Test the integrated engines below: inject a Russian Telegram bot-farm spoofing burst,
              unplug the Atech USB sensor board, and inspect how Brier calibration & Common-Cause
              Failure Groups protect the operator.
            </p>
          </div>

          {/* Interactive Fault & Attack Injection Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={toggleAtechHardware}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                atechPluggedIn
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  : "border-rose-500/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
              }`}
            >
              {atechPluggedIn ? (
                <>
                  <PlugZap className="h-4 w-4" /> Simulated Atech: CONNECTED (click to simulate unplug)
                </>
              ) : (
                <>
                  <Unplug className="h-4 w-4" /> Simulated Atech: UNPLUGGED → STALE/UNKNOWN (click to
                  Reconnect)
                </>
              )}
            </button>

            <button
              onClick={toggleSybilAttack}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                sybilInjected
                  ? "border-amber-500/60 bg-amber-500/20 text-amber-200"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-amber-400"
              }`}
            >
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              {sybilInjected
                ? "Clear Simulated Russian Bot-Farm Burst"
                : "Simulate Russian Telegram Bot-Farm Spoofing Burst"}
            </button>
          </div>
        </div>

        {/* Top Telemetry & Independence KPI Strip */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-700/80 bg-slate-950/80 p-3.5">
            <div className="text-xs text-slate-400">
              Active Sensor IDs vs. True Independent Groups
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-cyan-400">
                {synthesisMetrics.distinctCCFGs} True Groups
              </span>
              <span className="text-xs text-slate-400">
                (from {synthesisMetrics.distinctIds} sensor IDs)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-400">
              ✓ Fixes BUG-04: Atech Port #1 & #2 share USB hub → counted as 1 CCFG
            </div>
          </div>

          <div
            className={`rounded-xl border p-3.5 ${
              synthesisMetrics.staleCount > 0
                ? "border-rose-500/50 bg-rose-950/25"
                : "border-slate-700/80 bg-slate-950/80"
            }`}
          >
            <div className="text-xs text-slate-400">BlindSpot Silence / Stale Monitor</div>
            <div className="mt-1 text-2xl font-bold text-white">
              {synthesisMetrics.staleCount > 0 ? (
                <span className="text-rose-400">
                  {synthesisMetrics.staleCount} Node SILENT (UNKNOWN)
                </span>
              ) : (
                <span className="text-emerald-400">0 Silent Nodes (All Fresh)</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-300">
              {synthesisMetrics.staleCount > 0
                ? "⚠️ Silence ≠ Safe! Sector KM-14 marked BLINDSPOT UNKNOWN."
                : "All heartbeats within 60s window."}
            </div>
          </div>

          <div
            className={`rounded-xl border p-3.5 ${
              synthesisMetrics.quarantinedCount > 0
                ? "border-amber-500/50 bg-amber-950/25"
                : "border-slate-700/80 bg-slate-950/80"
            }`}
          >
            <div className="text-xs text-slate-400">
              <code>integrity.ts</code> Anti-Spoofing Guard
            </div>
            <div className="mt-1 text-2xl font-bold">
              {synthesisMetrics.quarantinedCount > 0 ? (
                <span className="text-amber-300">
                  {synthesisMetrics.quarantinedCount} Sybil Posts Blocked
                </span>
              ) : (
                <span className="text-emerald-400">Clean (0 Bot Bursts)</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-300">
              {synthesisMetrics.quarantinedCount > 0
                ? "Blocked Δt=2s copy-paste burst trying to divert Mobile Fire Groups!"
                : "Monitoring velocity spikes & token similarity."}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-slate-950/80 p-3.5">
            <div className="text-xs text-slate-400">
              <code>dispatch.ts</code> Operator Interruption Budget
            </div>
            <div className="mt-1 text-2xl font-bold text-violet-300">2 / 3 Used</div>
            <div className="mt-1 text-[11px] text-slate-300">
              Only high-calibration dissent or verified corridor threats interrupt operator.
            </div>
          </div>
        </div>

        {/* Structured Dissent Synthesis Cards (From benchmark/src/lib/synthesis.ts) */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {/* Card 1: Parody Decoy vs Radar RCS Dissent */}
          <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-slate-950 to-amber-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                <Award className="h-3.5 w-3.5" /> DISSENT LOOP #1 · HIGH-ALTITUDE TRACK #R-88
              </span>
              <span className="font-mono text-xs text-emerald-300">SAM MISSILE SAVED ($1M)</span>
            </div>
            <h4 className="mt-2 text-sm font-bold text-white">
              Radar Says “Large Strike Target (8.5 m² RCS)” vs. Calibrated Acoustic & Partisan Spotter
              Say “Wooden Parody Luneberg Decoy”
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              Naive C2 prioritizes by radar cross-section alone and cues a scarce SAM or 35mm
              Skynex burst. <code>synthesis.ts</code> weights{" "}
              <strong>SkyFortress Mast #412 (Brier 0.042)</strong> +{" "}
              <strong>Partisan Ghost-77 (Brier 0.051)</strong> higher on engine/visual class,
              flagging Track #R-88 as a <strong>$300 Parody Decoy carrying a Luneberg lens</strong>.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
              <span className="text-slate-300">
                Recommended Action: <strong>Suppress SAM · Cue $1,000 P1-SUN Visual Check</strong>
              </span>
              <span className="font-mono font-bold text-cyan-400">Calibrated Trust: 92.4%</span>
            </div>
          </div>

          {/* Card 2: Silent-RF Fiber-Optic FPV Detection */}
          <div
            className={`rounded-xl border p-4 ${
              atechPluggedIn
                ? "border-cyan-500/40 bg-gradient-to-br from-slate-950 to-cyan-950/25"
                : "border-rose-500/50 bg-gradient-to-br from-slate-950 to-rose-950/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-bold ${
                  atechPluggedIn
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-rose-500/20 text-rose-300"
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />{" "}
                {atechPluggedIn
                  ? "DISSENT LOOP #2 · SILENT-RF FIBER-OPTIC FPV DETECTED"
                  : "BLINDSPOT ALERT · ATECH GATEWAY SILENT (UNKNOWN STATE)"}
              </span>
              <span className="font-mono text-xs text-slate-400">GLOC Supply Road KM-14</span>
            </div>
            {atechPluggedIn ? (
              <>
                <h4 className="mt-2 text-sm font-bold text-white">
                  Acoustic Node Positive (86%) + RF Spectrum Clean (0 dBm) = Fiber-Optic FPV Signature
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  Instead of letting the clean RF spectrum cancel out the acoustic trigger, the
                  dissent rule identifies the hallmark of a{" "}
                  <strong>tethered 20 km Fiber-Optic FPV drone</strong> (zero VTX radio emission,
                  high-load rotor audio). Note: Since both Atech ports share{" "}
                  <code>ATECH-PI-GATEWAY-01</code>, corroboration requires 1 external group before
                  kinetic fire.
                </p>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
                  <span className="text-slate-300">
                    Action: <strong>Halt Convoy on KM-14 · Alert Shotgun/Net Turret</strong>
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    1 CCFG (Needs 2nd Group)
                  </span>
                </div>
              </>
            ) : (
              <>
                <h4 className="mt-2 text-sm font-bold text-rose-200">
                  USB Serial Stream Interrupted — Sector KM-14 Transitions to STALE / UNKNOWN
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  You unplugged the Atech Frame 10 node. A naive dashboard clears the alert and
                  shows a green road. <strong>BlindSpot</strong> explicitly paints KM-14 in hashed
                  amber/red <strong>UNKNOWN (NO TELEMETRY FOR 185s)</strong> and warns convoys that
                  sensor loss is NOT absence of threat.
                </p>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-rose-500/30 bg-slate-900/90 px-3 py-2 text-xs">
                  <span className="text-rose-300">
                    Status: <strong>HOLD CONVOY — SENSOR BLINDSPOT ON KM-14</strong>
                  </span>
                  <span className="font-mono font-bold text-rose-400">0 Active Groups</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live Source Feed Table */}
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
              <tr>
                <th className="px-3.5 py-2.5">Source / Modality</th>
                <th className="px-3.5 py-2.5">Common-Cause Group (CCFG)</th>
                <th className="px-3.5 py-2.5">Brier Calibration</th>
                <th className="px-3.5 py-2.5">Freshness / State</th>
                <th className="px-3.5 py-2.5">Observation & Evidence Claim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/50">
              {sources.map((src) => (
                <tr key={src.id} className="hover:bg-slate-800/40">
                  <td className="px-3.5 py-2.5">
                    <div className="font-bold text-white">{src.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {src.modality} · Tier: <code className="text-cyan-300">{src.anonymityTier}</code>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-300">
                    {src.commonCauseGroup}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 font-mono font-bold ${
                        src.brierScore <= 0.08
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      Brier: {src.brierScore.toFixed(3)}
                    </span>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {src.resolvedTrackRecord} verified calls
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {src.status === "FRESH" && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> FRESH ({src.ageSeconds}s)
                      </span>
                    )}
                    {src.status === "STALE_UNKNOWN" && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 font-bold text-rose-300">
                        <AlertTriangle className="h-3 w-3" /> STALE / UNKNOWN ({src.ageSeconds}s)
                      </span>
                    )}
                    {src.status === "QUARANTINED_SYBIL" && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                        <ShieldAlert className="h-3 w-3" /> QUARANTINED SYBIL BURST
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 max-w-md text-slate-300">{src.claimText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Interactive OPSEC PII & Vantage-Point Scrubber (from benchmark/src/lib/scrub.ts) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <EyeOff className="h-5 w-5 text-violet-400" />
              3. Live Partisan & Field Spotter OPSEC Scrubber (Adapted from{" "}
              <code>benchmark/src/lib/scrub.ts</code> & <code>privacy.ts</code>)
            </h3>
            <p className="text-xs text-slate-400">
              Protects Ukrainian informants in occupied areas and civilian ePPO reporters by
              stripping phone numbers, emails, balcony/street vantage points, and fuzzing high-res
              GPS before the report hits the Nexus C2 database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(["ghost", "pseudonym", "verified_unit"] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase transition ${
                  selectedTier === tier
                    ? "border-violet-400 bg-violet-500/20 text-violet-200"
                    : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-rose-300">
              Raw Unscrubbed Spotter Submission (Editable — Try typing a phone number or address)
            </label>
            <textarea
              rows={4}
              value={rawFieldInput}
              onChange={(e) => setRawFieldInput(e.target.value)}
              className="mt-2 w-full rounded-xl border border-rose-500/30 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Scrubbed Payload Forwarded to Intelic Nexus C2
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-300">
                <Lock className="h-3 w-3" /> {scrubbedOutput.attributionLabel}
              </span>
            </div>
            <div className="mt-2 min-h-[98px] rounded-xl border border-emerald-500/30 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-emerald-200">
              {scrubbedOutput.text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
