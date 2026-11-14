export interface CodeFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  repo: "hackreview" | "hack2ndrun" | "hackideasreviewed" | "cross-repo";
  file: string;
  title: string;
  symptom: string;
  rootCause: string;
  brokenCodeSnippet: string;
  fixedCodeSnippet: string;
  fixedInTab: string;
}

export interface FactCheck {
  id: string;
  domain: "Mantavia AIS" | "Intelic Nexus" | "Thermal ISP" | "Hardware / Atech" | "Ukraine / Swarm";
  claimInBriefOrApp: string;
  verdict: "Corrected" | "Confirmed" | "Nuanced / Caveat";
  verifiedReality: string;
  source: string;
  sourceUrl: string;
  architecturalImpact: string;
}

export interface ConsolidatedIdea {
  id: string;
  name: string;
  origins: string[];
  track: "Intelic Nexus" | "Mantavia AIS" | "Thermal ISP" | "Independent / Open" | "Cross-Track / Benchmark";
  recommendation: "Headline Winner" | "Merge as Core Module" | "Hardware Flourish" | "Park / Drop";
  scores: {
    rubricFit: number;
    weekendFeasibility: number;
    liveDemoImpact: number;
    differentiation: number;
    ukraineRelevance: number;
  };
  summary: string;
  criticalFlawInOriginal: string;
  upgradedVersionInThisApp: string;
  prototypeTab: string;
}

export interface HardwareItem {
  name: string;
  status: "Confirmed Photo/Owner" | "Unverified Model/Access" | "Missing / Do Not Assume";
  whatItActuallyDoes: string;
  weekendSweetSpot: string;
  trapToAvoid: string;
}

export const CODE_FINDINGS: CodeFinding[] = [
  {
    id: "BUG-01",
    severity: "critical",
    repo: "hackideasreviewed",
    file: "src/views/CableGuard.tsx:47-54 & src/sim/ais.ts:329-352",
    title: "Causal Future-Data Leakage in Episode Detection & ISR Cueing",
    symptom:
      "At the exact minute an anomaly episode starts (e.g. 04:12 UTC), the UI already displays the episode's end-of-day peak score, final 'CUE' tier, total drag duration, and future trajectory points.",
    rootCause:
      "detect(vessels, base, cfg) is run once over the entire 24-hour trajectory array, and the UI merely filters eps.filter(e => e.tFirst <= now). The episode object retains peakScore, tier, and reasons aggregated from timestamps > now.",
    brokenCodeSnippet: `// BROKEN (hackideasreviewed/src/views/CableGuard.tsx)
const eps = useMemo(() => detect(vessels, base, cfg), [vessels, base, cfg]);
const visible = eps.filter((e) => e.tFirst <= now); // Leaks future peakScore & tier!`,
    fixedCodeSnippet: `// FIXED (Causal Prefix Engine in MantaviaCableGuardView.tsx)
const causalVessels = useMemo(() => vessels.map(v => ({
  ...v,
  pts: v.pts.filter(p => p.t <= now) // Strictly causal prefix slice up to 'now'
})), [vessels, now]);
const causalEpisodes = useMemo(() => detectCausal(causalVessels, base, cfg, now), [causalVessels, base, cfg, now]);`,
    fixedInTab: "mantavia",
  },
  {
    id: "BUG-02",
    severity: "high",
    repo: "hackreview",
    file: "src/components/IdeaWorkspace.tsx:20-60 & src/app/api/state/[slug]/route.ts",
    title: "Shared Debounce Timer Race Condition (Data Loss) & Unauthenticated DB Wipe",
    symptom:
      "Changing an idea's triage Status and then typing in the Notes box within 450ms silently drops the Status update. Furthermore, PUT /api/state/[slug] has zero authentication.",
    rootCause:
      "IdeaWorkspace.tsx uses a single timer.current ref. Every call to persist(partialPatch) clears the previous timer and schedules a fetch with ONLY the latest partialPatch rather than merging pending patches.",
    brokenCodeSnippet: `// BROKEN (hackreview/src/components/IdeaWorkspace.tsx)
function persist(patch: Partial<State>) {
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(() => {
    fetch(\`/api/state/\${slug}\`, { method: "PUT", body: JSON.stringify(patch) });
  }, 450); // Previous un-sent field changes are lost!
}`,
    fixedCodeSnippet: `// FIXED (Merged Pending Patch Queue + Local/Exportable Persistence)
function persist(patch: Partial<State>) {
  pendingPatch.current = { ...pendingPatch.current, ...patch };
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(() => {
    const payload = pendingPatch.current;
    pendingPatch.current = {};
    commitMergedState(slug, payload);
  }, 300);
}`,
    fixedInTab: "audit",
  },
  {
    id: "BUG-03",
    severity: "high",
    repo: "hack2ndrun",
    file: "src/previews/NexusGeo.tsx & hackideasreviewed/src/sim/geo.ts",
    title: "Circular Flat-Earth Monte Carlo & Shallow-Angle Horizon Conditioning Bias",
    symptom:
      "The Monte Carlo validation claims ~95% empirical coverage, but it samples synthetic perturbations from the exact same flat-earth Gaussian model used to compute the Jacobian ellipse, while silently dropping rays that miss the ground plane.",
    rootCause:
      "1) Ignores camera roll error, pixel click jitter, MAVLink frame timestamp lag, and DEM terrain elevation variations. 2) Dropping non-intersecting rays near the horizon truncates the long-range tail and understates along-range CEP.",
    brokenCodeSnippet: `// BROKEN (hack2ndrun/src/previews/NexusGeo.tsx)
// Samples from identical flat-earth model & skips missed rays
const hit = intersectFlatGround(perturbedPose);
if (!hit) continue; // Conditioning bias at shallow grazing angles!`,
    fixedCodeSnippet: `// FIXED (NexusTrustLineView.tsx - Independent Ground Truth Validator)
// Injects unmodeled DEM terrain undulation, roll jitter, and MAVLink frame latency
const trueTerrainHit = intersectDEMTerrain(truePose, demGrid, latencyOffsetMs);
const sigmaInflated = inflateCovarianceForStaleness(jacobianCov, telemetryAgeSec, osintWindAgeSec);`,
    fixedInTab: "nexus",
  },
  {
    id: "BUG-04",
    severity: "medium",
    repo: "hack2ndrun",
    file: "src/previews/GroundTruth.tsx:27 & hackreview/src/components/previews/SignalCheck.tsx",
    title: "False Sensor Independence (Counting Distinct Sensor IDs as Independent Corroboration)",
    symptom:
      "Two sensors mounted on the same Atech board, sharing one USB cable, one Raspberry Pi power supply, or one LoRa relay gateway are marked as 'INDEPENDENTLY CORROBORATED'.",
    rootCause:
      "Corroboration logic checks `presentSensorIds.size >= 2` instead of grouping sensors by Common-Cause Failure Group (power rail, backhaul link, modality, and spatial colocation).",
    brokenCodeSnippet: `// BROKEN (hack2ndrun/src/previews/GroundTruth.tsx)
const corroborated = presentSensorIds.size >= 2; // Two IDs on same hub != independent!`,
    fixedCodeSnippet: `// FIXED (BenchmarkTacticalView.tsx & NexusTrustLineView.tsx)
const independentGroups = new Set(
  validObservations.map(obs => \`\${obs.powerGroup}:\${obs.backhaulGroup}:\${obs.modality}\`)
);
const isTrulyCorroborated = independentGroups.size >= 2 && brierWeightedTrust >= 0.72;`,
    fixedInTab: "benchmark",
  },
  {
    id: "BUG-05",
    severity: "medium",
    repo: "hack2ndrun",
    file: "src/previews/Mantavia.tsx & hackideasreviewed/src/views/Sentinel.tsx",
    title: "Hand-Typed 'Real Drags Caught' Metric & Ground-Truth Contamination in Swarm Triage",
    symptom:
      "In hack2ndrun Mantavia, 13 vessels have hand-authored scores and the UI badge reads 'Real drags caught: 2/2', implying real AIS validation. In Sentinel, the triage policy inspects simulation truth properties if not carefully decoupled from noisy radar/acoustic/thermal observations.",
    rootCause:
      "Conflating synthetic unit-test fixtures with empirical performance, and lacking a multi-sensor observation confusion matrix (Radar RCS vs Acoustic harmonic vs Thermal EO signature).",
    brokenCodeSnippet: `// BROKEN (hack2ndrun/src/previews/Mantavia.tsx)
<Stat label="Real drags caught" value={\`\${caught}/2\`} /> // Misleading synthetic label`,
    fixedCodeSnippet: `// FIXED (Explicit Evidence Labels + Multi-Modal Sensor Confusion Matrix)
<Stat label="Planted Incident Lead Time (Sim)" value="+43 min pre-fault" badge="SYNTHETIC REPLAY" />`,
    fixedInTab: "phalanx",
  },
];

export const FACT_CHECKS: FactCheck[] = [
  {
    id: "FC-01",
    domain: "Mantavia AIS",
    claimInBriefOrApp: "Brief says: 'Bornholm cable incident of 28 February 2022 (tanker Samus Swan, anchor fouled the cable) at a few knots.'",
    verdict: "Corrected",
    verifiedReality:
      "Danish Maritime & Commercial High Court (Jul 2025 ruling) and Energinet/TGS 4C records confirm the Bornholm–Sweden MVAC cable tripped on 26 February 2022 at 06:17 CET (05:17 UTC), 17 km from Sweden. Crucially, Pole Star AIS showed Samus Swan transiting at ~9–10 knots (not 'a few knots'!) while dragging its starboard anchor & 110m chain.",
    source: "Danish Maritime Court (Sø- og Handelsretten) & Maritime Executive",
    sourceUrl: "https://maritime-executive.com/article/utility-sues-uni-tankers-over-severed-power-cable-to-bornholm",
    architecturalImpact:
      "A detector built on a simple low-speed gate (<4 kn) completely misses Samus Swan! You MUST detect relative speed drop vs. the vessel's own prior transit median + course-over-ground/heading crabbing + corridor crossing geometry, and prepare data for Feb 26–28, 2022.",
  },
  {
    id: "FC-02",
    domain: "Mantavia AIS",
    claimInBriefOrApp: "Recent Baltic cable cuts result in straightforward criminal convictions once AIS tracks are shown.",
    verdict: "Corrected",
    verifiedReality:
      "In Oct 2025, the Helsinki District Court dismissed criminal charges against the Eagle S crew on UNCLOS jurisdiction grounds (EEZ vs territorial waters), and in Jul 2025 the Danish court limited Uni-Tankers' liability for Samus Swan after finding ordinary rather than gross negligence.",
    source: "EJIL:Talk! & Danish Maritime Court 2025",
    sourceUrl: "https://www.ejiltalk.org/christmas-day-cable-cuts-in-the-baltic-sea/",
    architecturalImpact:
      "Strongly validates Mantavia's framing constraint: our UI must output 'Behavioural Episode for ISR Verification' with auditable kinematic/contextual reasons, NEVER automated attribution or 'Sabotage Verdict'.",
  },
  {
    id: "FC-03",
    domain: "Ukraine / Swarm",
    claimInBriefOrApp: "Standard RF jamming (EW) and pickup-truck machine-gun mobile fire groups remain sufficient against Shahed-136 and FPV drones.",
    verdict: "Corrected",
    verifiedReality:
      "By 2025–2026, Russia deployed: 1) Fiber-optic FPV drones (10–40 km spools) completely immune to RF jamming and invisible to RF spectrum detectors; 2) Shahed-136/238 cruising at 2,000–2,800m (above HMG ceiling) with 12-channel Kometa CRPA antennas and terminal vertical dives; 3) Wooden 'Parody' decoys with Luneberg lenses mimicking aircraft radar cross-sections alongside multi-role 'Gerbera' drones.",
    source: "ISW Technological Adaptations (Oct 2025) & ISIS Shahed Analysis (2026)",
    sourceUrl: "https://isis-online.org/isis-reports/monthly-analysis-of-russian-shahed-136-deployment-against-ukraine",
    architecturalImpact:
      "Air defense now hinges on acoustic/radar early detection (15–30 km out), decoy-vs-threat classification (preventing $9,000 Skynex rounds or SAMs from being wasted on $300 Parody decoys), and cueing $1,000–$2,500 AI/thermal interceptor drones (Sting, P1-SUN, Octopus).",
  },
  {
    id: "FC-04",
    domain: "Thermal ISP",
    claimInBriefOrApp: "hackreview claims its pipeline 'runs in ~640×4 = 2.5 KB of state on a real FPGA'.",
    verdict: "Nuanced / Caveat",
    verifiedReality:
      "While a 5-tap vertical filter needs 4 line buffers (~5.1 KB of uint16 BRAM at 640px width), percentile-based AGC and CLAHE require double-buffered histograms (or previous-frame quantile stats) plus bilateral weights. That is still tiny (~18–32 KB BRAM total, <2% of a Xilinx Artix-7 / Zynq-7020), which is a huge FPGA win—if stated accurately with exact bit-widths!",
    source: "Odd Systems 640×512 12µm 14-bit Challenge Spec",
    sourceUrl: "https://drive.google.com/file/d/1Z4FHhO6w2cMzRTY8cu92QtQUMSEsVYf1/view",
    architecturalImpact:
      "Provide an exact, honest FPGA BRAM + DSP48 + LUT resource breakdown showing line-streaming compatibility (1-frame statistical delay for temporal hysteresis AGC, 4-line rolling buffer for spatial detail).",
  },
  {
    id: "FC-05",
    domain: "Hardware / Atech",
    claimInBriefOrApp: "The owner's Atech boards, Raspberry Pi, LiteWing drone, and Go2 quadruped can form an autonomous LoRa/Meshtastic outdoor swarm out of the box.",
    verdict: "Corrected",
    verifiedReality:
      "Atech Frame 10 & Frame 2.1 are ESP32 modular boards that output newline-delimited JSON at 115200 baud over USB (offline) or via an Atech-hosted WebSocket over Wi-Fi. No LoRa radios, thermal cameras, or verified Go2 EDU ROS2 SDK access are confirmed in the photos.",
    source: "Atech Documentation & Hardware Photo Inspection",
    sourceUrl: "https://atech.dev/docs",
    architecturalImpact:
      "Use the Atech board + Button/LED/Display modules + Raspberry Pi over USB serial as a rock-solid, live physical 'BlindSpot / ProofLoop Edge Node' during the demo (unplug the cable live on stage to trigger FRESH → STALE → RECOVERED in Nexus/GTT), rather than risking an unverified drone flight.",
  },
];

export const CONSOLIDATED_IDEAS: ConsolidatedIdea[] = [
  {
    id: "WIN-01",
    name: "TRUSTLINE + GTT (Nexus Recon-to-Strike & Calibrated OSINT Extension)",
    origins: [
      "GeoClick (hackreview)",
      "NexusGeo (hack2ndrun)",
      "TrustLine (hackideasreviewed)",
      "OSINT Readiness Board (hackreview)",
      "SignalCheck / GroundTruth (hack2ndrun)",
      "Ground Truth Circle (benchmark repo)",
    ],
    track: "Intelic Nexus",
    recommendation: "Headline Winner",
    scores: {
      rubricFit: 9.8,
      weekendFeasibility: 9.0,
      liveDemoImpact: 9.6,
      differentiation: 9.5,
      ukraineRelevance: 9.7,
    },
    summary:
      "Solves Intelic Nexus Example Problems #2 and #3 in one cohesive operator extension: clicking a target in drone video projects a 3D DEM-intersected ground coordinate with a full covariance error ellipse (separating along-range vs. cross-range error and naming the dominant error source), dynamically inflated by telemetry/OSINT staleness and corroborated by Brier-calibrated Ground Truth Circle field spotters.",
    criticalFlawInOriginal:
      "Earlier GeoClick/NexusGeo versions used a flat-earth Jacobian validated against itself, ignored roll/terrain/latency, and separated OSINT readiness into a disconnected tab.",
    upgradedVersionInThisApp:
      "Unifies DEM-aware covariance propagation, independent Monte-Carlo verification with unmodeled terrain/roll noise, Brier-calibrated OSINT & hardware sensor corroboration (with Common-Cause Failure Groups), and bunker-grade Hold-to-Confirm + 5s Undo.",
    prototypeTab: "nexus",
  },
  {
    id: "WIN-02",
    name: "CABLEGUARD v2 (Causal Subsea Corridor Anomaly & Moving-Target ISR Router)",
    origins: [
      "CableWatch (hackreview)",
      "AIS Integrity Desk (hackreview)",
      "Mantavia / Lifeline Watch (hack2ndrun)",
      "CableGuard (hackideasreviewed)",
    ],
    track: "Mantavia AIS",
    recommendation: "Headline Winner",
    scores: {
      rubricFit: 9.7,
      weekendFeasibility: 9.2,
      liveDemoImpact: 9.3,
      differentiation: 9.4,
      ukraineRelevance: 8.8,
    },
    summary:
      "Detects anomalous anchor-dragging episodes over Baltic subsea cables from open AIS without speed-threshold alert fatigue, and schedules a single 1-hr endurance (25 m/s) ISR drone using moving-target vector interception and hard return-to-base fuel reserves.",
    criticalFlawInOriginal:
      "hack2ndrun used 13 hand-typed static vessels; hackideasreviewed leaked future full-day peak scores at tFirst and missed the 26 Feb 2022 Samus Swan 9–10 knot transit nuance in its explanation.",
    upgradedVersionInThisApp:
      "Strictly causal prefix-only episode detector (zero future leakage), AIS spoofing/jump sanitation gate, 26 Feb 2022 Samus Swan replay (+43m early warning before 05:17 UTC fault), 7-day false-alarm burden benchmark, and 7–16 Sep 2026 live judge blind spot-check runner with frozen config hash.",
    prototypeTab: "mantavia",
  },
  {
    id: "WIN-03",
    name: "CLEARHOT FPGA (Streaming 14-Bit to 8-Bit Microbolometer ISP Workbench)",
    origins: [
      "SteadyThermal (hackreview)",
      "ThermalLab (hackreview & hack2ndrun)",
      "ThermalTruth (hack2ndrun)",
      "ClearHot (hackideasreviewed)",
    ],
    track: "Thermal ISP",
    recommendation: "Headline Winner",
    scores: {
      rubricFit: 9.5,
      weekendFeasibility: 8.9,
      liveDemoImpact: 9.4,
      differentiation: 9.1,
      ukraineRelevance: 9.6,
    },
    summary:
      "Line-streaming 14-bit post-NUC (640×512, 12µm) to 8-bit white-hot thermal ISP designed specifically for low-cost night interceptor drones and observation turrets: Bad-Pixel & Column-FPN Destriping → Temporal Hysteresis Quantile AGC (anti-flicker, anti-washout) → Dual-Plateau Local Contrast → Edge-Preserving Bilateral Detail.",
    criticalFlawInOriginal:
      "hack2ndrun only ran on tiny 192×144 synthetic buffers; hackreview overstated FPGA memory as 2.5 KB without counting histogram double-buffering.",
    upgradedVersionInThisApp:
      "Supports drag-and-drop loading of real 640×512 uint16 little-endian .bin files directly in browser + realistic 14-bit Ukraine night-intercept scenarios (Shahed exhaust plume + cold cloud clutter + sky-to-ground pan), live temporal flicker meter, and exact FPGA BRAM/DSP48 line-streaming architecture calculator.",
    prototypeTab: "thermal",
  },
  {
    id: "WIN-04",
    name: "PHALANX / SENTINEL v2 (Counter-Shahed & Fiber-Optic Drone Swarm Red-Team Lab)",
    origins: [
      "Team's Own Challenge (Swarm Sim-to-Field Verification)",
      "Phalanx (Master Brief)",
      "Airbase Sentinel (hackideasreviewed)",
      "ProofLoop / Robot Evidence Lab (Master Brief)",
    ],
    track: "Independent / Open",
    recommendation: "Headline Winner",
    scores: {
      rubricFit: 9.4,
      weekendFeasibility: 8.7,
      liveDemoImpact: 9.7,
      differentiation: 9.8,
      ukraineRelevance: 10.0,
    },
    summary:
      "Directly implements the team's Own Challenge: an automated adversarial simulation-to-field stress-testing platform that pits mixed Russian drone waves (high-altitude Shahed-136, 550 km/h Geran-3 jets, Parody Luneberg radar decoys, Gerbera camera drones, fiber-optic FPVs) against layered acoustic/radar/EW and $1,500 thermal interceptor drones, automatically discovering failure boundaries and generating a buyer-ready Evidence Pack.",
    criticalFlawInOriginal:
      "A full CAD-to-autopilot-to-flight platform is impossible in 48 hours, and hackideasreviewed's Sentinel mixed simulation truth labels with sensor observations.",
    upgradedVersionInThisApp:
      "Scopes the 48-hour deliverable to the Automated Failure-Boundary Finder (binary search over EW Jamming × Decoy Ratio × Altitude) + Multi-Sensor Confusion Model (Radar RCS vs Acoustic vs Thermal) + Atech Hardware-in-the-Loop fault injection + Buyer Verification Report export.",
    prototypeTab: "phalanx",
  },
  {
    id: "WIN-05",
    name: "GROUND TRUTH TACTICAL (Benchmark Repo Adapted for Ukraine & Nexus C2)",
    origins: [
      "Ground Truth Circle (knarayanareddy/benchmark)",
      "BlindSpot (hackreview)",
      "SensorBridge (hackreview)",
      "Handover Under Pressure (hack2ndrun)",
      "Last Mile (hack2ndrun)",
    ],
    track: "Cross-Track / Benchmark",
    recommendation: "Merge as Core Module",
    scores: {
      rubricFit: 9.6,
      weekendFeasibility: 9.5,
      liveDemoImpact: 9.5,
      differentiation: 9.9,
      ukraineRelevance: 9.9,
    },
    summary:
      "Adapts your existing production-ready Ground Truth Circle repository (Brier-calibrated expert scoring, 3-tier anonymity OPSEC scrubbing, Sybil/collusion burst detection, and structured dissent synthesis) into a defense-grade decentralized acoustic/visual spotter & hardware edge-node verification layer.",
    criticalFlawInOriginal:
      "Previously sat in a separate humanitarian repository (benchmark) and was never connected to the EDTH Nexus, BlindSpot, or Ukraine mobile-fire-group acoustic/visual corroboration problem.",
    upgradedVersionInThisApp:
      "Demonstrates end-to-end how `scoring.ts`, `integrity.ts`, `scrub.ts`, and `synthesis.ts` from `benchmark` combine with your physical Atech + Raspberry Pi USB heartbeat node (`BlindSpot`) to prevent spoofed OSINT reports from misdirecting air defense or recon assets.",
    prototypeTab: "benchmark",
  },
];

export const HARDWARE_AUDIT: HardwareItem[] = [
  {
    name: "Atech Frame 10 & Frame 2.1 (ESP32 Modular Boards) + Button / 3×3 LED / Display Modules",
    status: "Confirmed Photo/Owner",
    whatItActuallyDoes:
      "Streams newline-delimited JSON events over USB Serial at 115200 baud (100% local/offline) and accepts JSON action commands to drive LEDs/displays.",
    weekendSweetSpot:
      "Use as a live physical 'BlindSpot / ProofLoop' field sensor node connected via USB to Raspberry Pi or Mac. Press physical button to inject field observation; unplug USB cable live on stage to demonstrate deterministic FRESH → STALE/UNKNOWN → RECOVERED transition with zero false 'All Clear'.",
    trapToAvoid:
      "Do NOT use Atech's browser Wi-Fi mode and call it 'offline tactical mesh'—it routes through an Atech-hosted cloud WebSocket gateway.",
  },
  {
    name: "Raspberry Pi 4 Model B + Breadboards + Relay/LCD/Potentiometer Kit",
    status: "Confirmed Photo/Owner",
    whatItActuallyDoes:
      "Linux edge gateway capable of running Python/Rust/Node, SQLite local store-and-forward log, and Tailscale client to bridge USB hardware straight into the hosted Intelic Nexus VM.",
    weekendSweetSpot:
      "Run the local store-and-forward daemon (`Last Mile` + `BlindSpot`) that buffers Atech serial events with hardware receive timestamps when upstream Tailscale/Nexus connection drops.",
    trapToAvoid:
      "Verify microSD OS boot and USB data cable before event day; keep Mac direct-USB fallback ready so a Pi power issue cannot break the demo.",
  },
  {
    name: "LiteWing Miniature ESP32-S3 Programmable Drone",
    status: "Confirmed Photo/Owner",
    whatItActuallyDoes:
      "Palm-sized open-hardware Wi-Fi quadrotor based on ESP32-S3 and Crazyflie-derived firmware.",
    weekendSweetSpot:
      "Bench-top read-only attitude/IMU telemetry source (pitch/roll gimbal proxy for TrustLine error ellipse reactivity) held in hand by the presenter!",
    trapToAvoid:
      "Wait! Holding the drone in your hand and tilting it live on stage to watch the Nexus ground-intersection error ellipse stretch and flip from 'STRIKE-READY' to 'NEEDS SECOND LOOK' is 100× safer and more dramatic than trying to fly an uncalibrated micro-drone in a crowded hackathon hall.",
  },
  {
    name: "Quadruped Robot (Resembles Unitree Go2) & 3D Printing Lab",
    status: "Unverified Model/Access",
    whatItActuallyDoes:
      "High-visibility physical robot platform, potentially Unitree Go2 Air/Pro/Edu.",
    weekendSweetSpot:
      "If only Air/Pro (no open ROS2/SDK), 3D-print a snap-on mount carrying the Atech board + Pi as an 'Autonomous Mobile Sentry Payload' (`ProofLoop`). If EDU SDK is available, stream read-only pose/battery into Nexus.",
    trapToAvoid:
      "Never promise autonomous quadruped navigation or SDK control until you verify whether it is the EDU edition and have network permissions.",
  },
];
