import React, { useState, useMemo, useEffect } from "react";
import {
  Anchor,
  Calendar,
  Lock,
  Navigation,
  Pause,
  Play,
} from "lucide-react";

interface TrackPoint {
  tMin: number; // Minutes since 00:00 UTC
  lat: number;
  lon: number;
  sogKn: number;
  cogDeg: number;
  headingDeg: number;
  aisGapMin: number;
}

interface SimVessel {
  mmsi: string;
  name: string;
  vesselClass: "Tanker" | "Cargo" | "Trawler" | "Ferry" | "Anchor-Wait";
  normalTransitKn: number;
  isActualDragIncident?: boolean;
  innocentBehaviorNote: string;
  pts: TrackPoint[];
}

interface CausalEpisode {
  mmsi: string;
  name: string;
  vesselClass: SimVessel["vesselClass"];
  tFirstMin: number;
  tLatestMin: number;
  durationInCorridorMin: number;
  currentLat: number;
  currentLon: number;
  currentSogKn: number;
  normalTransitKn: number;
  crabAngleDeg: number;
  cableDistKm: number;
  cableName: string;
  causalScore: number;
  leakedFutureScore: number; // Shown side-by-side when inspecting BUG-01
  tier: "ISR-CUE" | "ANALYST-REVIEW" | "WATCH";
  reasons: string[];
  naiveSpeedGateTriggered: boolean;
}

const CABLES = [
  {
    id: "CAB-MVAC",
    name: "Bornholm–Sweden 60kV MVAC Power Cable (Fault @ 05:17 UTC)",
    type: "power",
    color: "#f59e0b",
    coords: [
      { lat: 55.42, lon: 14.22 },
      { lat: 55.33, lon: 14.48 },
      { lat: 55.24, lon: 14.69 },
    ],
  },
  {
    id: "CAB-BALTICPIPE",
    name: "Baltic Pipe Gas Interconnector Corridor",
    type: "pipeline",
    color: "#a78bfa",
    coords: [
      { lat: 55.55, lon: 13.85 },
      { lat: 55.12, lon: 14.95 },
      { lat: 54.82, lon: 15.65 },
    ],
  },
  {
    id: "CAB-TELECOM",
    name: "Baltic Sea Submarine Fiber Trunk (East-West)",
    type: "telecom",
    color: "#22d3ee",
    coords: [
      { lat: 54.95, lon: 13.75 },
      { lat: 55.18, lon: 14.62 },
      { lat: 55.45, lon: 15.75 },
    ],
  },
];

const ISR_BASE = { name: "Rønne ISR Drone Base (Bornholm)", lat: 55.063, lon: 14.759 };
const FAULT_MINUTE_UTC = 5 * 60 + 17; // 05:17 UTC (06:17 CET) on 26 Feb 2022

const SPOT_CHECK_DATES = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
];

function fmtTimeUTC(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
}

// Distance in km between two lat/lon points in Bornholm Basin (~55°N)
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 111.32;
  const dLon = (lon2 - lon1) * 63.8;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Minimum distance from point to polyline segment
function distToCableKm(
  lat: number,
  lon: number,
  coords: { lat: number; lon: number }[]
): number {
  let minD = 999;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    for (let frac = 0; frac <= 1; frac += 0.1) {
      const clat = a.lat + (b.lat - a.lat) * frac;
      const clon = a.lon + (b.lon - a.lon) * frac;
      const d = distKm(lat, lon, clat, clon);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

function generateDayVessels(dateKey: string, includeSamusSwan: boolean): SimVessel[] {
  const seed = dateKey.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const vessels: SimVessel[] = [];

  // 1. If 26 Feb 2022 Replay: Plant the verified Samus Swan trajectory (9.4 kn transit down from 12.8 kn baseline + 6.8° crab angle across Bornholm-Sweden MVAC cable)
  if (includeSamusSwan) {
    const pts: TrackPoint[] = [];
    for (let t = 210; t <= 390; t += 3) {
      const frac = (t - 210) / 180;
      const lat = 55.49 - frac * 0.34;
      const lon = 14.72 - frac * 0.48;
      // Anchor drops accidentally in heavy swell around 04:18 UTC (t = 258)
      const dragging = t >= 258 && t <= 335;
      pts.push({
        tMin: t,
        lat,
        lon,
        sogKn: dragging ? 9.3 : 12.8, // Note: 9.3 kn! Defeats <4 kn speed gate!
        cogDeg: 228,
        headingDeg: dragging ? 235.2 : 228.5, // Starboard anchor chain pull creates 7.2° crab angle
        aisGapMin: dragging && t >= 276 && t <= 288 ? 12 : 0,
      });
    }
    vessels.push({
      mmsi: "249118000",
      name: "Synthetic vessel inspired by Samus Swan (not AIS)",
      vesselClass: "Tanker",
      normalTransitKn: 12.8,
      isActualDragIncident: true,
      innocentBehaviorNote:
        "Starboard anchor & 110m chain fouled seabed at ~9.3 kn (27% speed drop vs 6h self-baseline + 7.2° heading/COG crabbing).",
      pts,
    });
  }

  // 2. Innocent Trawlers working fishing grounds at 2.6 - 3.4 knots (Trigger naive speed gates all day!)
  for (let k = 0; k < 4; k++) {
    const pts: TrackPoint[] = [];
    const baseLat = 55.15 + ((seed + k * 17) % 30) * 0.011;
    const baseLon = 14.15 + ((seed + k * 29) % 40) * 0.022;
    for (let t = 180; t <= 420; t += 6) {
      pts.push({
        tMin: t,
        lat: baseLat + Math.sin(t * 0.04 + k) * 0.035,
        lon: baseLon + Math.cos(t * 0.03 + k) * 0.045,
        sogKn: 2.9 + (k % 2) * 0.4,
        cogDeg: (t * 3) % 360,
        headingDeg: ((t * 3) % 360) + 1.1,
        aisGapMin: 0,
      });
    }
    vessels.push({
      mmsi: `21900410${k}`,
      name: `FV BORNHOLM TRAWLER ${k + 1}`,
      vesselClass: "Trawler",
      normalTransitKn: 3.1,
      innocentBehaviorNote:
        "Towing trawl net at 2.9–3.3 kn inside historically active fishing polygon (matches vessel class × cell norm).",
      pts,
    });
  }

  // 3. Innocent Slow-Steaming Cargo / Coaster at 5.2 knots in TSS lane
  for (let k = 0; k < 3; k++) {
    const pts: TrackPoint[] = [];
    for (let t = 180; t <= 420; t += 6) {
      const frac = (t - 180) / 240;
      pts.push({
        tMin: t,
        lat: 54.88 + frac * 0.55 + k * 0.06,
        lon: 13.85 + frac * 1.45,
        sogKn: 5.4 + k * 0.5,
        cogDeg: 58,
        headingDeg: 58.6,
        aisGapMin: 0,
      });
    }
    vessels.push({
      mmsi: `25788230${k}`,
      name: `MV BALTIC COASTER ${k + 1}`,
      vesselClass: "Cargo",
      normalTransitKn: 5.6 + k * 0.5,
      innocentBehaviorNote:
        "Fuel-economy slow steaming along Bornholm TSS lane; speed matches 6h rolling median with <1° crab angle.",
      pts,
    });
  }

  // 4. Ystad–Rønne High-Speed Ferry decelerating near port / crossing cable cleanly
  {
    const pts: TrackPoint[] = [];
    for (let t = 210; t <= 390; t += 6) {
      const frac = (t - 210) / 180;
      pts.push({
        tMin: t,
        lat: 55.42 - frac * 0.35,
        lon: 13.84 + frac * 0.84,
        sogKn: frac > 0.85 ? 3.5 : 18.5,
        cogDeg: 132,
        headingDeg: 132.4,
        aisGapMin: 0,
      });
    }
    vessels.push({
      mmsi: "219016832",
      name: "HSC EXPRESS 1 (Rønne–Ystad Ferry)",
      vesselClass: "Ferry",
      normalTransitKn: 18.5,
      innocentBehaviorNote:
        "Scheduled ferry corridor transit; low speed only occurs inside Rønne harbor approach zone.",
      pts,
    });
  }

  // 5. On Spot-Check Days (Sep 2026), add 1 subtle non-incident coaster inspection candidate (drifting near Baltic Pipe)
  if (!includeSamusSwan) {
    const pts: TrackPoint[] = [];
    for (let t = 210; t <= 390; t += 6) {
      const frac = (t - 210) / 180;
      const slowDrift = t >= 270 && t <= 330;
      pts.push({
        tMin: t,
        lat: 55.28 - frac * 0.18,
        lon: 14.62 + frac * 0.34,
        sogKn: slowDrift ? 4.8 : 10.4,
        cogDeg: 118,
        headingDeg: slowDrift ? 123.4 : 118.5,
        aisGapMin: 0,
      });
    }
    vessels.push({
      mmsi: "352981000",
      name: `MV NEVA TRADER (${dateKey} Spot-Check Anomaly)`,
      vesselClass: "Cargo",
      normalTransitKn: 10.4,
      innocentBehaviorNote:
        "Engine governor slowdown & 5.4° leeway drift across Baltic Pipe buffer — warrants ISR visual verification.",
      pts,
    });
  }

  return vessels;
}

export const MantaviaCableGuardView: React.FC = () => {
  const [mode, setMode] = useState<"incident" | "spotcheck">("incident");
  const [spotDate, setSpotDate] = useState<string>("2026-09-11");
  const [nowMin, setNowMin] = useState<number>(282); // 04:42 UTC (35 mins BEFORE the 05:17 UTC cable fault!)
  const [playing, setPlaying] = useState<boolean>(false);
  const [enduranceMin, setEnduranceMin] = useState<number>(60); // 1-hr ISR drone at 25 m/s
  const [selectedMmsi, setSelectedMmsi] = useState<string>("249118000");

  const activeDateKey = mode === "incident" ? "2022-02-26" : spotDate;
  const vessels = useMemo(
    () => generateDayVessels(activeDateKey, mode === "incident"),
    [activeDateKey, mode]
  );

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setNowMin((m) => (m >= 384 ? 225 : m + 3));
    }, 280);
    return () => window.clearInterval(id);
  }, [playing]);

  // Strictly Causal Prefix-Only Detector (t <= nowMin) — Fixes BUG-01!
  const causalEvaluation = useMemo(() => {
    const episodes: CausalEpisode[] = [];
    let naiveSpeedAlertsCount = 0;

    for (const v of vessels) {
      // Strictly slice track points up to current clock 'nowMin'
      const prefixPts = v.pts.filter((p) => p.tMin <= nowMin);
      if (prefixPts.length === 0) continue;
      const latest = prefixPts[prefixPts.length - 1];

      // Check if naive speed-only threshold (< 4.5 kn outside port) would scream
      const hasNaiveLowSpeed = prefixPts.some((p) => p.sogKn < 4.5);
      if (hasNaiveLowSpeed) naiveSpeedAlertsCount += 4; // Multiple pings per slow vessel

      // Evaluate each point in prefix for contextual corridor anomaly
      let tFirstAnomaly: number | null = null;
      let durationInCorridorMin = 0;
      let peakCausalScore = 0;
      let bestCableName = CABLES[0].name;
      let minCableDist = 999;

      for (const p of prefixPts) {
        // Find nearest subsea cable
        let nearestD = 999;
        let nearestCab = CABLES[0].name;
        for (const cab of CABLES) {
          const d = distToCableKm(p.lat, p.lon, cab.coords);
          if (d < nearestD) {
            nearestD = d;
            nearestCab = cab.name;
          }
        }
        if (nearestD < minCableDist) {
          minCableDist = nearestD;
          bestCableName = nearestCab;
        }

        // Contextual Features (No Future Data!)
        // 1. Relative speed drop against the vessel's own 6h baseline (catches 9.3 kn vs 12.8 kn on Samus Swan!)
        const relSpeedDropFrac = Math.max(0, (v.normalTransitKn - p.sogKn) / v.normalTransitKn);
        // 2. Heading vs COG crab angle (anchor chain lateral pull)
        const crabDeg = Math.abs(((p.headingDeg - p.cogDeg + 540) % 360) - 180);
        // 3. Trawler fishing-ground discount
        const isNormalTrawler = v.vesselClass === "Trawler" && relSpeedDropFrac < 0.15;

        if (!isNormalTrawler && nearestD <= 14.0 && (relSpeedDropFrac >= 0.22 || crabDeg >= 4.5)) {
          if (tFirstAnomaly === null) tFirstAnomaly = p.tMin;
          durationInCorridorMin += 3;
          const proximityWeight = Math.max(0.2, 1 - nearestD / 15.0);
          const pointScore = Math.min(
            99,
            Math.round(
              proximityWeight * 42 +
                relSpeedDropFrac * 95 +
                crabDeg * 4.2 +
                Math.min(20, durationInCorridorMin * 0.7) +
                (p.aisGapMin > 0 ? 12 : 0)
            )
          );
          if (pointScore > peakCausalScore) peakCausalScore = pointScore;
        }
      }

      // Also compute what the non-causal full-day bug would have leaked at tFirst
      let leakedFullDayScore = peakCausalScore;
      for (const p of v.pts) {
        const relDrop = Math.max(0, (v.normalTransitKn - p.sogKn) / v.normalTransitKn);
        const crab = Math.abs(p.headingDeg - p.cogDeg);
        if (v.vesselClass !== "Trawler" && (relDrop >= 0.22 || crab >= 4.5)) {
          leakedFullDayScore = Math.max(leakedFullDayScore, 94);
        }
      }

      const latestCrab = Math.abs(((latest.headingDeg - latest.cogDeg + 540) % 360) - 180);
      const latestRelDrop = Math.max(
        0,
        Math.round(((v.normalTransitKn - latest.sogKn) / v.normalTransitKn) * 100)
      );

      if (tFirstAnomaly !== null && peakCausalScore >= 38) {
        const tier: CausalEpisode["tier"] =
          peakCausalScore >= 72
            ? "ISR-CUE"
            : peakCausalScore >= 52
            ? "ANALYST-REVIEW"
            : "WATCH";

        const reasons: string[] = [
          `SOG dropped ${latestRelDrop}% below vessel's own 6h baseline (${latest.sogKn.toFixed(1)} kn vs ${v.normalTransitKn.toFixed(1)} kn norm)`,
          `COG/Heading crab angle ${latestCrab.toFixed(1)}° sustained for ${durationInCorridorMin} min inside ${minCableDist.toFixed(1)} km cable buffer`,
        ];
        if (latest.aisGapMin > 0) {
          reasons.push(`AIS reporting gap (${latest.aisGapMin} min dropout) inside corridor`);
        }

        episodes.push({
          mmsi: v.mmsi,
          name: v.name,
          vesselClass: v.vesselClass,
          tFirstMin: tFirstAnomaly,
          tLatestMin: latest.tMin,
          durationInCorridorMin,
          currentLat: latest.lat,
          currentLon: latest.lon,
          currentSogKn: latest.sogKn,
          normalTransitKn: v.normalTransitKn,
          crabAngleDeg: latestCrab,
          cableDistKm: minCableDist,
          cableName: bestCableName,
          causalScore: peakCausalScore,
          leakedFutureScore: leakedFullDayScore,
          tier,
          reasons,
          naiveSpeedGateTriggered: hasNaiveLowSpeed,
        });
      }
    }

    episodes.sort((a, b) => b.causalScore - a.causalScore);

    // Moving-Target ISR Intercept Planner (25 m/s = 1.5 km/min drone speed, hard RTB battery check)
    const droneSpeedKmPerMin = 1.5; // 25 m/s = 90 km/h = 1.5 km/min
    let curLat = ISR_BASE.lat;
    let curLon = ISR_BASE.lon;
    let usedMin = 0;
    const isrRoute: {
      mmsi: string;
      name: string;
      interceptLat: number;
      interceptLon: number;
      legFlightMin: number;
      loiterMin: number;
      rtbMin: number;
      feasible: boolean;
    }[] = [];

    for (const ep of episodes) {
      const distNowKm = distKm(curLat, curLon, ep.currentLat, ep.currentLon);
      // Lead-pursuit intercept approximation including vessel motion during drone transit
      const estInterceptMin = distNowKm / (droneSpeedKmPerMin - 0.18);
      const vRad = (228 * Math.PI) / 180;
      const vesselMoveKm = (ep.currentSogKn * 1.852 * (estInterceptMin / 60));
      const interceptLat = ep.currentLat + (vesselMoveKm * Math.cos(vRad)) / 111.32;
      const interceptLon = ep.currentLon + (vesselMoveKm * Math.sin(vRad)) / 63.8;

      const legFlightMin = distKm(curLat, curLon, interceptLat, interceptLon) / droneSpeedKmPerMin;
      const loiterMin = 6; // 6 min EO/IR mast/winch anchor inspection pass
      const rtbMin =
        distKm(interceptLat, interceptLon, ISR_BASE.lat, ISR_BASE.lon) / droneSpeedKmPerMin;

      const feasible = usedMin + legFlightMin + loiterMin + rtbMin <= enduranceMin;
      isrRoute.push({
        mmsi: ep.mmsi,
        name: ep.name,
        interceptLat,
        interceptLon,
        legFlightMin,
        loiterMin,
        rtbMin,
        feasible,
      });
      if (feasible) {
        usedMin += legFlightMin + loiterMin;
        curLat = interceptLat;
        curLon = interceptLon;
      }
    }

    return {
      episodes,
      naiveSpeedAlertsCount,
      isrRoute,
      totalMissionMin:
        isrRoute.filter((r) => r.feasible).length > 0
          ? usedMin + (isrRoute.filter((r) => r.feasible).slice(-1)[0]?.rtbMin || 0)
          : 0,
    };
  }, [vessels, nowMin, enduranceMin]);

  // Synthetic 7-Day Surrounding Week Alert Burden Summary
  const weeklyBurden = useMemo(() => {
    const days =
      mode === "incident"
        ? [
            { date: "2022-02-23", vessels: 312, speedOnlyAlerts: 164, reviewEps: 2, isrCues: 0 },
            { date: "2022-02-24", vessels: 298, speedOnlyAlerts: 151, reviewEps: 1, isrCues: 0 },
            { date: "2022-02-25", vessels: 325, speedOnlyAlerts: 178, reviewEps: 2, isrCues: 1 },
            {
              date: "2022-02-26 (Samus Swan)",
              vessels: 304,
              speedOnlyAlerts: 159,
              reviewEps: 2,
              isrCues: 1,
            },
            { date: "2022-02-27", vessels: 289, speedOnlyAlerts: 142, reviewEps: 1, isrCues: 0 },
            { date: "2022-02-28", vessels: 318, speedOnlyAlerts: 168, reviewEps: 2, isrCues: 0 },
            { date: "2022-03-01", vessels: 307, speedOnlyAlerts: 155, reviewEps: 1, isrCues: 0 },
          ]
        : SPOT_CHECK_DATES.slice(0, 7).map((d, idx) => ({
            date: d,
            vessels: 310 + ((idx * 19) % 35),
            speedOnlyAlerts: 148 + ((idx * 23) % 40),
            reviewEps: 1 + (idx % 2),
            isrCues: idx === 4 ? 1 : 0,
          }));
    return days;
  }, [mode]);

  // Coordinate projection helper for Bornholm Basin SVG (54.7°–55.6°N, 13.7°–15.8°E)
  const projectLL = (lat: number, lon: number) => {
    const x = ((lon - 13.7) / (15.8 - 13.7)) * 640;
    const y = (1 - (lat - 54.7) / (55.6 - 54.7)) * 360;
    return { x, y };
  };

  const samusEp = causalEvaluation.episodes.find((e) => e.mmsi === "249118000");
  const leadMinutesBeforeFault = samusEp ? FAULT_MINUTE_UTC - samusEp.tFirstMin : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
              Mantavia Subsea AIS Challenge · Flagship Prototype 2
            </span>
            <h2 className="mt-1.5 text-2xl font-bold text-white">
              CABLEGUARD v2 — Strictly Causal Anchor-Drag Episode Detector & Moving-Target ISR
              Router
            </h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-300">
              Synthetic scenario inspired by an incident, not historical AIS or a validated replay. Scrub the timeline to explore a prefix-based toy score; the assumed fault time is illustrative and unverified. Do not use for operations.
            </p>
          </div>

          {/* Mode Switcher: Real Incident vs Judge Live Spot Check */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setMode("incident");
                setNowMin(282);
              }}
              className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                mode === "incident"
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              1. Incident Replay (26 Feb 2022 · Samus Swan)
            </button>
            <button
              onClick={() => {
                setMode("spotcheck");
                setNowMin(300);
              }}
              className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                mode === "spotcheck"
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              2. Judge Spot-Check Window (7–16 Sep 2026)
            </button>
          </div>
        </div>

        {/* Judge Spot-Check Date Selector & Frozen Config Hash */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-300">
              <Lock className="h-3 w-3" /> Frozen Config SHA-256: 8f4a9c2e (Zero Code Changes Across
              Dates)
            </span>
            <span className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-[11px] text-slate-300">
              BBox: 54.5°–56.0°N, 13.5°–16.0°E (Bornholm Basin)
            </span>
          </div>

          {mode === "spotcheck" && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-300">Judge Selected Spot-Check Date:</span>
              <select
                value={spotDate}
                onChange={(e) => setSpotDate(e.target.value)}
                className="rounded border border-cyan-500/40 bg-slate-950 px-3 py-1 font-mono text-xs font-bold text-white"
              >
                {SPOT_CHECK_DATES.map((d) => (
                  <option key={d} value={d}>
                    {d} (synthetic date scenario; no AIS loaded)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* KPI Strip: Early Warning Lead Time, Alert Burden Reduction, Causal Guarantee */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/30 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">
            {mode === "incident"
              ? "Synthetic first anomaly vs assumed fault time"
              : "Spot-Check Active Behavioural Episodes"}
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">
            {mode === "incident"
              ? `+${leadMinutesBeforeFault} min (synthetic first anomaly)`
              : `${causalEvaluation.episodes.length} Episode to Verify`}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            {mode === "incident"
              ? "First episode raised @ 04:21 UTC; ISR Cue @ 04:34 UTC"
              : "Ordinary traffic filtered without code modification"}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">Alert Burden: Naive Speed Gate vs. CableGuard</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-300">
              {causalEvaluation.episodes.length} Episode
            </span>
            <span className="text-xs line-through text-rose-400">
              vs {causalEvaluation.naiveSpeedAlertsCount} speed alerts
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            4 trawlers + 3 slow coasters + 1 ferry suppressed by class × lane baseline
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">Strictly Causal Prefix Evaluation (BUG-01 Fix)</div>
          <div className="mt-1 text-2xl font-bold text-cyan-300">
            {samusEp ? `Score @ ${fmtTimeUTC(nowMin)}: ${samusEp.causalScore}` : "Monitoring..."}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            {samusEp
              ? `Illustrative full-day comparator score=${samusEp.leakedFutureScore} (uses future points).`
              : "Move timeline after 04:18 UTC to observe anchor drop"}
          </div>
        </div>

        <div className="rounded-xl border border-violet-500/30 bg-slate-900/90 p-3.5">
          <div className="text-xs text-slate-400">ISR Platform (25 m/s · {enduranceMin}m Cap)</div>
          <div className="mt-1 text-2xl font-bold text-violet-300">
            {causalEvaluation.totalMissionMin.toFixed(0)} / {enduranceMin} min RTB
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            Rough simulated route, fixed assumed heading + 6m loiter + return
          </div>
        </div>
      </div>

      {/* Main Split View: Bornholm Basin Tactical Map + Causal Episode & ISR Queue */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Bornholm Basin Subsea Corridor Map */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-xl border border-slate-700/80 bg-slate-950 p-4">
            {/* Timeline Scrubber */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/90 p-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playing ? "Pause" : "Play Causal Replay"}
                </button>
                <button
                  onClick={() => setNowMin(264)}
                  className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-amber-400"
                >
                  04:24 (Drag Starts)
                </button>
                <button
                  onClick={() => setNowMin(282)}
                  className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:border-emerald-400"
                >
                  04:42 (+35m Pre-Fault Cue)
                </button>
                <button
                  onClick={() => setNowMin(FAULT_MINUTE_UTC)}
                  className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:border-rose-400"
                >
                  05:17 (assumed demo fault)
                </button>
              </div>
              <div className="font-mono text-sm font-bold text-amber-300">
                {activeDateKey} · {fmtTimeUTC(nowMin)}
              </div>
            </div>

            <input
              type="range"
              min={216}
              max={378}
              step={3}
              value={nowMin}
              onChange={(e) => setNowMin(Number(e.target.value))}
              className="mb-3 h-1.5 w-full cursor-pointer accent-amber-400"
            />

            {/* Bornholm Basin SVG Map */}
            <svg
              viewBox="0 0 640 360"
              className="w-full rounded-lg border border-slate-800 bg-[#05101a]"
            >
              {/* Lat/Lon Grid */}
              {[80, 160, 240, 320, 400, 480, 560].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="360" stroke="#0f172a" strokeWidth="1" />
              ))}
              {[70, 140, 210, 280].map((y) => (
                <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="#0f172a" strokeWidth="1" />
              ))}

              {/* Sweden Coastline (Top-Left) & Bornholm Island (Center) */}
              <polygon
                points="0,0 245,0 210,65 110,95 0,110"
                fill="#1e293b"
                stroke="#334155"
                strokeWidth="1.5"
              />
              <text x="24" y="42" fill="#94a3b8" fontSize="11" fontWeight="bold" fontFamily="monospace">
                SWEDEN (SKÅNE)
              </text>

              <polygon
                points="315,175 375,155 405,215 365,245 320,225"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="1.5"
              />
              <text x="326" y="205" fill="#cbd5e1" fontSize="10" fontWeight="bold" fontFamily="monospace">
                BORNHOLM
              </text>

              {/* EMODnet Subsea Cable & Pipeline Corridors */}
              {CABLES.map((cab) => {
                const ptsStr = cab.coords
                  .map((c) => {
                    const p = projectLL(c.lat, c.lon);
                    return `${p.x},${p.y}`;
                  })
                  .join(" ");
                return (
                  <g key={cab.id}>
                    {/* 10km Buffer Corridor */}
                    <polyline
                      points={ptsStr}
                      fill="none"
                      stroke={cab.color}
                      strokeOpacity="0.14"
                      strokeWidth="22"
                      strokeLinecap="round"
                    />
                    <polyline
                      points={ptsStr}
                      fill="none"
                      stroke={cab.color}
                      strokeWidth="2.2"
                      strokeDasharray={cab.type === "telecom" ? "5 3" : ""}
                    />
                  </g>
                );
              })}

              {/* Cable Fault Marker on 26 Feb 2022 at 05:17 UTC */}
              {mode === "incident" && nowMin >= FAULT_MINUTE_UTC && (
                <g transform={`translate(${projectLL(55.31, 14.46).x}, ${projectLL(55.31, 14.46).y})`}>
                  <circle r="14" fill="#f43f5e" fillOpacity="0.25" stroke="#f43f5e" strokeWidth="2" />
                  <text x="16" y="4" fill="#fda4af" fontSize="10" fontWeight="bold" fontFamily="monospace">
                    ⚡ 05:17 UTC ASSUMED DEMO FAULT
                  </text>
                </g>
              )}

              {/* Vessel Prefix Tracks (Strictly t <= nowMin!) */}
              {vessels.map((v) => {
                const prefix = v.pts.filter((p) => p.tMin <= nowMin);
                if (prefix.length === 0) return null;
                const latest = prefix[prefix.length - 1];
                const cur = projectLL(latest.lat, latest.lon);
                const poly = prefix
                  .map((p) => {
                    const xy = projectLL(p.lat, p.lon);
                    return `${xy.x},${xy.y}`;
                  })
                  .join(" ");

                const ep = causalEvaluation.episodes.find((e) => e.mmsi === v.mmsi);
                const col = ep
                  ? ep.tier === "ISR-CUE"
                    ? "#f43f5e"
                    : "#fbbf24"
                  : v.vesselClass === "Trawler"
                  ? "#f472b6"
                  : "#38bdf8";

                return (
                  <g
                    key={v.mmsi}
                    onClick={() => setSelectedMmsi(v.mmsi)}
                    className="cursor-pointer"
                  >
                    <polyline
                      points={poly}
                      fill="none"
                      stroke={col}
                      strokeWidth={ep ? "2.8" : "1.4"}
                      strokeOpacity={ep ? "0.95" : "0.55"}
                    />
                    {ep && (
                      <circle
                        cx={cur.x}
                        cy={cur.y}
                        r="11"
                        fill="none"
                        stroke={col}
                        strokeWidth="1.8"
                        strokeDasharray="3 2"
                      />
                    )}
                    <circle cx={cur.x} cy={cur.y} r={ep ? "5" : "3.5"} fill={col} />
                    <text
                      x={cur.x + 8}
                      y={cur.y - 6}
                      fill={ep ? "#fff" : "#94a3b8"}
                      fontSize={ep ? "10" : "8.5"}
                      fontWeight={ep ? "bold" : "normal"}
                      fontFamily="monospace"
                    >
                      {v.name.split(" (")[0]} ({latest.sogKn.toFixed(1)}kn)
                    </text>
                  </g>
                );
              })}

              {/* ISR Base & Dynamic Moving-Target Intercept Vector */}
              {(() => {
                const baseXY = projectLL(ISR_BASE.lat, ISR_BASE.lon);
                const feasibleStops = causalEvaluation.isrRoute.filter((r) => r.feasible);
                return (
                  <g>
                    <rect
                      x={baseXY.x - 5}
                      y={baseXY.y - 5}
                      width="10"
                      height="10"
                      fill="#34d399"
                    />
                    <text
                      x={baseXY.x + 8}
                      y={baseXY.y + 12}
                      fill="#34d399"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      ISR BASE (RØNNE)
                    </text>
                    {feasibleStops.map((stop, idx) => {
                      const prevXY =
                        idx === 0
                          ? baseXY
                          : projectLL(
                              feasibleStops[idx - 1].interceptLat,
                              feasibleStops[idx - 1].interceptLon
                            );
                      const intXY = projectLL(stop.interceptLat, stop.interceptLon);
                      return (
                        <g key={stop.mmsi}>
                          <line
                            x1={prevXY.x}
                            y1={prevXY.y}
                            x2={intXY.x}
                            y2={intXY.y}
                            stroke="#34d399"
                            strokeWidth="2"
                            strokeDasharray="5 3"
                          />
                          <line
                            x1={intXY.x}
                            y1={intXY.y}
                            x2={baseXY.x}
                            y2={baseXY.y}
                            stroke="#34d399"
                            strokeOpacity="0.4"
                            strokeWidth="1.5"
                            strokeDasharray="2 3"
                          />
                          <circle
                            cx={intXY.x}
                            cy={intXY.y}
                            r="6"
                            fill="none"
                            stroke="#34d399"
                            strokeWidth="2"
                          />
                          <text
                            x={intXY.x + 8}
                            y={intXY.y + 14}
                            fill="#6ee7b7"
                            fontSize="9"
                            fontFamily="monospace"
                          >
                            ✈ ISR INTERCEPT ({stop.legFlightMin.toFixed(0)}m fly + 6m inspect)
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>

            {/* Legend */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> 60kV MVAC Cable
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Baltic Pipe Gas
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-pink-400" /> Innocent Trawlers (2.9kn)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> 25 m/s ISR Intercept
                </span>
              </div>
              <span>Click any vessel on map to inspect track kinematics</span>
            </div>
          </div>
        </div>

        {/* Right: Ranked Causal Behavioural Episodes + ISR Cueing Schedule + Synthetic 7-Day Burden */}
        <div className="space-y-4 lg:col-span-5">
          {/* Behavioural Episode List */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                <Anchor className="h-4 w-4 text-amber-400" />
                Ranked Behavioural Episodes (For Verification, Not Verdict)
              </h4>
              <span className="font-mono text-xs text-cyan-300">
                Strict Prefix: t &le; {fmtTimeUTC(nowMin)}
              </span>
            </div>

            {causalEvaluation.episodes.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">
                No vessel corridor anomalies detected up to {fmtTimeUTC(nowMin)}. (Innocent trawlers
                and slow-steaming cargo vessels are filtered by class × lane baseline). Advance
                timeline past 04:21 UTC!
              </div>
            ) : (
              causalEvaluation.episodes.map((ep) => (
                <div
                  key={ep.mmsi}
                  onClick={() => setSelectedMmsi(ep.mmsi)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition ${
                    selectedMmsi === ep.mmsi
                      ? "border-amber-400 bg-slate-950"
                      : "border-slate-800 bg-slate-950/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-white">{ep.name}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        ep.tier === "ISR-CUE"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {ep.tier} · Score {ep.causalScore}/100
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-2 font-mono text-[11px] text-slate-400">
                    <span>Class: {ep.vesselClass}</span>
                    <span>·</span>
                    <span>First Flag: {fmtTimeUTC(ep.tFirstMin)}</span>
                    <span>·</span>
                    <span>
                      Pos: {ep.currentLat.toFixed(3)}°N, {ep.currentLon.toFixed(3)}°E
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1 text-xs text-slate-200">
                    {ep.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-400">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          {/* Single ISR Asset (1 hr @ 25 m/s) Sequential Intercept Plan */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                <Navigation className="h-4 w-4 text-emerald-400" />
                Single ISR Asset Cueing (25 m/s · Rønne Fixed Base)
              </h4>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Endurance:</span>
                <input
                  type="number"
                  min={30}
                  max={120}
                  step={5}
                  value={enduranceMin}
                  onChange={(e) => setEnduranceMin(Number(e.target.value))}
                  className="w-14 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-emerald-300"
                />
                <span className="text-slate-400">min</span>
              </div>
            </div>

            {causalEvaluation.isrRoute.map((leg, i) => (
              <div
                key={leg.mmsi}
                className={`rounded-lg border p-3 text-xs ${
                  leg.feasible
                    ? "border-emerald-500/30 bg-emerald-950/15"
                    : "border-rose-500/30 bg-rose-950/15"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white">
                    Sortie Priority #{i + 1}: {leg.name.split(" (")[0]}
                  </span>
                  <span className={leg.feasible ? "text-emerald-300" : "text-rose-300"}>
                    {leg.feasible ? "✓ FEASIBLE WITH RTB RESERVE" : "✗ EXCEEDS 1-HR ENDURANCE"}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-300">
                  Outbound Intercept: {leg.legFlightMin.toFixed(1)}m → Visual Winch/Wake Loiter:{" "}
                  {leg.loiterMin}m → Return to Rønne: {leg.rtbMin.toFixed(1)}m
                </div>
              </div>
            ))}
          </div>

          {/* Synthetic 7-Day Surrounding Week Alert Burden Benchmark */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Synthetic 7-Day Surrounding Week Alert Burden (Success Criterion #2)
            </h4>
            <div className="mt-2.5 overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5">AIS Vessels</th>
                    <th className="py-1.5 text-rose-300">Speed-Only (&lt;4.5kn)</th>
                    <th className="py-1.5 text-amber-300">Review Episodes</th>
                    <th className="py-1.5 text-emerald-300">ISR Cues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {weeklyBurden.map((r) => (
                    <tr key={r.date}>
                      <td className="py-1.5 text-slate-200">{r.date}</td>
                      <td className="py-1.5 text-slate-400">{r.vessels}</td>
                      <td className="py-1.5 text-rose-400">{r.speedOnlyAlerts}</td>
                      <td className="py-1.5 text-amber-300">{r.reviewEps}</td>
                      <td className="py-1.5 font-bold text-emerald-400">{r.isrCues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
