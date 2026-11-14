import React, { useState } from "react";
import {
  UKRAINE_NIGHTMARE_SCENARIOS,
  NEW_WINNING_IDEAS,
} from "../data/ukraineResearchData";
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle,
  Crosshair,
  ExternalLink,
  Flame,
  Lightbulb,
  Radar,
  Radio,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";

interface Props {
  onNavigateTab: (tab: string) => void;
}

export const UkraineFrontlineView: React.FC<Props> = ({ onNavigateTab }) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    UKRAINE_NIGHTMARE_SCENARIOS[0].id
  );
  const selectedScenario =
    UKRAINE_NIGHTMARE_SCENARIOS.find((s) => s.id === selectedScenarioId) ||
    UKRAINE_NIGHTMARE_SCENARIOS[0];

  const mapIdeaToTab = (id: string) => {
    switch (id) {
      case "IDEA-A":
        return "nexus";
      case "IDEA-B":
        return "benchmark";
      case "IDEA-C":
        return "mantavia";
      case "IDEA-D":
        return "thermal";
      case "IDEA-E":
        return "phalanx";
      default:
        return "nexus";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/25 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <Flame className="h-3.5 w-3.5" /> 2025–2026 Frontline Operational Intelligence
            </span>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Ukraine Frontline Realities: Russian Adaptations, Nightmare Scenarios & What Actually
              Works
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-300">
              Hackathon judges and frontline mentors immediately spot teams that pitch 2022-era ideas
              (like basic RF drone detectors or simple machine-gun pickup routing). By 2025–2026,
              the battlefield has shifted to{" "}
              <strong className="text-amber-300">
                10–40 km fiber-optic FPVs immune to EW
              </strong>
              ,{" "}
              <strong className="text-amber-300">
                2,800m high-altitude Shahed dives mixed with wooden Parody Luneberg radar decoys
              </strong>
              , and{" "}
              <strong className="text-emerald-300">
                $1,000–$2,500 AI/Thermal Interceptor Drones (Sting, P1-SUN, Octopus)
              </strong>{" "}
              cued by nationwide acoustic/radar meshes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-center">
              <div className="text-xl font-bold text-rose-400">8,161 / mo</div>
              <div className="text-[11px] text-slate-400">Peak Shahed+Decoy Wave (May 2026)</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-center">
              <div className="text-xl font-bold text-amber-400">20–40 km</div>
              <div className="text-[11px] text-slate-400">Fiber-Optic FPV Zero-RF Kill Zone</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-xl font-bold text-emerald-400">$1k–$2.5k</div>
              <div className="text-[11px] text-slate-400">Thermal Interceptor (Sting / P1-SUN)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Nightmare Scenario Explorer */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <AlertOctagon className="h-5 w-5 text-rose-400" />
          1. The 5 Frontline Nightmare Scenarios (Soldiers, Civilians & Critical Infrastructure)
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Select each operational threat vector to examine the latest Russian adaptation, why legacy
          defenses fail, what works right now on the frontline, and the exact software gap you can
          solve at the hackathon.
        </p>

        {/* Scenario Pills */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {UKRAINE_NIGHTMARE_SCENARIOS.map((scn, i) => {
            const active = scn.id === selectedScenario.id;
            return (
              <button
                key={scn.id}
                onClick={() => setSelectedScenarioId(scn.id)}
                className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                  active
                    ? "border-amber-400 bg-amber-500/10 shadow-lg"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-amber-400">
                    THREAT 0{i + 1}
                  </span>
                  <Radar className={`h-4 w-4 ${active ? "text-amber-400" : "text-slate-500"}`} />
                </div>
                <div className="mt-2 text-xs font-bold leading-snug text-white line-clamp-3">
                  {scn.title}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Scenario Deep Dive */}
        <div className="mt-6 rounded-xl border border-slate-700/80 bg-slate-950/90 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <span className="font-mono text-xs font-semibold text-amber-400">
                {selectedScenario.id} · {selectedScenario.timeframe}
              </span>
              <h4 className="mt-1 text-xl font-bold text-white">{selectedScenario.title}</h4>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/15 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
                <Crosshair className="h-4 w-4" /> Latest Russian Adaptation (2025–2026)
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-200">
                {selectedScenario.russianAdaptation}
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <AlertOctagon className="h-4 w-4" /> Nightmare Impact on Soldiers & Civilians
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-200">
                {selectedScenario.impactOnSoldiersAndCivilians}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                <XCircle className="h-4 w-4" /> What Currently Fails / Gets Outclassed
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                {selectedScenario.whatCurrentlyFails}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <CheckCircle className="h-4 w-4" /> Proposed methods (not independently verified)
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-200">
                {selectedScenario.whatActuallyWorksOnFrontline}
              </p>
            </div>
          </div>

          {/* Software Bottleneck & Hackathon Solution */}
          <div className="mt-4 grid gap-4 md:grid-cols-12">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 md:col-span-6">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <Radio className="h-4 w-4" /> The Unsolved Software / C2 Bottleneck
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-200">
                {selectedScenario.softwareAndSystemGap}
              </p>
            </div>
            <div className="rounded-xl border border-violet-500/40 bg-violet-950/25 p-4 md:col-span-6">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300">
                <Zap className="h-4 w-4" /> Winning Hackathon Solution Blueprint
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-100">
                {selectedScenario.hackathonSolutionBlueprint}
              </p>
            </div>
          </div>

          {/* Sources */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Source leads (claims not independently verified):</span>
            {selectedScenario.sources.map((src) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-cyan-400 hover:border-cyan-400"
              >
                {src.label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: 5 Synthesized Hackathon-Winning Blueprints */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <Lightbulb className="h-5 w-5 text-cyan-400" />
          2. Five Hackathon-Winning Project Architectures (Synthesizing Ukraine Realities + Sponsor
          Tracks + Your Hardware & Benchmark Repo)
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Each blueprint below merges the best modules from your earlier repositories with real
          2025–2026 operational bottlenecks and links to a related simulated interface, not necessarily an implemented prototype.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {NEW_WINNING_IDEAS.map((idea) => (
            <div
              key={idea.id}
              className="flex flex-col justify-between rounded-xl border border-slate-700/80 bg-slate-950/80 p-5 transition hover:border-cyan-400/50"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded bg-cyan-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-300">
                    {idea.codename}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                      Feasibility: {idea.feasibilityScore}/10
                    </span>
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                      Impact: {idea.impactScore}/10
                    </span>
                  </div>
                </div>

                <h4 className="mt-2.5 text-lg font-bold text-white">{idea.title}</h4>
                <div className="mt-1 text-xs font-medium text-cyan-400">{idea.targetTrack}</div>

                <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs font-medium italic text-slate-200">
                  “{idea.oneLinePitch}”
                </p>

                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <strong className="text-amber-300">Ukraine Battlefield Problem Solved: </strong>
                    <span className="text-slate-300">{idea.ukraineProblemSolved}</span>
                  </div>
                  <div>
                    <strong className="text-emerald-300">Why Judges Pick This to Win: </strong>
                    <span className="text-slate-300">{idea.whyJudgesPickIt}</span>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-bold text-slate-200">
                    48-Hour Implementation Plan:
                  </div>
                  <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
                    {idea.weekendArchitecture.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="mt-0.5 font-mono text-[10px] font-bold text-cyan-400">
                          0{idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {idea.hardwareAndBenchmarkTieIn}
                </span>
                <button
                  onClick={() => onNavigateTab(mapIdeaToTab(idea.id))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                >
                  Interact with Live Prototype <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
