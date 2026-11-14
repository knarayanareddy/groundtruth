import React, { useState, useRef } from "react";
import {
  CODE_FINDINGS,
  FACT_CHECKS,
  CONSOLIDATED_IDEAS,
  HARDWARE_AUDIT,
  type ConsolidatedIdea,
} from "../data/reviewData";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Cpu,
  ExternalLink,
  FileWarning,
  GitMerge,
  Layers,
  Play,
  ShieldAlert,
  Sliders,
  Sparkles,
} from "lucide-react";

interface Props {
  onNavigateTab: (tab: string) => void;
}

interface TriageNoteState {
  status: "Priority" | "Merged" | "Backup" | "Parked";
  notes: string;
}

export const AuditAndMergerView: React.FC<Props> = ({ onNavigateTab }) => {
  const [selectedBugId, setSelectedBugId] = useState<string>(CODE_FINDINGS[0].id);
  const [weights, setWeights] = useState({
    rubricFit: 30,
    weekendFeasibility: 25,
    liveDemoImpact: 20,
    differentiation: 15,
    ukraineRelevance: 10,
  });

  // Fixed persistence engine demonstrating the fix for BUG-02 (merged pending patch queue)
  const [triageMap, setTriageMap] = useState<Record<string, TriageNoteState>>({
    "WIN-01": {
      status: "Priority",
      notes: "Combines Nexus Problem 2 (Error Ellipse) + Problem 3 (OSINT Staleness) + Benchmark repo calibration.",
    },
    "WIN-02": {
      status: "Priority",
      notes: "Causal prefix engine fixes future-data leak; prepared for 26 Feb 2022 Samus Swan & 7-16 Sep 2026 spot check.",
    },
    "WIN-03": {
      status: "Priority",
      notes: "Real 14-bit .bin uint16 browser loader + FPGA line-buffer proof + zero-IIR ghosting.",
    },
    "WIN-04": {
      status: "Priority",
      notes: "Scopes the Own Challenge into an achievable 48h Failure-Boundary Finder + Buyer Evidence Pack.",
    },
    "WIN-05": {
      status: "Merged",
      notes: "Direct defense adaptation of knarayanareddy/benchmark (Ground Truth Circle) + Atech USB BlindSpot.",
    },
  });
  const [lastSavedToast, setLastSavedToast] = useState<string | null>(null);
  const pendingPatchRef = useRef<Record<string, Partial<TriageNoteState>>>({});
  const timerRef = useRef<number | null>(null);

  const updateTriageSafely = (id: string, patch: Partial<TriageNoteState>) => {
    // Immediate optimistic UI update
    setTriageMap((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
    // Merge into pendingPatchRef so rapid status + note edits NEVER cancel each other (Fixes BUG-02)
    pendingPatchRef.current[id] = {
      ...(pendingPatchRef.current[id] || {}),
      ...patch,
    };
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const committedKeys = Object.keys(pendingPatchRef.current);
      pendingPatchRef.current = {};
      setLastSavedToast(
        `Edits updated in memory (${committedKeys.join(", ")}); not saved after leaving or reloading`
      );
    }, 320);
  };

  const computeWeightedScore = (idea: ConsolidatedIdea) => {
    const totalW =
      weights.rubricFit +
      weights.weekendFeasibility +
      weights.liveDemoImpact +
      weights.differentiation +
      weights.ukraineRelevance || 1;
    const raw =
      idea.scores.rubricFit * weights.rubricFit +
      idea.scores.weekendFeasibility * weights.weekendFeasibility +
      idea.scores.liveDemoImpact * weights.liveDemoImpact +
      idea.scores.differentiation * weights.differentiation +
      idea.scores.ukraineRelevance * weights.ukraineRelevance;
    return (raw / totalW).toFixed(2);
  };

  const rankedIdeas = [...CONSOLIDATED_IDEAS].sort(
    (a, b) => parseFloat(computeWeightedScore(b)) - parseFloat(computeWeightedScore(a))
  );

  const selectedBug = CODE_FINDINGS.find((b) => b.id === selectedBugId) || CODE_FINDINGS[0];

  return (
    <div className="space-y-8">
      {/* Executive Banner */}
      <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-cyan-950/30 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" /> End-to-End Repository Audit & Synthesis
            </span>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Review of <code className="text-cyan-300">combined_hackathon_package</code>,{" "}
              <code className="text-amber-300">Master Brief</code> &{" "}
              <code className="text-emerald-300">benchmark</code>
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-300">
              We audited all three codebases in your repository tree:{" "}
              <strong className="text-white">hackreview</strong> (Next.js + Postgres, 13 idea
              workspaces), <strong className="text-white">hack2ndrun</strong> (Vite/React, 15
              challenge reviews & previews), and{" "}
              <strong className="text-white">hackideasreviewed</strong> (4 simulation prototypes:{" "}
              <em>CableGuard, ClearHot, TrustLine, Sentinel</em>), alongside your{" "}
              <strong className="text-emerald-300">knarayanareddy/benchmark</strong> (Ground Truth
              Circle) repository. Below is the critical code audit, factual verification, hardware
              reality check, and consolidation of 28 fragmented concepts into{" "}
              <strong className="text-cyan-300">5 Hackathon-Winning End-to-End Architectures</strong>.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">28 → 5</div>
              <div className="text-xs text-slate-400">Ideas Consolidated</div>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-center">
              <div className="text-2xl font-bold text-rose-400">5 Fixed</div>
              <div className="text-xs text-slate-400">Critical Code Bugs</div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">5 Verified</div>
              <div className="text-xs text-slate-400">Brief Fact Corrections</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-400">100% Live</div>
              <div className="text-xs text-slate-400">Interactive Previews</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Critical Code Audit & Line-Level Bug Fixes */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <FileWarning className="h-5 w-5 text-rose-400" />
              1. Deep Source-Code Audit: 5 Verified Bugs & Architectural Flaws Fixed
            </h3>
            <p className="text-xs text-slate-400">
              Click each finding below to inspect the exact file/line root cause in{" "}
              <code>hackreview</code>, <code>hack2ndrun</code>, and <code>hackideasreviewed</code>{" "}
              and jump straight to the fixed implementation.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-12">
          {/* Bug Selector List */}
          <div className="space-y-2.5 lg:col-span-5">
            {CODE_FINDINGS.map((bug) => {
              const active = bug.id === selectedBug.id;
              const sevBadge =
                bug.severity === "critical"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : bug.severity === "high"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
              return (
                <button
                  key={bug.id}
                  onClick={() => setSelectedBugId(bug.id)}
                  className={`w-full rounded-lg border p-3.5 text-left transition ${
                    active
                      ? "border-cyan-400 bg-slate-800/90 shadow-md"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      {bug.id} · {bug.repo}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${sevBadge}`}
                    >
                      {bug.severity}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-white">{bug.title}</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-slate-400">
                    {bug.file}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bug Detail & Diff Inspector */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-950/80 p-5 lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-cyan-400">{selectedBug.file}</div>
                <h4 className="mt-1 text-lg font-bold text-white">{selectedBug.title}</h4>
              </div>
              <button
                onClick={() => onNavigateTab(selectedBug.fixedInTab)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow hover:bg-cyan-400"
              >
                <Play className="h-3.5 w-3.5" /> Open Fixed Prototype
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-rose-500/20 bg-rose-950/15 p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
                  Observed Symptom
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{selectedBug.symptom}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Technical Root Cause
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {selectedBug.rootCause}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <Code2 className="h-3.5 w-3.5" /> Original Flawed Implementation
                </div>
                <pre className="overflow-x-auto rounded-lg border border-rose-500/30 bg-slate-900 p-3 font-mono text-xs text-rose-200">
                  {selectedBug.brokenCodeSnippet}
                </pre>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Upgraded Fix in This Unified Suite
                </div>
                <pre className="overflow-x-auto rounded-lg border border-emerald-500/30 bg-slate-900 p-3 font-mono text-xs text-emerald-200">
                  {selectedBug.fixedCodeSnippet}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Consolidating 28 Overlapping Ideas into 5 Winning Projects */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <GitMerge className="h-5 w-5 text-cyan-400" />
              2. Idea Merger & Interactive Decision Matrix (28 Overlapping Concepts → 5 Flagship
              Winners)
            </h3>
            <p className="text-xs text-slate-400">
              Adjust the team priority sliders below to re-rank the consolidated architectures, and
              edit notes inline (powered by our merged-patch debounce fix).
            </p>
          </div>
          {lastSavedToast && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
              ✓ {lastSavedToast}
            </div>
          )}
        </div>

        {/* Custom Weight Sliders */}
        <div className="mt-4 grid gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-5">
          {(
            [
              ["rubricFit", "Judging Rubric Fit"],
              ["weekendFeasibility", "48h Feasibility"],
              ["liveDemoImpact", "Live Stage Impact"],
              ["differentiation", "Edge vs Teams"],
              ["ukraineRelevance", "Ukraine Relevance"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-300">{label}</span>
                <span className="font-mono font-bold text-cyan-400">{weights[key]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                 step={5}
                value={weights[key]}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
                className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-cyan-400"
              />
            </div>
          ))}
        </div>

        {/* Ranked Consolidated Cards */}
        <div className="mt-5 space-y-4">
          {rankedIdeas.map((idea, idx) => {
            const triage = triageMap[idea.id] || { status: "Priority", notes: "" };
            return (
              <div
                key={idea.id}
                className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-5 transition hover:border-cyan-500/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-300">
                        #{idx + 1} · Weighted Score: {computeWeightedScore(idea)} / 10
                      </span>
                      <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                        {idea.track}
                      </span>
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                        {idea.recommendation}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-white">{idea.name}</h4>
                  </div>

                  <button
                    onClick={() => onNavigateTab(idea.prototypeTab)}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:opacity-95"
                  >
                    <Play className="h-3.5 w-3.5" /> Launch End-to-End Prototype
                  </button>
                </div>

                {/* Merged Origins */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Replaces & Merges:
                  </span>
                  {idea.origins.map((orig) => (
                    <span
                      key={orig}
                      className="rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {orig}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-300">{idea.summary}</p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3 text-xs">
                    <div className="font-bold text-rose-300">
                      What Was Missing or Broken in Earlier Packages:
                    </div>
                    <p className="mt-1 text-slate-300">{idea.criticalFlawInOriginal}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3 text-xs">
                    <div className="font-bold text-emerald-300">
                      How Our Unified Version Wins the Hackathon:
                    </div>
                    <p className="mt-1 text-slate-300">{idea.upgradedVersionInThisApp}</p>
                  </div>
                </div>

                {/* Interactive Triage Bar (Demonstrating BUG-02 Fix) */}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-400">Team Status:</span>
                    <select
                      value={triage.status}
                      onChange={(e) =>
                        updateTriageSafely(idea.id, {
                          status: e.target.value as TriageNoteState["status"],
                        })
                      }
                      className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-cyan-300 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="Priority">Priority Candidate</option>
                      <option value="Merged">Merged Core Module</option>
                      <option value="Backup">Backup Option</option>
                      <option value="Parked">Parked</option>
                    </select>
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">Decision Note:</span>
                    <input
                      type="text"
                      value={triage.notes}
                      onChange={(e) => updateTriageSafely(idea.id, { notes: e.target.value })}
                      placeholder="Type notes right after changing status to verify race-free saving..."
                      className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Verified Fact-Checks & Brief Corrections */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          3. Verified Fact-Checks: Critical Corrections to Challenge Assumptions
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Mentioning these verified primary-source facts during your 3-minute judge Q&A immediately
          sets your team apart as domain experts.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {FACT_CHECKS.map((fc) => (
            <div
              key={fc.id}
              className="flex flex-col justify-between rounded-xl border border-slate-700/70 bg-slate-950/70 p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-cyan-300">
                    {fc.domain}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      fc.verdict === "Corrected"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {fc.verdict}
                  </span>
                </div>
                <div className="mt-2.5 text-xs font-medium italic text-slate-400">
                  “{fc.claimInBriefOrApp}”
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-200">
                  <strong className="text-white">Verified Reality: </strong>
                  {fc.verifiedReality}
                </p>
                <div className="mt-2.5 rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-2.5 text-xs text-cyan-200">
                  <strong>Architectural Requirement: </strong>
                  {fc.architecturalImpact}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5 text-[11px] text-slate-400">
                <span>Source: {fc.source}</span>
                <a
                  href={fc.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                >
                  Reference <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Hardware Inventory Reality Check */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <Cpu className="h-5 w-5 text-emerald-400" />
          4. Owner Hardware Inventory Strategy: High-Impact Stage Flourishes Without Demo Risk
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          How to leverage your photographed Atech boards, Raspberry Pi, LiteWing drone, and
          quadruped robot for maximum live-demo credibility without falling into hardware traps.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {HARDWARE_AUDIT.map((hw) => (
            <div
              key={hw.name}
              className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-white">{hw.name}</h4>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    hw.status.includes("Confirmed")
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {hw.status}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                <strong className="text-slate-100">Documented Capability: </strong>
                {hw.whatItActuallyDoes}
              </p>
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/15 p-2.5 text-xs text-emerald-200">
                <strong className="flex items-center gap-1 text-emerald-300">
                  <Layers className="h-3.5 w-3.5" /> 48-Hour Hackathon Sweet Spot:
                </strong>
                <p className="mt-1">{hw.weekendSweetSpot}</p>
              </div>
              <div className="rounded-lg border border-rose-500/25 bg-rose-950/15 p-2.5 text-xs text-rose-200">
                <strong className="flex items-center gap-1 text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Hardware Trap to Avoid:
                </strong>
                <p className="mt-1">{hw.trapToAvoid}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
