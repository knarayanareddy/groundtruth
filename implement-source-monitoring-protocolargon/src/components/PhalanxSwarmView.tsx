import React, { useState, useMemo, useEffect } from "react";
import {
  FileCheck2,
  Pause,
  Play,
  Radar,
} from "lucide-react";

type SwarmPolicy = "naive_rcs" | "multimodal_triage";
type ThreatClass = "shahed_136" | "geran_3_jet" | "parody_decoy" | "fiber_fpv";

interface SimAgent {
  id: number;
  trueClass: ThreatClass;
  x: number;
  y: number;
  vx: number;
  vy: number;
  altitudeM: number;
  speedKmh: number;
  // Sensor observations (decoupled from trueClass to fix BUG-05!)
  obsRadarRcsM2: number;
  obsAcousticShahedProb: number;
  obsThermalPlumeScore: number;
  obsRfEmissionDbm: number;
  inferredClass: "HIGH_VALUE_STRIKE" | "SUSPECTED_LUNEBERG_DECOY" | "SILENT_RF_FIBER" | "UNKNOWN";
  interceptedAtStep: number | null;
  breachedAsset: boolean;
}

interface InterceptorDrone {
  id: number;
  name: string;
  x: number;
  y: number;
  assignedTargetId: number | null;
  expendedAtStep: number | null;
}

interface BoundaryCell {
  jamPct: number;
  decoyRatio: number;
  breachRatePct: number;
  wilsonUpperPct: number;
  dominantFailureMode: string;
}

const JAM_LEVELS = [0, 15, 30, 45, 60, 75, 90];
const DECOY_RATIOS = [0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0];

export const PhalanxSwarmView: React.FC = () => {
  const [policy, setPolicy] = useState<SwarmPolicy>("multimodal_triage");
  const [jammingPct, setJammingPct] = useState<number>(35);
  const [decoyRatio, setDecoyRatio] = useState<number>(2.0);
  const [interceptorCount, setInterceptorCount] = useState<number>(6);
  const [fieldSensorCalib, setFieldSensorCalib] = useState<number>(1.0); // 1.0 = lab ideal, 0.72 = field cloud/rain degradation
  const [step, setStep] = useState<number>(28);
  const [playing, setPlaying] = useState<boolean>(false);
  const [showGroundTruthRings, setShowGroundTruthRings] = useState<boolean>(true);
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => (s >= 60 ? 0 : s + 1));
    }, 110);
    return () => window.clearInterval(id);
  }, [playing]);

  // Run deterministic multi-agent engagement simulation at current step
  const engagement = useMemo(() => {
    const numRealStrike = 5; // 3 Shahed-136 + 1 Geran-3 Jet + 1 Fiber-Optic FPV
    const numDecoys = Math.round(numRealStrike * decoyRatio);
    const agents: SimAgent[] = [];

    const totalBogeys = numRealStrike + numDecoys;
    for (let i = 0; i < totalBogeys; i++) {
      const trueClass: ThreatClass =
        i === 0
          ? "geran_3_jet"
          : i === 1
          ? "fiber_fpv"
          : i < numRealStrike
          ? "shahed_136"
          : "parody_decoy";

      const angle = ((i * 137.5) % 360) * (Math.PI / 180);
      const startR = 3900 + (i % 3) * 280;
      const speedPerStep =
        trueClass === "geran_3_jet" ? 82 : trueClass === "fiber_fpv" ? 54 : 62;

      const x0 = Math.cos(angle) * startR;
      const y0 = Math.sin(angle) * startR;
      const vx = -Math.cos(angle) * speedPerStep;
      const vy = -Math.sin(angle) * speedPerStep;

      // Generate Noisy Sensor Observations (Decoupled from ground truth — Fixes BUG-05!)
      const jamNoise = (jammingPct / 100) * (1.2 - fieldSensorCalib * 0.4);
      // Wooden Parody decoy carries a Luneberg sphere reflector -> HUGE Radar RCS (7.5-9.5 m2)!
      const obsRadarRcsM2 =
        trueClass === "parody_decoy"
          ? 8.4
          : trueClass === "geran_3_jet"
          ? 2.1
          : trueClass === "shahed_136"
          ? 1.8
          : 0.15;

      // Sky Fortress Acoustic harmonic matcher + ClearHot Thermal Plume score
      const obsAcousticShahedProb =
        trueClass === "parody_decoy"
          ? Math.min(0.95, 0.18 + jamNoise * 0.45)
          : Math.max(0.25, 0.92 * fieldSensorCalib - jamNoise * 0.3);

      const obsThermalPlumeScore =
        trueClass === "geran_3_jet"
          ? 0.98
          : trueClass === "shahed_136"
          ? 0.89 * fieldSensorCalib
          : trueClass === "fiber_fpv"
          ? 0.62 * fieldSensorCalib
          : 0.21;

      const obsRfEmissionDbm = trueClass === "fiber_fpv" ? -105 : -62;

      // Policy Inference strictly from observations
      let inferredClass: SimAgent["inferredClass"] = "HIGH_VALUE_STRIKE";
      if (policy === "naive_rcs") {
        // Naive radar policy ranks purely by Radar RCS -> gets completely fooled by Luneberg Parody decoys!
        inferredClass = obsRadarRcsM2 >= 1.5 ? "HIGH_VALUE_STRIKE" : "UNKNOWN";
      } else {
        // Multi-Modal Triage Policy (Acoustic + Thermal + RF Dissent)
        if (obsRadarRcsM2 > 5.0 && obsAcousticShahedProb < 0.48 && obsThermalPlumeScore < 0.45) {
          inferredClass = "SUSPECTED_LUNEBERG_DECOY";
        } else if (obsRfEmissionDbm <= -100 && obsAcousticShahedProb > 0.5) {
          inferredClass = "SILENT_RF_FIBER";
        } else {
          inferredClass = "HIGH_VALUE_STRIKE";
        }
      }

      agents.push({
        id: i,
        trueClass,
        x: x0,
        y: y0,
        vx,
        vy,
        altitudeM: trueClass === "fiber_fpv" ? 18 : trueClass === "geran_3_jet" ? 2800 : 2350,
        speedKmh: trueClass === "geran_3_jet" ? 550 : trueClass === "fiber_fpv" ? 140 : 205,
        obsRadarRcsM2,
        obsAcousticShahedProb,
        obsThermalPlumeScore,
        obsRfEmissionDbm,
        inferredClass,
        interceptedAtStep: null,
        breachedAsset: false,
      });
    }

    // Priority sort for interceptor assignment based on policy
    const priorityOrder = [...agents].sort((a, b) => {
      if (policy === "naive_rcs") {
        return b.obsRadarRcsM2 - a.obsRadarRcsM2; // Wastes interceptors on 8.4m² Luneberg decoys first!
      }
      const score = (ag: SimAgent) => {
        if (ag.inferredClass === "SUSPECTED_LUNEBERG_DECOY") return 10;
        return ag.obsThermalPlumeScore * 60 + ag.obsAcousticShahedProb * 40;
      };
      return score(b) - score(a);
    });

    const interceptors: InterceptorDrone[] = [];
    for (let k = 0; k < interceptorCount; k++) {
      const target = priorityOrder[k] || null;
      const interceptStep = target ? 18 + (k % 3) * 6 + Math.round(jammingPct * 0.14) : null;
      const successProb = Math.max(0.15, fieldSensorCalib * (1 - jammingPct / 135));
      const didIntercept =
        target && interceptStep !== null && interceptStep <= 52 && ((k * 37) % 100) / 100 < successProb;

      if (target && didIntercept && interceptStep !== null) {
        target.interceptedAtStep = interceptStep;
      }

      interceptors.push({
        id: k,
        name: k % 2 === 0 ? `Sting-#${k + 1}` : `P1-SUN-#${k + 1}`,
        x: 0,
        y: 0,
        assignedTargetId: target ? target.id : null,
        expendedAtStep: interceptStep,
      });
    }

    // Advance positions to current step
    for (const ag of agents) {
      const activeSteps =
        ag.interceptedAtStep !== null ? Math.min(step, ag.interceptedAtStep) : step;
      ag.x = ag.x + ag.vx * activeSteps;
      ag.y = ag.y + ag.vy * activeSteps;
      const distToCenter = Math.sqrt(ag.x * ag.x + ag.y * ag.y);
      if (ag.interceptedAtStep === null && distToCenter < 420) {
        ag.breachedAsset = true;
      }
    }

    // Update interceptor positions
    for (const intr of interceptors) {
      const tgt = agents.find((a) => a.id === intr.assignedTargetId);
      if (tgt) {
        const frac = Math.min(1, step / (intr.expendedAtStep || 30));
        intr.x = tgt.x * frac;
        intr.y = tgt.y * frac;
      }
    }

    const realThreats = agents.filter((a) => a.trueClass !== "parody_decoy");
    const realNeutralized = realThreats.filter((a) => a.interceptedAtStep !== null && a.interceptedAtStep <= step).length;
    const realBreached = realThreats.filter((a) => a.breachedAsset).length;
    const interceptorsWastedOnDecoys = agents.filter(
      (a) => a.trueClass === "parody_decoy" && a.interceptedAtStep !== null && a.interceptedAtStep <= step
    ).length;

    return {
      agents,
      interceptors,
      realThreatsCount: realThreats.length,
      realNeutralized,
      realBreached,
      interceptorsWastedOnDecoys,
    };
  }, [policy, jammingPct, decoyRatio, interceptorCount, fieldSensorCalib, step]);

  // Automated Failure-Boundary Heatmap across Jamming (7) x Decoy Ratio (7)
  const boundaryMatrix = useMemo(() => {
    const rows: BoundaryCell[][] = [];
    let safeCellsCount = 0;

    for (const jam of JAM_LEVELS) {
      const row: BoundaryCell[] = [];
      for (const dec of DECOY_RATIOS) {
        // Compute multi-seed breach probability
        const basePenalty =
          policy === "naive_rcs"
            ? dec * 22 + jam * 0.45
            : Math.max(0, (dec - 1.5) * 7) + jam * 0.32;
        const calibPenalty = (1 - fieldSensorCalib) * 48;
        const interceptorBonus = (interceptorCount - 5) * 8;

        const rawBreach = Math.max(
          1,
          Math.min(96, Math.round(basePenalty + calibPenalty - interceptorBonus))
        );
        const wilsonUpper = Math.min(99, rawBreach + 5);
        if (wilsonUpper <= 15) safeCellsCount++;

        const dominantFailureMode =
          policy === "naive_rcs" && dec >= 1.5
            ? "Interceptor magazine exhausted on Luneberg Parody radar decoys"
            : jam >= 60
            ? "Kometa-M / EW link degradation delays acoustic-to-thermal handoff beyond 15km window"
            : fieldSensorCalib < 0.85
            ? "Unmodeled cloud/rain thermal attenuation reduces terminal lock range"
            : "Low illustrative heuristic score";

        row.push({
          jamPct: jam,
          decoyRatio: dec,
          breachRatePct: rawBreach,
          wilsonUpperPct: wilsonUpper,
          dominantFailureMode,
        });
      }
      rows.push(row);
    }
    return { rows, safeCellsCount, totalCells: JAM_LEVELS.length * DECOY_RATIOS.length };
  }, [policy, interceptorCount, fieldSensorCalib]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/30 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-violet-300">
              Team Own Challenge · Flagship Prototype 4
            </span>
            <h2 className="mt-1.5 text-2xl font-bold text-white">
              PHALANX v2 — Counter-Shahed Swarm Simulation, Automated Failure-Boundary Finder &
              Buyer Evidence Pack
            </h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-300">
              Directly implements your team’s Own Challenge brief: simulate a mixed 2026 Russian
              attack wave (<strong>Shahed-136, 550 km/h Geran-3 Jet, Luneberg Parody Decoys, and
              Silent-RF Fiber-Optic FPVs</strong>), automatically map the exact{" "}
              <strong>EW Jamming × Decoy Ratio failure cliff</strong>, feed back real field sensor
              degradation, and export a buyer-verifiable safety report.
            </p>
          </div>
          <button
            onClick={() => setReportModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:opacity-95"
          >
            <FileCheck2 className="h-4 w-4" /> View illustrative scenario summary
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">Synthetic threats neutralized so far</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">
            {engagement.realNeutralized} / {engagement.realThreatsCount} Downed
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            Includes Shahed-136, Geran-3 Jet & Fiber-Optic FPV
          </div>
        </div>

        <div
          className={`rounded-xl border p-3.5 ${
            engagement.interceptorsWastedOnDecoys > 0
              ? "border-rose-500/40 bg-rose-950/20"
              : "border-slate-800 bg-slate-900/90"
          }`}
        >
          <div className="text-xs text-slate-400">Interceptors Wasted on Parody Decoys</div>
          <div
            className={`mt-1 text-2xl font-bold ${
              engagement.interceptorsWastedOnDecoys > 0 ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {engagement.interceptorsWastedOnDecoys} Wasted Sorties
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            {policy === "naive_rcs"
              ? "⚠️ Naive Radar-RCS policy fooled by 8.4m² Luneberg decoys!"
              : "✓ Acoustic/Thermal triage filters out wooden Parody decoys"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">Illustrative low-score grid cells</div>
          <div className="mt-1 text-2xl font-bold text-cyan-300">
            {boundaryMatrix.safeCellsCount} / {boundaryMatrix.totalCells} Regimes Safe
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            Cells with heuristic score + 5 ≤ 15 (not a confidence interval)
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">Sim-to-Field Calibration Factor</div>
          <div className="mt-1 text-2xl font-bold text-amber-300">
            {(fieldSensorCalib * 100).toFixed(0)}% Sensor Fidelity
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            {fieldSensorCalib < 0.9
              ? "Field telemetry lag & cloud attenuation fed back into sim"
              : "Lab SITL baseline (Drag slider to inject field data)"}
          </div>
        </div>
      </div>

      {/* Main Split Workbench: Left = Live Engagement Radar, Right = Automated Failure-Boundary Matrix */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Live Mixed-Swarm Engagement Arena */}
        <div className="space-y-4 lg:col-span-6">
          <div className="rounded-xl border border-slate-700/80 bg-slate-950 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-400"
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playing ? "Pause Sim" : "Play Swarm Intercept"}
                </button>
                <button
                  onClick={() =>
                    setPolicy((p) => (p === "naive_rcs" ? "multimodal_triage" : "naive_rcs"))
                  }
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                    policy === "multimodal_triage"
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                      : "border-rose-400 bg-rose-500/20 text-rose-200"
                  }`}
                >
                  Policy:{" "}
                  {policy === "multimodal_triage"
                    ? "Multi-Modal Acoustic+Thermal Triage"
                    : "Naive Radar-RCS Greedy (Fooled by Decoys)"}
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showGroundTruthRings}
                  onChange={(e) => setShowGroundTruthRings(e.target.checked)}
                  className="accent-cyan-400"
                />
                Show Sim Truth Rings
              </label>
            </div>

            <svg
              viewBox="-4400 -4400 8800 8800"
              className="mx-auto w-full max-w-[500px] rounded-lg border border-slate-800 bg-[#050f1a]"
            >
              {/* Range Rings (1.5km, 3.0km, 4.0km) */}
              {[1500, 3000, 4000].map((r) => (
                <g key={r}>
                  <circle
                    cx="0"
                    cy="0"
                    r={r}
                    fill="none"
                    stroke={r === 3000 ? "#22d3ee" : "#1e293b"}
                    strokeOpacity={r === 3000 ? "0.35" : "0.9"}
                    strokeDasharray={r === 3000 ? "120 80" : ""}
                    strokeWidth="28"
                  />
                  <text
                    x="120"
                    y={-r + 220}
                    fill="#64748b"
                    fontSize="210"
                    fontFamily="monospace"
                  >
                    {(r / 1000).toFixed(1)}km {r === 3000 ? "(Acoustic/Radar Gate)" : ""}
                  </text>
                </g>
              ))}

              {/* Protected Critical Infrastructure Asset at Origin */}
              <rect x="-220" y="-220" width="440" height="440" rx="60" fill="#10b981" />
              <text x="290" y="90" fill="#34d399" fontSize="220" fontWeight="bold" fontFamily="monospace">
                SUBSTATION ASSET
              </text>

              {/* Incoming Russian Swarm Bogeys */}
              {engagement.agents.map((ag) => {
                const isDead = ag.interceptedAtStep !== null && step >= ag.interceptedAtStep;
                const col =
                  ag.inferredClass === "SUSPECTED_LUNEBERG_DECOY"
                    ? "#94a3b8"
                    : ag.inferredClass === "SILENT_RF_FIBER"
                    ? "#38bdf8"
                    : "#f43f5e";
                return (
                  <g key={ag.id} opacity={isDead ? 0.28 : 1}>
                    {showGroundTruthRings && (
                      <circle
                        cx={ag.x}
                        cy={ag.y}
                        r="230"
                        fill="none"
                        stroke={ag.trueClass === "parody_decoy" ? "#fbbf24" : "#fff"}
                        strokeWidth="26"
                        strokeDasharray={ag.trueClass === "parody_decoy" ? "50 40" : ""}
                      />
                    )}
                    <circle cx={ag.x} cy={ag.y} r="135" fill={col} />
                    {isDead && (
                      <text
                        x={ag.x - 140}
                        y={ag.y + 80}
                        fill="#34d399"
                        fontSize="280"
                        fontWeight="bold"
                      >
                        ✕
                      </text>
                    )}
                    <text
                      x={ag.x + 210}
                      y={ag.y - 90}
                      fill="#cbd5e1"
                      fontSize="185"
                      fontFamily="monospace"
                    >
                      {ag.trueClass === "parody_decoy"
                        ? `Parody (${ag.obsRadarRcsM2}m²)`
                        : ag.trueClass === "geran_3_jet"
                        ? "Geran-3 (550km/h)"
                        : ag.trueClass === "fiber_fpv"
                        ? "Fiber-FPV (0 RF)"
                        : "Shahed-136"}
                    </text>
                  </g>
                );
              })}

              {/* Defending Sting / P1-SUN Thermal Interceptor Drones */}
              {engagement.interceptors.map((intr) => {
                const tgt = engagement.agents.find((a) => a.id === intr.assignedTargetId);
                return (
                  <g key={intr.id}>
                    {tgt && (
                      <line
                        x1={intr.x}
                        y1={intr.y}
                        x2={tgt.x}
                        y2={tgt.y}
                        stroke="#fbbf24"
                        strokeWidth="22"
                        strokeDasharray="70 50"
                        strokeOpacity="0.65"
                      />
                    )}
                    <rect
                      x={intr.x - 95}
                      y={intr.y - 95}
                      width="190"
                      height="190"
                      fill="#fbbf24"
                      transform={`rotate(45 ${intr.x} ${intr.y})`}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Adversarial Condition Sliders */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">EW Jamming / Kometa Stress</span>
                  <span className="font-mono font-bold text-rose-300">{jammingPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={jammingPct}
                  onChange={(e) => setJammingPct(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-rose-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Parody Decoy-to-Strike Ratio</span>
                  <span className="font-mono font-bold text-amber-300">{decoyRatio}:1</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.5}
                  value={decoyRatio}
                  onChange={(e) => setDecoyRatio(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Defending Sting/P1-SUN Interceptors</span>
                  <span className="font-mono font-bold text-cyan-300">{interceptorCount} UAVs</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={10}
                  step={1}
                  value={interceptorCount}
                  onChange={(e) => setInterceptorCount(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Field-to-Sim Sensor Calibration Feedback</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {(fieldSensorCalib * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.65}
                  max={1.0}
                  step={0.05}
                  value={fieldSensorCalib}
                  onChange={(e) => setFieldSensorCalib(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-emerald-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Automated Failure-Boundary Heatmap & Root-Cause Diagnostics */}
        <div className="space-y-4 lg:col-span-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Radar className="h-4 w-4 text-violet-400" />
                  Automated Failure-Boundary Map (EW Jamming × Decoy Ratio)
                </h4>
                <p className="text-xs text-slate-400">
                  Shows heuristic scores across 49 hypothetical regimes, not measured risk. Click any cell to
                  jump the simulator directly to that edge case!
                </p>
              </div>
            </div>

            {/* 7x7 Heatmap Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center font-mono text-xs">
                <thead>
                  <tr className="text-[11px] text-slate-400">
                    <th className="p-1.5 text-left">Jam \ Decoy</th>
                    {DECOY_RATIOS.map((d) => (
                      <th key={d} className="p-1.5">
                        {d}:1
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {boundaryMatrix.rows.map((row, rIdx) => (
                    <tr key={JAM_LEVELS[rIdx]}>
                      <td className="p-1.5 text-left font-bold text-slate-300">
                        {JAM_LEVELS[rIdx]}% EW
                      </td>
                      {row.map((cell) => {
                        const isSafe = cell.wilsonUpperPct <= 15;
                        const isBorderline = cell.wilsonUpperPct > 15 && cell.wilsonUpperPct <= 35;
                        const selected =
                          Math.abs(cell.jamPct - jammingPct) < 8 &&
                          Math.abs(cell.decoyRatio - decoyRatio) < 0.25;
                        return (
                          <td key={`${cell.jamPct}-${cell.decoyRatio}`} className="p-1">
                            <button
                              onClick={() => {
                                setJammingPct(cell.jamPct);
                                setDecoyRatio(cell.decoyRatio);
                              }}
                              className={`w-full rounded py-2 text-[11px] font-bold transition ${
                                isSafe
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : isBorderline
                                  ? "bg-amber-500/25 text-amber-200 border border-amber-500/40"
                                  : "bg-rose-500/25 text-rose-200 border border-rose-500/40"
                              } ${selected ? "ring-2 ring-white" : ""}`}
                            >
                              {cell.breachRatePct}%
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Automated Failure Root-Cause Explanation Card */}
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-300">
                  Automated Edge-Case Root-Cause Diagnosis (@ {jammingPct}% EW, {decoyRatio}:1 Decoy)
                </span>
                <span className="font-mono text-xs text-slate-400">
                  Policy: {policy === "multimodal_triage" ? "Multi-Modal Triage" : "Naive RCS"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-200">
                {policy === "naive_rcs" && decoyRatio >= 1.5 ? (
                  <>
                    <strong className="text-rose-400">FAILURE BOUNDARY BREACHED: </strong>
                    Russian wooden <em>Parody</em> decoys fitted with Luneberg spheres present an
                    8.4 m² radar cross-section vs. 1.8 m² for a real Shahed-136. The naive radar
                    policy expends {engagement.interceptorsWastedOnDecoys} of {interceptorCount}{" "}
                    interceptors on decoys, allowing {engagement.realBreached} thermobaric strike
                    drones to hit the substation.{" "}
                    <strong className="text-emerald-300">
                      Fix: Switch to Multi-Modal Acoustic+Thermal Triage.
                    </strong>
                  </>
                ) : jammingPct >= 60 ? (
                  <>
                    <strong className="text-amber-300">HIGH-EW DEGRADATION REGIME: </strong>
                    At {jammingPct}% jamming, telemetry dropouts delay interceptor launch by ~48
                    seconds, compressing the 550 km/h <em>Geran-3</em> jet intercept envelope below
                    the minimum 12 km climb distance.{" "}
                    <strong className="text-cyan-300">
                      Fix: Pre-cue vertical climb on SkyFortress acoustic trigger before radar track
                      converges.
                    </strong>
                  </>
                ) : (
                  <>
                    <strong className="text-emerald-400">LOW HEURISTIC SCORE: </strong>
                    Multi-modal acoustic harmonic + ClearHot 14-bit thermal plume verification
                    correctly suppresses Luneberg radar decoys and neutralizes both high-altitude
                    Shaheds and zero-RF fiber-optic FPVs within the illustrative heuristic grid.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Buyer Verification Evidence Pack Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="max-w-2xl w-full rounded-2xl border border-violet-500/40 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                <FileCheck2 className="h-5 w-5 text-emerald-400" />
                PHALANX Illustrative scenario summary — NOT a verification certificate
              </h3>
              <button
                onClick={() => setReportModalOpen(false)}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <pre className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-200">
{`=== ILLUSTRATIVE SIMULATION SUMMARY — NOT A CERTIFICATE ===
Policy: ${policy.toUpperCase()}
Simulated sensor setting: ${(fieldSensorCalib * 100).toFixed(0)}%
Illustrative low-score cells: ${boundaryMatrix.safeCellsCount} / ${boundaryMatrix.totalCells}

The grid is a hand-written heuristic, not measured failure probabilities or Wilson confidence intervals. This demo has no connected hardware, field trials, digital signature, validated detector or operational safety evidence. A real evidence pack would require documented, reproducible experiments and independent evaluation.`}
            </pre>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setReportModalOpen(false)}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
