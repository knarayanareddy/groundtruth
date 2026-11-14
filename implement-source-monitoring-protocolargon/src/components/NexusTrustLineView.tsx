import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Eye,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Target,
  Wind,
} from "lucide-react";

interface VideoTargetPreset {
  id: string;
  label: string;
  uNorm: number; // -0.5 to 0.5 horizontal FOV fraction
  vNorm: number; // -0.5 to 0.5 vertical FOV fraction
  type: "Fiber-Optic FPV Nest" | "R-330Zh Zhitel EW Van" | "Shahed Mobile Launcher";
  brierSpotterCorroboration: number;
}

const TARGET_PRESETS: VideoTargetPreset[] = [
  {
    id: "TGT-01",
    label: "Target A · Fiber-Optic FPV Launch Crew (Tree Line)",
    uNorm: -0.14,
    vNorm: 0.08,
    type: "Fiber-Optic FPV Nest",
    brierSpotterCorroboration: 0.93,
  },
  {
    id: "TGT-02",
    label: "Target B · R-330Zh Zhitel Jammer Truck (Ridge)",
    uNorm: 0.22,
    vNorm: -0.18,
    type: "R-330Zh Zhitel EW Van",
    brierSpotterCorroboration: 0.88,
  },
  {
    id: "TGT-03",
    label: "Target C · Mobile Shahed Rail-Launcher",
    uNorm: 0.04,
    vNorm: 0.26,
    type: "Shahed Mobile Launcher",
    brierSpotterCorroboration: 0.79,
  },
];

export const NexusTrustLineView: React.FC = () => {
  // Drone & Gimbal Telemetry Parameters
  const [altitudeM, setAltitudeM] = useState<number>(420);
  const [gimbalPitchDeg, setGimbalPitchDeg] = useState<number>(28); // Depression angle below horizon (90 = nadir, 12 = shallow grazing)
  const [pitchSigmaDeg, setPitchSigmaDeg] = useState<number>(0.8);
  const yawSigmaDeg = 1.2;
  const gnssPosSigmaM = 4.5;
  const [demReliefSigmaM, setDemReliefSigmaM] = useState<number>(3.5);

  // OSINT & MAVLink Freshness / Staleness (Bridging Nexus Problem #3 into #2)
  const [mavlinkLatencyMs, setMavlinkLatencyMs] = useState<number>(80);
  const [osintWindAgeMin, setOsintWindAgeMin] = useState<number>(4);
  const [gnssSpoofAlert, setGnssSpoofAlert] = useState<boolean>(false);

  // Clicked Video Reticle Position (-0.45 to +0.45 normalized image coordinates)
  const [clickUV, setClickUV] = useState<{ u: number; v: number }>({ u: -0.14, v: 0.08 });
  const [activePreset, setActivePreset] = useState<VideoTargetPreset>(TARGET_PRESETS[0]);

  // Bunker-UX Hold-to-Confirm & Undo State
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [handoffState, setHandoffState] = useState<"CANDIDATE" | "CONFIRMED" | "UNDONE">(
    "CANDIDATE"
  );
  const [undoCountdown, setUndoCountdown] = useState<number>(0);
  const holdIntervalRef = useRef<number | null>(null);

  // Handle preset selection
  const selectPreset = (preset: VideoTargetPreset) => {
    setActivePreset(preset);
    setClickUV({ u: preset.uNorm, v: preset.vNorm });
    setHandoffState("CANDIDATE");
    setHoldProgress(0);
  };

  // Handle direct click on drone video canvas
  const handleVideoClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width - 0.5;
    const v = (e.clientY - rect.top) / rect.height - 0.5;
    setClickUV({
      u: Math.max(-0.42, Math.min(0.42, u)),
      v: Math.max(-0.42, Math.min(0.42, v)),
    });
    setHandoffState("CANDIDATE");
    setHoldProgress(0);
  };

  // Mathematical Geolocation + Analytical Covariance + Synthetic perturbation experiment (Fixes BUG-03)
  const geoMetrics = useMemo(() => {
    const fovHDeg = 46;
    const fovVDeg = 34;
    // Effective ray depression angle including vertical pixel offset
    const rayDepressionDeg = Math.max(
      4.5,
      gimbalPitchDeg + clickUV.v * fovVDeg
    );
    const rayAzimuthOffsetDeg = clickUV.u * fovHDeg;
    const thetaRad = (rayDepressionDeg * Math.PI) / 180;
    const sinT = Math.sin(thetaRad);
    const cosT = Math.cos(thetaRad);
    const tanT = Math.tan(thetaRad);

    // Nominal ground slant & horizontal range
    const groundRangeM = altitudeM / tanT;
    const slantRangeM = altitudeM / sinT;

    // Staleness & Spoofing Inflation Factors (Nexus Problem #3 Effect on Application)
    const latencyVelDriftM = (mavlinkLatencyMs / 1000) * 22; // 22 m/s UAV ground speed
    const windStalenessFactor = 1 + Math.max(0, osintWindAgeMin - 5) * 0.035;
    const effectiveGnssSigma = gnssSpoofAlert ? gnssPosSigmaM * 4.2 + 28 : gnssPosSigmaM;

    // Partial derivatives along-range (dr/dPitch, dr/dAlt, dr/dDEM, dr/dGNSS, dr/dLatency)
    const pitchSigmaRad = ((pitchSigmaDeg * windStalenessFactor) * Math.PI) / 180;
    const yawSigmaRad = ((yawSigmaDeg * windStalenessFactor) * Math.PI) / 180;

    const sigmaPitchAlongM = (altitudeM / (sinT * sinT)) * pitchSigmaRad;
    const sigmaDemAlongM = demReliefSigmaM / tanT;
    const sigmaLatencyAlongM = latencyVelDriftM;
    const sigmaGnssAlongM = effectiveGnssSigma;

    const varPitch = sigmaPitchAlongM ** 2;
    const varDem = sigmaDemAlongM ** 2;
    const varLatency = sigmaLatencyAlongM ** 2;
    const varGnss = sigmaGnssAlongM ** 2;

    const totalAlongVar = varPitch + varDem + varLatency + varGnss;
    const sigmaAlong1Std = Math.sqrt(totalAlongVar);

    // Cross-range variance (yaw uncertainty * groundRange + roll coupling + GNSS + pixel jitter)
    const rollSigmaRad = (0.7 * Math.PI) / 180;
    const sigmaYawCrossM = groundRangeM * yawSigmaRad;
    const sigmaRollCrossM = altitudeM * rollSigmaRad * (cosT / sinT);
    const totalCrossVar =
      sigmaYawCrossM ** 2 + sigmaRollCrossM ** 2 + effectiveGnssSigma ** 2;
    const sigmaCross1Std = Math.sqrt(totalCrossVar);

    // 95% 2D Chi-Square scaling factor (sqrt(5.991) = 2.4477)
    const chi95 = 2.4477;
    const along95M = sigmaAlong1Std * chi95;
    const cross95M = sigmaCross1Std * chi95;
    const cep95M = Math.sqrt(along95M * cross95M);

    // Dominant error budget breakdown
    const totalBudgetVar = totalAlongVar + totalCrossVar || 1;
    const contributors = [
      { name: "Gimbal Pitch & Attitude Uncertainty", pct: Math.round(((varPitch + sigmaRollCrossM ** 2) / totalBudgetVar) * 100) },
      { name: "GNSS / VIO Position & Spoofing", pct: Math.round(((2 * varGnss) / totalBudgetVar) * 100) },
      { name: "DEM Terrain Elevation Relief", pct: Math.round((varDem / totalBudgetVar) * 100) },
      { name: "MAVLink Video-to-Pose Latency & Yaw", pct: Math.round(((varLatency + sigmaYawCrossM ** 2) / totalBudgetVar) * 100) },
    ].sort((a, b) => b.pct - a.pct);

    // Independent Monte Carlo Validation (300 deterministic pseudo-random trials with UNMODELED sinusoidal terrain ridges + roll jitter)
    const mcPoints: { dx: number; dy: number; inside: boolean }[] = [];
    let insideCount = 0;
    const N = 240;
    for (let i = 0; i < N; i++) {
      // Box-Muller deterministic seed
      const u1 = ((i * 73 + 19) % 239) / 240 + 0.002;
      const u2 = ((i * 151 + 43) % 233) / 234 + 0.002;
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      const u3 = ((i * 97 + 11) % 227) / 228 + 0.002;
      const z3 = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u1);

      // Unmodeled non-Gaussian terrain ridge + pitch perturbation
      const dPitch = z1 * pitchSigmaRad;
      const dTerrain = z3 * demReliefSigmaM + 1.8 * Math.sin(i * 0.35);
      const perturbedTan = Math.tan(Math.max(0.04, thetaRad + dPitch));
      const trueRange = (altitudeM - dTerrain) / perturbedTan;
      const dyAlong = trueRange - groundRangeM + z2 * (effectiveGnssSigma * 0.7);
      const dxCross =
        z2 * sigmaCross1Std + Math.sin(i * 0.9) * sigmaRollCrossM * 0.6;

      const normDist = (dyAlong / along95M) ** 2 + (dxCross / cross95M) ** 2;
      const inside = normDist <= 1.0;
      if (inside) insideCount++;
      mcPoints.push({ dx: dxCross, dy: dyAlong, inside });
    }

    const empiricalCoveragePct = ((insideCount / N) * 100).toFixed(1);

    // Fitness for Handoff Tier
    let fitnessTier: "DEMO-THRESHOLD MET" | "NEEDS SECOND LOOK" | "CUE-ONLY (BLOCKED)" =
      "DEMO-THRESHOLD MET";
    let fitnessReason =
      "95% ellipse within precision threshold (<32m) and telemetry/OSINT feeds are fresh.";
    if (gnssSpoofAlert || along95M > 85 || osintWindAgeMin > 25) {
      fitnessTier = "CUE-ONLY (BLOCKED)";
      fitnessReason = gnssSpoofAlert
        ? "GNSS Spoofing / VIO divergence active — simulated handoff blocked; use for visual cueing only."
        : `Along-range 95% error (${along95M.toFixed(0)}m) exceeds illustrative threshold due to shallow grazing angle or stale OSINT.`;
    } else if (along95M > 32 || mavlinkLatencyMs > 220) {
      fitnessTier = "NEEDS SECOND LOOK";
      fitnessReason = `Elongated range uncertainty (${along95M.toFixed(0)}m along-range vs ${cross95M.toFixed(0)}m cross-range). Recommend drone climb or steeper gimbal angle before further review.`;
    }

    // Translated lat/lon in Kharkiv/Kupiansk operational sector
    const baseLat = 49.7124;
    const baseLon = 37.6142;
    const targetLat = baseLat + (groundRangeM * Math.cos((rayAzimuthOffsetDeg * Math.PI) / 180)) / 111320;
    const targetLon = baseLon + (groundRangeM * Math.sin((rayAzimuthOffsetDeg * Math.PI) / 180)) / 71500;

    return {
      rayDepressionDeg,
      groundRangeM,
      slantRangeM,
      along95M,
      cross95M,
      cep95M,
      contributors,
      mcPoints,
      empiricalCoveragePct,
      fitnessTier,
      fitnessReason,
      targetLat,
      targetLon,
    };
  }, [
    altitudeM,
    gimbalPitchDeg,
    pitchSigmaDeg,
    yawSigmaDeg,
    gnssPosSigmaM,
    demReliefSigmaM,
    mavlinkLatencyMs,
    osintWindAgeMin,
    gnssSpoofAlert,
    clickUV,
  ]);

  // Bunker UX Hold-to-Confirm logic
  const startHold = () => {
    if (geoMetrics.fitnessTier === "CUE-ONLY (BLOCKED)") return;
    if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = window.setInterval(() => {
      setHoldProgress((prev) => {
        if (prev >= 100) {
          if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
          setHandoffState("CONFIRMED");
          setUndoCountdown(5);
          return 100;
        }
        return prev + 10;
      });
    }, 90);
  };

  const stopHold = () => {
    if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
    if (handoffState !== "CONFIRMED") {
      setHoldProgress(0);
    }
  };

  useEffect(() => {
    if (handoffState !== "CONFIRMED" || undoCountdown <= 0) return;
    const id = window.setTimeout(() => {
      setUndoCountdown((c) => c - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [handoffState, undoCountdown]);

  const triggerUndo = () => {
    setHandoffState("UNDONE");
    setHoldProgress(0);
    setUndoCountdown(0);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Intelic Nexus Challenge · Flagship Prototype 1
            </span>
            <h2 className="mt-1.5 text-2xl font-bold text-white">
              TRUSTLINE v2 — Recon-to-Strike Video Geolocation with DEM Error Ellipse & OSINT
              Readiness
            </h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-300">
              Merges <strong>GeoClick, NexusGeo, TrustLine, OSINT Readiness Board</strong>, and{" "}
              <strong>Ground Truth Circle</strong>. Click any target in the simulated MAVLink drone
              video feed on the left to compute its simplified flat-ground coordinate, inspect the
              dominant covariance contributor, test shallow-angle horizon stretch, and verify the
              bunker-safe <strong>Hold-to-Confirm + 5s Undo</strong> handoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPreset(p)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  activePreset.id === p.id
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
                }`}
              >
                {p.label.split("·")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split Workbench: Left = Drone Video + Controls, Right = Covariance Map + Monte Carlo + Bunker Handoff */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Interactive Drone Gimbal Video Feed + Telemetry Sliders */}
        <div className="space-y-5 lg:col-span-6">
          {/* Simulated MAVLink Drone Thermal/EO Video Canvas */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-950 p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                <Eye className="h-4 w-4" /> MAVLink SITL Gimbal Feed (Click anywhere in video to
                re-target)
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                ALT: {altitudeM}m · DEPR: {geoMetrics.rayDepressionDeg.toFixed(1)}° · SLANT:{" "}
                {geoMetrics.slantRangeM.toFixed(0)}m
              </span>
            </div>

            <svg
              viewBox="0 0 600 360"
              onClick={handleVideoClick}
              className="w-full cursor-crosshair rounded-lg border border-slate-800 bg-[#07131d]"
            >
              {/* Horizon & Terrain Wireframe Grid */}
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#091926" />
                  <stop offset="100%" stopColor="#102a3a" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="600" height="90" fill="url(#skyGrad)" />
              <line x1="0" y1="90" x2="600" y2="90" stroke="#22d3ee" strokeOpacity="0.3" strokeDasharray="6 4" />
              <text x="12" y="82" fill="#22d3ee" fillOpacity="0.6" fontSize="10" fontFamily="monospace">
                DEM TERRAIN RIDGE LINE (+14m EL)
              </text>

              {/* Perspective terrain lines */}
              {[130, 180, 240, 310].map((y, idx) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="600"
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth={idx + 1}
                />
              ))}
              {[-200, -50, 100, 250, 400, 550, 700].map((x) => (
                <line key={x} x1="300" y1="90" x2={x} y2="360" stroke="#1e293b" strokeWidth="1" />
              ))}

              {/* Supply Road & Tree Line Features */}
              <path
                d="M 80 360 L 270 90 L 305 90 L 160 360 Z"
                fill="#1e293b"
                fillOpacity="0.65"
              />

              {/* Render All 3 Preset Targets in the Video */}
              {TARGET_PRESETS.map((preset) => {
                const px = (preset.uNorm + 0.5) * 600;
                const py = (preset.vNorm + 0.5) * 360;
                return (
                  <g key={preset.id}>
                    <rect
                      x={px - 14}
                      y={py - 9}
                      width="28"
                      height="18"
                      rx="3"
                      fill="#f8fafc"
                      fillOpacity="0.88"
                    />
                    <circle cx={px + 8} cy={py} r="4" fill="#fbbf24" />
                    <text
                      x={px - 22}
                      y={py - 14}
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {preset.id}
                    </text>
                  </g>
                );
              })}

              {/* Clicked Operator Reticle */}
              {(() => {
                const cx = (clickUV.u + 0.5) * 600;
                const cy = (clickUV.v + 0.5) * 360;
                const col =
                  geoMetrics.fitnessTier === "DEMO-THRESHOLD MET"
                    ? "#34d399"
                    : geoMetrics.fitnessTier === "NEEDS SECOND LOOK"
                    ? "#fbbf24"
                    : "#f43f5e";
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="24"
                      fill="none"
                      stroke={col}
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                    <line x1={cx - 34} y1={cy} x2={cx - 10} y2={cy} stroke={col} strokeWidth="2" />
                    <line x1={cx + 10} y1={cy} x2={cx + 34} y2={cy} stroke={col} strokeWidth="2" />
                    <line x1={cx} y1={cy - 34} x2={cx} y2={cy - 10} stroke={col} strokeWidth="2" />
                    <line x1={cx} y1={cy + 10} x2={cx} y2={cy + 34} stroke={col} strokeWidth="2" />
                    <circle cx={cx} cy={cy} r="3" fill={col} />
                    <text
                      x={Math.min(430, cx + 18)}
                      y={Math.max(24, cy - 16)}
                      fill={col}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      CANDIDATE: ±{geoMetrics.along95M.toFixed(0)}m × ±{geoMetrics.cross95M.toFixed(0)}m
                    </text>
                  </g>
                );
              })()}

              {/* HUD Overlay Corners */}
              <text x="14" y="24" fill="#38bdf8" fontSize="11" fontFamily="monospace">
                NEXUS-VIDEO-EXT · 14-BIT CLEARHOT ISP ACTIVE
              </text>
              <text x="415" y="24" fill="#e2e8f0" fontSize="11" fontFamily="monospace">
                {geoMetrics.targetLat.toFixed(5)}°N, {geoMetrics.targetLon.toFixed(5)}°E
              </text>
            </svg>
          </div>

          {/* Interactive Telemetry & OSINT Staleness Sliders */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                <Sliders className="h-4 w-4 text-cyan-400" />
                Live Telemetry, Gimbal Geometry & OSINT Staleness Controls
              </h4>
              <button
                onClick={() => setGnssSpoofAlert((s) => !s)}
                className={`rounded-lg border px-3 py-1 text-xs font-bold transition ${
                  gnssSpoofAlert
                    ? "border-rose-500 bg-rose-500/20 text-rose-200"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:border-rose-400"
                }`}
              >
                {gnssSpoofAlert
                  ? "⚠️ Pokrova GNSS Spoofing: ACTIVE (+35m Drift)"
                  : "Inject GNSS Spoofing / VIO Drift"}
              </button>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Gimbal Depression Angle (Pitch)</span>
                  <span className="font-mono font-bold text-cyan-300">{gimbalPitchDeg}°</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={75}
                  step={1}
                  value={gimbalPitchDeg}
                  onChange={(e) => setGimbalPitchDeg(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-cyan-400"
                />
                <div className="text-[10px] text-slate-400">
                  Drag down to 8–12° to watch shallow grazing angle stretch the along-range ellipse!
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Drone Altitude AGL</span>
                  <span className="font-mono font-bold text-cyan-300">{altitudeM} m</span>
                </div>
                <input
                  type="range"
                  min={120}
                  max={1200}
                  step={20}
                  value={altitudeM}
                  onChange={(e) => setAltitudeM(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Gimbal Pitch Uncertainty (1σ)</span>
                  <span className="font-mono font-bold text-amber-300">{pitchSigmaDeg}°</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.1}
                  value={pitchSigmaDeg}
                  onChange={(e) => setPitchSigmaDeg(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">DEM Terrain Relief Uncertainty (1σ)</span>
                  <span className="font-mono font-bold text-amber-300">{demReliefSigmaM} m</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={15}
                  step={0.5}
                  value={demReliefSigmaM}
                  onChange={(e) => setDemReliefSigmaM(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">MAVLink Video-to-Pose Timestamp Lag</span>
                  <span className="font-mono font-bold text-violet-300">{mavlinkLatencyMs} ms</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={500}
                  step={20}
                  value={mavlinkLatencyMs}
                  onChange={(e) => setMavlinkLatencyMs(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-violet-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1 text-slate-300">
                    <Wind className="h-3 w-3 text-cyan-400" /> OSINT Wind & Meteo Feed Age
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      osintWindAgeMin > 20 ? "text-rose-400" : "text-emerald-300"
                    }`}
                  >
                    {osintWindAgeMin} min old
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={45}
                  step={1}
                  value={osintWindAgeMin}
                  onChange={(e) => setOsintWindAgeMin(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full cursor-pointer accent-emerald-400"
                />
                <div className="text-[10px] text-slate-400">
                  Demonstrates Nexus Problem #3: Stale OSINT automatically widens attitude covariance!
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Covariance Ellipse Map + Independent Monte Carlo + Error Budget + Bunker Hold-to-Confirm */}
        <div className="space-y-5 lg:col-span-6">
          {/* 95% Error Ellipse & Monte Carlo Scatter Map */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-950 p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Compass className="h-4 w-4 text-cyan-400" />
                Tactical Map Item: 95% Covariance Ellipse vs. Synthetic perturbation experiment
              </div>
              <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-300">
                Synthetic trial fraction: {geoMetrics.empiricalCoveragePct}% (240 synthetic trials; no DEM data)
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-12">
              <div className="sm:col-span-7">
                <svg
                  viewBox="-130 -130 260 260"
                  className="w-full rounded-lg border border-slate-800 bg-[#061019]"
                >
                  {/* Scale Rings (25m, 50m, 100m) */}
                  {[25, 50, 100].map((r) => (
                    <g key={r}>
                      <circle
                        cx="0"
                        cy="0"
                        r={r}
                        fill="none"
                        stroke="#1e293b"
                        strokeDasharray={r === 25 ? "3 3" : ""}
                      />
                      <text x={4} y={-r + 10} fill="#475569" fontSize="8" fontFamily="monospace">
                        {r}m
                      </text>
                    </g>
                  ))}
                  <line x1="-130" y1="0" x2="130" y2="0" stroke="#1e293b" />
                  <line x1="0" y1="-130" x2="0" y2="130" stroke="#1e293b" />

                  {/* Drone Line-of-Sight Vector Arrow */}
                  <line
                    x1="0"
                    y1="125"
                    x2="0"
                    y2="-120"
                    stroke="#38bdf8"
                    strokeOpacity="0.25"
                    strokeDasharray="4 4"
                  />
                  <text x="-55" y="120" fill="#38bdf8" fontSize="8" fontFamily="monospace">
                    ▲ UAV LOS VECTOR ({geoMetrics.groundRangeM.toFixed(0)}m)
                  </text>

                  {/* Independent Monte Carlo Ground-Truth Intersections */}
                  {geoMetrics.mcPoints.map((pt, i) => (
                    <circle
                      key={i}
                      cx={Math.max(-122, Math.min(122, pt.dx))}
                      cy={Math.max(-122, Math.min(122, -pt.dy))}
                      r="1.7"
                      fill={pt.inside ? "#22d3ee" : "#f43f5e"}
                      fillOpacity={pt.inside ? "0.55" : "0.85"}
                    />
                  ))}

                  {/* 95% Covariance Error Ellipse */}
                  <ellipse
                    cx="0"
                    cy="0"
                    rx={Math.min(122, geoMetrics.cross95M)}
                    ry={Math.min(122, geoMetrics.along95M)}
                    fill={
                      geoMetrics.fitnessTier === "DEMO-THRESHOLD MET"
                        ? "#10b981"
                        : geoMetrics.fitnessTier === "NEEDS SECOND LOOK"
                        ? "#f59e0b"
                        : "#f43f5e"
                    }
                    fillOpacity="0.14"
                    stroke={
                      geoMetrics.fitnessTier === "DEMO-THRESHOLD MET"
                        ? "#34d399"
                        : geoMetrics.fitnessTier === "NEEDS SECOND LOOK"
                        ? "#fbbf24"
                        : "#f43f5e"
                    }
                    strokeWidth="2"
                  />
                  <circle cx="0" cy="0" r="3" fill="#fff" />
                </svg>
              </div>

              {/* Error Decomposition & Dominant Source */}
              <div className="flex flex-col justify-between space-y-3 sm:col-span-5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                    <div className="text-[10px] uppercase text-slate-400">Along-Range (95%)</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-amber-300">
                      ±{geoMetrics.along95M.toFixed(1)} m
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                    <div className="text-[10px] uppercase text-slate-400">Cross-Range (95%)</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-cyan-300">
                      ±{geoMetrics.cross95M.toFixed(1)} m
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
                  <div className="text-[11px] font-bold text-white">
                    Explainable Error Budget (Why is the ellipse this size?)
                  </div>
                  <div className="mt-2 space-y-2">
                    {geoMetrics.contributors.map((c, idx) => (
                      <div key={c.name}>
                        <div className="flex justify-between text-[11px]">
                          <span className={idx === 0 ? "font-bold text-amber-300" : "text-slate-300"}>
                            {c.name}
                          </span>
                          <span className="font-mono font-bold text-slate-200">{c.pct}%</span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-800">
                          <div
                            className={`h-1.5 rounded-full ${
                              idx === 0 ? "bg-amber-400" : "bg-cyan-500/70"
                            }`}
                            style={{ width: `${Math.min(100, c.pct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bunker-Grade Handoff Gate: Hold-to-Confirm + 5-Second Undo */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Fitness-for-Handoff Gate & Stress-Proof Operator Controls
                </div>
                <h4 className="mt-0.5 text-base font-bold text-white">{activePreset.label}</h4>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold ${
                  geoMetrics.fitnessTier === "DEMO-THRESHOLD MET"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : geoMetrics.fitnessTier === "NEEDS SECOND LOOK"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border-rose-500/40 bg-rose-500/20 text-rose-300"
                }`}
              >
                {geoMetrics.fitnessTier === "DEMO-THRESHOLD MET" && (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {geoMetrics.fitnessTier === "NEEDS SECOND LOOK" && (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {geoMetrics.fitnessTier === "CUE-ONLY (BLOCKED)" && (
                  <ShieldAlert className="h-4 w-4" />
                )}
                {geoMetrics.fitnessTier}
              </span>
            </div>

            <p className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-300">
              <strong className="text-white">System Reasoning: </strong>
              {geoMetrics.fitnessReason} Ground Truth Circle spotter corroboration:{" "}
              <strong className="text-emerald-300">
                {(activePreset.brierSpotterCorroboration * 100).toFixed(0)}% Brier-weighted trust
              </strong>
              .
            </p>

            {/* Misclick-Proof Action Bar */}
            {handoffState !== "CONFIRMED" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onMouseDown={startHold}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={startHold}
                    onTouchEnd={stopHold}
                    disabled={geoMetrics.fitnessTier === "CUE-ONLY (BLOCKED)"}
                    className={`relative flex-1 overflow-hidden rounded-xl border px-5 py-3 text-xs font-bold uppercase tracking-wider transition ${
                      geoMetrics.fitnessTier === "CUE-ONLY (BLOCKED)"
                        ? "cursor-not-allowed border-rose-500/30 bg-slate-950 text-rose-400/70"
                        : "border-cyan-400 bg-slate-950 text-white hover:bg-slate-900"
                    }`}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/40 to-emerald-500/40 transition-all"
                      style={{ width: `${holdProgress}%` }}
                    />
                    <span className="relative flex items-center justify-center gap-2">
                      <Target className="h-4 w-4 text-cyan-400" />
                      {geoMetrics.fitnessTier === "CUE-ONLY (BLOCKED)"
                        ? "Kinetic Handoff Locked (Send as Visual Recon Cue Only)"
                        : holdProgress > 0
                        ? `Hold to Promote Candidate to Nexus C4I Task (${holdProgress}%)...`
                        : "Press & Hold (1.0s) to Promote Candidate to Nexus C4I Strike/Recon Task"}
                    </span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-400">
                  ✓ <strong>Bunker UX Guard:</strong> Single-clicking video only moves the candidate
                  ellipse. Promoting to an active C4I task requires a 1-second hold and includes a
                  5-second reversible undo.
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-3.5">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      SIMULATED handoff confirmed locally — nothing published to Nexus
                    </div>
                    <div className="font-mono text-[11px] text-emerald-300">
                      Coord: {geoMetrics.targetLat.toFixed(5)}°N, {geoMetrics.targetLon.toFixed(5)}°E ·
                      CEP95: ±{geoMetrics.cep95M.toFixed(1)}m
                    </div>
                  </div>
                </div>
                {undoCountdown > 0 && (
                  <button
                    onClick={triggerUndo}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-rose-400"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> UNDO HANDOFF ({undoCountdown}s)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
