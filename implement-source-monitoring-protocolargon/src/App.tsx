import React, { useState } from 'react';
import { AuditAndMergerView } from './components/AuditAndMergerView';
import { UkraineFrontlineView } from './components/UkraineFrontlineView';
import { GroundTruthBlindSpotView } from './components/GroundTruthBlindSpotView';
import { NexusTrustLineView } from './components/NexusTrustLineView';
import { MantaviaCableGuardView } from './components/MantaviaCableGuardView';
import { ThermalClearHotView } from './components/ThermalClearHotView';
import { PhalanxSwarmView } from './components/PhalanxSwarmView';

type Id = 'nexus' | 'fiber' | 'mantavia' | 'thermal' | 'phalanx' | 'benchmark';
type Step = 'problem' | 'solution' | 'preview';
type Idea = {
  id: Id;
  name: string;
  tag: string;
  short: string;
  problem: string;
  consequence: string;
  solution: string;
  outcome: string;
  steps: { title: string; detail: string }[];
  preview: string;
  limits: string;
  roles: string;
};

const IDEAS: Idea[] = [
  {
    id: 'benchmark',
    name: 'GROUND TRUTH + BLINDSPOT',
    tag: 'LOCAL-FIRST · SOURCE & UNCERTAINTY MONITOR',
    short:
      'Replay timestamped synthetic or imported events to inspect heartbeat freshness, observation age, shared dependencies, and comparable report disagreement.',
    problem:
      'Reports can conflict, share upstream failure points, arrive late as historical backfills, or stop arriving; silence is easily mistaken for a clear scene.',
    consequence:
      'Two source IDs are not necessarily independent, a recent backfill is not a current heartbeat, and a fresh heartbeat does not prove sensor accuracy or safety.',
    solution:
      'Provide a deterministic local-first replay dashboard that separates packet receipt time, heartbeat freshness, and source observation time, surfaces declared dependency overlap, and highlights comparable disagreements without picking a winner.',
    outcome:
      'A reproducible software prototype for reviewing observation-system uncertainty locally, with all-or-nothing JSON import/export and portable automated tests.',
    steps: [
      {
        title: '01 · Replay & Separate Timings',
        detail:
          'Step, play, or seek across virtual time T. Track last packet received, last heartbeat received, and claimed source observation time independently.',
      },
      {
        title: '02 · Inspect Dependencies & Disagreement',
        detail:
          'Review declared shared dependencies (such as gateway-1), unknown declarations, and explicitly comparable observation disagreements without numeric trust or Brier scores.',
      },
      {
        title: '03 · Export & Reproduce Locally',
        detail:
          'Record plain-text reviewer notes, export a versioned JSON bundle, and reimport in a clean session to reproduce identical causal transitions.',
      },
    ],
    preview:
      'Dedicated Ground Truth + BlindSpot deterministic source monitoring and uncertainty-review workbench (replaces the removed legacy scripted panel).',
    limits:
      'All example data is synthetic or user-provided, never automatically verified. A fresh heartbeat only indicates recent packet receipt, not calibrated sensor operation or a safe area. Non-overlapping dependency labels do not prove independence. No physical hardware, live detection, privacy anonymizer, or Nexus link is connected.',
    roles: 'uncertainty UX · deterministic replay · dependency analysis · testing',
  },
  {
    id: 'nexus',
    name: 'TRUSTLINE + AEGIS-LITE',
    tag: 'NEXUS · OPERATOR WORKFLOW',
    short: 'Turn a video click into a reviewable observation, with uncertainty visible.',
    problem:
      'A single map pin can look precise even when the camera angle, position or timing is uncertain.',
    consequence:
      'A teammate reviewing the observation may not see why it could be wrong or how stale data changes the picture.',
    solution:
      'Show an illustrative uncertainty envelope and its contributing assumptions before a person confirms a simulated handoff.',
    outcome:
      'A safer conversation about evidence quality, not a certified geolocation or live Nexus integration.',
    steps: [
      {
        title: '01 · Observe',
        detail:
          'Select or click a position in a simulated video frame. Camera and aircraft settings describe a simplified scene.',
      },
      {
        title: '02 · Examine uncertainty',
        detail:
          'Change pitch, latency, terrain uncertainty or simulated GNSS alert and see the model’s envelope respond.',
      },
      {
        title: '03 · Human review',
        detail:
          'Explore the mock confirm / undo flow. It does not send a message to Nexus or control a device.',
      },
    ],
    preview: 'The original TrustLine geometry and handoff interface.',
    limits:
      'Flat-ground analytical approximation and synthetic perturbations, not a DEM intersection or independent field validation. Coverage and “95%” labels are model outputs, not demonstrated accuracy; thresholds are arbitrary. Do not use for real-world targeting or navigation.',
    roles: 'UI/UX · geometry · integration · testing',
  },
  {
    id: 'fiber',
    name: 'FIBER-WATCH & STING-CUE',
    tag: 'CONCEPT · MULTI-SENSOR DISSENT',
    short: 'Surface disagreements between information sources rather than hiding uncertainty.',
    problem:
      'A sensor that does not report a signal is not proof that nothing is present. Sources may also disagree or share failure points.',
    consequence:
      'A dashboard can confuse missing data, correlated reports and confident classification.',
    solution:
      'Explore an operator-facing dissent card that keeps observations, source freshness and common-cause dependencies visible.',
    outcome:
      'This is a proposed verification workflow; absence of RF does not establish the presence or type of a drone.',
    steps: [
      {
        title: '01 · Collect',
        detail:
          'Inspect timestamped synthetic source heartbeats and categorical observations with explicit comparison keys.',
      },
      {
        title: '02 · Compare',
        detail:
          'Evaluate explicit comparison rules, clock quality, and declared shared dependencies without selecting an automatic winner.',
      },
      {
        title: '03 · Review',
        detail:
          'A human reviews conflicting claims and missing telemetry; no detection or interceptor system is implemented.',
      },
    ],
    preview:
      'Mounts the new Ground Truth + BlindSpot source monitoring and disagreement workbench. There is no dedicated Fiber-Watch detector or field sensor.',
    limits:
      'All example data is synthetic. Absence of a report is not negative evidence about the environment. No acoustic, radar, RF, or field hardware data is connected.',
    roles: 'sensor integration · uncertainty UX · evaluation',
  },
  {
    id: 'mantavia',
    name: 'CABLEGUARD CAUSAL',
    tag: 'MANTAVIA · MARITIME REVIEW',
    short: 'Turn vessel behavior near cables into episodes for human verification.',
    problem:
      'AIS traffic near subsea infrastructure is noisy; a simple slow-speed alert can overwhelm reviewers or miss relevant behavior.',
    consequence:
      'The difficult question is which episodes merit limited inspection attention without claiming that AIS proves intent or damage.',
    solution:
      'Use a time-scrubbable, prefix-based prototype to explore behavior scoring and an illustrative single-asset inspection plan.',
    outcome:
      'A testable analyst workflow: generate review candidates, inspect context, measure lead time and alert burden on real held-out data.',
    steps: [
      {
        title: '01 · Observe',
        detail:
          'Move the time slider across fabricated vessel positions. The episode calculation uses the displayed prefix for its main score.',
      },
      {
        title: '02 · Prioritize',
        detail:
          'Toy speed-change, heading difference and proximity rules produce ranked review candidates—not verdicts.',
      },
      {
        title: '03 · Verify',
        detail:
          'Review an illustrative route and weekly table. A real replay, surrounding-week evaluation and blind-date test still need AIS and validated labels.',
      },
    ],
    preview: 'The original CableGuard timeline, synthetic routes, and synthetic date picker.',
    limits:
      'All tracks, event timings and weekly counts are fabricated; the date selector does not load AIS or Parquet. The comparison deliberately shows a fabricated future-score demonstration. Route uses a fixed assumed vessel direction, not an operational flight plan. First-anomaly time is not necessarily first ISR cue.',
    roles: 'data engineering · maritime analyst · evaluation · map UX',
  },
  {
    id: 'thermal',
    name: 'CLEARHOT STREAM-14',
    tag: 'THERMAL · IMAGE PROCESSING',
    short: 'Explore how raw thermal imagery becomes a more readable 8-bit display.',
    problem:
      'High-dynamic-range thermal frames can look flat or flicker when a hot object dominates a simple display stretch.',
    consequence:
      'Operators may lose useful scene detail; improving contrast can also introduce artifacts or suppress real objects.',
    solution:
      'Compare a basic display with an experimental multi-stage processing pipeline and adjust its settings.',
    outcome:
      'A practical visual workbench and a hypothesis for an eventual FPGA design—not hardware proof or challenge validation.',
    steps: [
      {
        title: '01 · Input',
        detail:
          'Play a synthetic sequence or upload a local headerless 640 × 512 little-endian uint16 .bin file.',
      },
      {
        title: '02 · Process',
        detail:
          'Toggle illustrative bad-pixel correction, contrast adjustment and spatial detail, then move the before / after wipe.',
      },
      {
        title: '03 · Evaluate',
        detail:
          'Inspect the browser image and timing; independently test full-resolution quality, artifacts, throughput and FPGA resources.',
      },
    ],
    preview: 'The existing interactive canvas and local file loader.',
    limits:
      'Rendering samples at 320 × 256 and timing is browser-specific. Files are loaded into memory (200 MiB cap). No full challenge-data test, 25 fps proof, synthesis or validated FPGA resource estimate.',
    roles: 'image processing · FPGA/embedded · evaluation',
  },
  {
    id: 'phalanx',
    name: 'PHALANX RED-TEAM LAB',
    tag: 'INDEPENDENT · ROBOT TESTING',
    short: 'Explore failure conditions before trusting a robotic system.',
    problem:
      'A robotics demo that works in ideal conditions does not tell a team what happens when communication or sensors degrade.',
    consequence:
      'Teams and potential buyers need reproducible tests and evidence, not just a successful highlight reel.',
    solution:
      'Explore a toy adversarial scenario and vary simulated communication degradation, decoy mix and resource count.',
    outcome:
      'The broader opportunity is a repeatable simulation-to-field evidence workflow; this preview only illustrates the idea.',
    steps: [
      {
        title: '01 · Configure',
        detail: 'Choose a toy policy and adjust the synthetic scenario variables.',
      },
      {
        title: '02 · Stress',
        detail:
          'Watch deterministic simulated entities and inspect a separately calculated heuristic grid.',
      },
      {
        title: '03 · Document',
        detail:
          'Open the illustrative summary. A real evidence pack requires instrumented experiments, recorded test runs and independent review.',
      },
    ],
    preview: 'The original simplified swarm simulation, heuristic grid and summary modal.',
    limits:
      'The grid uses a hand-written formula, not multi-seed runs, Wilson intervals or a safety boundary. The modal is not a certificate, signed export, hardware-in-the-loop test or buyer validation. Do not use operationally.',
    roles: 'robotics · simulation · hardware · validation',
  },
];

const warnings: Record<Id, string> = {
  benchmark: IDEAS[0].limits,
  nexus: IDEAS[1].limits,
  fiber: IDEAS[2].limits,
  mantavia: IDEAS[3].limits,
  thermal: IDEAS[4].limits,
  phalanx: IDEAS[5].limits,
};

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="rounded-2xl border border-amber-400/35 bg-amber-950/30 p-4 text-sm leading-relaxed text-amber-100"
    >
      <strong className="text-amber-300">Evidence boundary · </strong>
      {children}
    </div>
  );
}

export function App() {
  // Default directly to Ground Truth + BlindSpot ('benchmark') interactive workbench ('preview')
  const [id, setId] = useState<Id>('benchmark');
  const [step, setStep] = useState<Step>('preview');
  const [detail, setDetail] = useState(0);
  const [library, setLibrary] = useState<'audit' | 'ukraine' | null>(null);

  const idea = IDEAS.find((i) => i.id === id)!;

  const go = (next: Id, st: Step = next === 'benchmark' ? 'preview' : 'problem') => {
    setId(next);
    setStep(st);
    setDetail(0);
    setLibrary(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nav = (tab: string) => {
    if (tab === 'audit' || tab === 'ukraine') {
      setLibrary(tab);
      window.scrollTo(0, 0);
    } else if (IDEAS.some((i) => i.id === tab)) {
      go(tab as Id, 'preview');
    }
  };

  return (
    <div className="min-h-screen bg-[#07111e] text-slate-100">
      <header className="border-b border-slate-800 bg-[#091827]">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.25em] text-teal-300">
                Ground Truth + BlindSpot · Local-First Prototype
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Source Availability, Timing & Uncertainty Review
              </h1>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                Deterministic synthetic/imported event replay · Heartbeat vs. observation timing ·
                Declared dependency overlap & comparable report disagreement
              </p>
            </div>
            <span className="rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1.5 text-xs text-teal-200">
              Synthetic & local-only · Not verified hardware or field detection
            </span>
          </div>

          <nav
            aria-label="Choose an idea"
            className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          >
            {IDEAS.map((it, i) => (
              <button
                key={it.id}
                type="button"
                data-testid={`nav-idea-${it.id}`}
                onClick={() => go(it.id)}
                aria-pressed={!library && id === it.id}
                className={
                  'rounded-xl border px-3 py-2.5 text-left transition ' +
                  (!library && id === it.id
                    ? 'border-teal-300 bg-teal-400/10 text-white'
                    : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500')
                }
              >
                <span className="block text-[10px] font-bold uppercase tracking-widest text-teal-400">
                  {it.id === 'benchmark' ? 'Primary Prototype' : `Concept 0${i + 1}`}
                </span>
                <span className="mt-0.5 block text-xs font-bold leading-snug">{it.name}</span>
              </button>
            ))}
          </nav>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => nav('audit')}
              className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-teal-300"
            >
              Original package review (archived context)
            </button>
            <button
              type="button"
              onClick={() => nav('ukraine')}
              className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-teal-300"
            >
              Original research & idea explorer (archived context)
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {library ? (
          <>
            <Banner>
              The original{' '}
              {library === 'audit'
                ? 'review and rankings are author assertions, not independently verified fixes; edits exist only in memory and are lost when leaving this view.'
                : 'research explorer contains unverified and possibly outdated operational claims and predictions. Links are leads, not proof of every statement; independently check each claim.'}{' '}
              Scores and suggestions are subjective. Prototypes are not deployed capabilities.
            </Banner>
            <div className="mt-6 min-w-0 overflow-x-auto">
              {library === 'audit' ? (
                <AuditAndMergerView onNavigateTab={nav} />
              ) : (
                <UkraineFrontlineView onNavigateTab={nav} />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[.2em] text-teal-300">{idea.tag}</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
                  {idea.name}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">
                  {idea.short}
                </p>
              </div>
              <div className="text-xs text-slate-400">
                Focus: <span className="text-slate-200">{idea.roles}</span>
              </div>
            </div>

            <div className="my-4 grid grid-cols-3 gap-2" aria-label="Presentation steps">
              {(['problem', 'solution', 'preview'] as Step[]).map((s, i) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`step-tab-${s}`}
                  onClick={() => setStep(s)}
                  aria-pressed={step === s}
                  className={
                    'rounded-xl border px-3 py-2.5 text-left text-xs font-bold sm:text-sm ' +
                    (step === s
                      ? 'border-teal-300 bg-teal-400/15 text-white'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white')
                  }
                >
                  <span className="mr-2 text-teal-400">0{i + 1}</span>
                  {s === 'problem'
                    ? 'The problem'
                    : s === 'solution'
                    ? 'The solution'
                    : 'Interactive prototype'}
                </button>
              ))}
            </div>

            {step === 'problem' && (
              <section className="grid gap-5 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-6 sm:p-9 lg:col-span-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-rose-300">
                    01 / Why this matters
                  </span>
                  <h3 className="mt-5 text-2xl font-bold leading-tight text-white sm:text-4xl">
                    {idea.problem}
                  </h3>
                  <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
                    {idea.consequence}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('solution')}
                    className="mt-8 rounded-xl bg-teal-300 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-200"
                  >
                    See the solution →
                  </button>
                </div>
                <aside className="rounded-2xl border border-slate-700 bg-slate-900 p-6 lg:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-teal-300">
                    The opportunity
                  </p>
                  <p className="mt-4 text-lg leading-relaxed text-slate-200">{idea.outcome}</p>
                  <div className="mt-8 border-t border-slate-700 pt-5 text-sm leading-relaxed text-slate-400">
                    Use this slide to align on the problem first. Then explore the proposed
                    approach and its real implementation limits.
                  </div>
                </aside>
              </section>
            )}

            {step === 'solution' && (
              <section className="space-y-5">
                <div className="rounded-2xl border border-teal-400/25 bg-gradient-to-br from-teal-950/35 to-slate-900 p-6 sm:p-8">
                  <span className="text-xs font-bold uppercase tracking-widest text-teal-300">
                    02 / Proposed solution
                  </span>
                  <h3 className="mt-4 max-w-4xl text-2xl font-bold leading-tight sm:text-3xl">
                    {idea.solution}
                  </h3>
                  <p className="mt-3 text-sm text-slate-300">{idea.outcome}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {idea.steps.map((d, i) => (
                    <button
                      key={d.title}
                      type="button"
                      aria-pressed={detail === i}
                      onClick={() => setDetail(i)}
                      className={
                        'rounded-xl border p-5 text-left ' +
                        (detail === i
                          ? 'border-teal-300 bg-teal-400/10'
                          : 'border-slate-700 bg-slate-900 hover:border-slate-500')
                      }
                    >
                      <span className="text-base font-bold text-white">{d.title}</span>
                      <span className="mt-2 block text-xs text-teal-300">
                        {detail === i ? 'Selected' : 'Click to explore'}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  aria-live="polite"
                  className="rounded-xl border border-slate-700 bg-slate-900 p-5"
                >
                  <h4 className="font-bold text-teal-300">{idea.steps[detail].title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    {idea.steps[detail].detail}
                  </p>
                </div>
                <Banner>{idea.limits}</Banner>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('problem')}
                    className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-bold"
                  >
                    ← Problem
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('preview')}
                    className="rounded-xl bg-teal-300 px-5 py-3 text-sm font-bold text-slate-950"
                  >
                    Open interactive prototype →
                  </button>
                </div>
              </section>
            )}

            {step === 'preview' && (
              <section>
                {id !== 'benchmark' && id !== 'fiber' && (
                  <>
                    <Banner>
                      {warnings[id]} The original interface below may contain additional optimistic
                      or outdated wording; this warning takes precedence.
                    </Banner>
                    <p className="my-4 text-sm text-slate-300">{idea.preview}</p>
                  </>
                )}
                <div className="mt-4 min-w-0 overflow-x-auto">
                  {(id === 'benchmark' || id === 'fiber') && <GroundTruthBlindSpotView />}
                  {id === 'nexus' && <NexusTrustLineView />}
                  {id === 'mantavia' && <MantaviaCableGuardView />}
                  {id === 'thermal' && <ThermalClearHotView />}
                  {id === 'phalanx' && <PhalanxSwarmView />}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="mt-12 border-t border-slate-800 bg-slate-950 px-6 py-6 text-center text-xs text-slate-400">
        Ground Truth + BlindSpot Local-First Prototype · Synthetic & user-imported data only · No
        physical hardware, live detection, Nexus service, or verified operational performance.
      </footer>
    </div>
  );
}

export default App;
