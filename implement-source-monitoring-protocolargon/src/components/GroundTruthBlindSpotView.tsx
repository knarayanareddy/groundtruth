import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Clock,
  Download,
  FileJson,
  FileWarning,
  GitBranch,
  Pause,
  Play,
  PlusCircle,
  Radio,
  RotateCcw,
  Scale,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ADAPTER_PROTOCOL_VERSION,
  advanceAdapterClock,
  createInitialAdapterState,
  deriveAdapterView,
  handleAdapterPollFailure,
  handleAdapterPollSuccess,
  setAdapterOptIn,
} from '../engine/localFeedAdapter';
import {
  clearSessionFromLocalStorage,
  LOCAL_STORAGE_KEY,
  loadSessionFromLocalStorage,
  saveSessionToLocalStorage,
  StorageOperationStatus,
} from '../engine/localStorageSession';
import {
  createExportRecord,
  DEFAULT_SYNTHETIC_CONFIG,
  deriveReplaySnapshot,
} from '../engine/replayEngine';
import {
  HeartbeatStatus,
  ReviewerNote,
  ScenarioDefinition,
  SyntheticConfig,
  ValidationErrorItem,
} from '../engine/types';
import { serializeExportRecord, validateScenarioInput } from '../engine/validator';
import {
  CLOCK_AND_DEPENDENCY_EDGE_FIXTURE,
  REFERENCE_FIXTURE,
} from '../fixtures/referenceFixture';

const KEY_TIMESTAMPS = [0, 2, 5, 6, 7, 10, 12] as const;

const INVALID_SAMPLE_JSON = JSON.stringify(
  {
    schemaVersion: 'groundtruth-blindspot/v1',
    scenarioId: 'invalid-demo-payload',
    title: 'Deliberately Invalid Input for All-or-Nothing Rejection Test',
    dataProvenance: 'user_provided',
    timeUnit: 'seconds',
    virtualDuration: 12,
    heartbeatThreshold: -5,
    comparisonTolerance: 0,
    dependencies: [{ id: 'gateway-1', name: 'Gateway 1', declaredBy: 'test' }],
    sources: [
      {
        id: 'A',
        name: 'Source A',
        dependencyIds: ['non-existent-dependency-99'],
        dependencyKnowledge: 'complete',
        declarationProvenance: 'test',
      },
    ],
    events: [
      {
        id: 'dup-id-1',
        sourceId: 'UNKNOWN_SOURCE',
        receivedAt: -2,
        type: 'heartbeat',
      },
    ],
  },
  null,
  2
);

function statusIconSymbol(status: HeartbeatStatus): string {
  switch (status) {
    case 'FRESH HEARTBEAT':
      return '●';
    case 'STALE / UNKNOWN':
      return '▲';
    case 'WAITING / UNKNOWN':
      return '◌';
  }
}

function statusBadgeStyle(status: HeartbeatStatus): string {
  switch (status) {
    case 'FRESH HEARTBEAT':
      return 'border-emerald-400/60 bg-emerald-950/70 text-emerald-200';
    case 'STALE / UNKNOWN':
      return 'border-amber-400/70 bg-amber-950/70 text-amber-200 border-dashed';
    case 'WAITING / UNKNOWN':
      return 'border-slate-400/60 bg-slate-900/90 text-slate-200 border-dotted';
  }
}

export const GroundTruthBlindSpotView: React.FC = () => {
  // Load initial state from localStorage if valid, else fall back to Section 4 Reference Fixture
  const initialLoad = useMemo(() => loadSessionFromLocalStorage(), []);

  const [scenario, setScenario] = useState<ScenarioDefinition>(
    () => initialLoad.bundle?.scenario ?? REFERENCE_FIXTURE
  );
  const [currentT, setCurrentT] = useState<number>(
    () => initialLoad.bundle?.replayPositionT ?? 0
  );
  const [syntheticConfig, setSyntheticConfig] = useState<SyntheticConfig>(
    () => initialLoad.bundle?.syntheticConfig ?? DEFAULT_SYNTHETIC_CONFIG
  );
  const [reviewerNotes, setReviewerNotes] = useState<ReviewerNote[]>(
    () => initialLoad.bundle?.reviewerNotes ?? []
  );
  const [storageStatus, setStorageStatus] = useState<StorageOperationStatus>(
    () => initialLoad.status
  );
  const [snapshotMismatchWarning, setSnapshotMismatchWarning] = useState<string | null>(
    () => initialLoad.bundle?.snapshotMismatchWarning ?? null
  );
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 4>(1);

  // Reviewer note form state
  const [authorAlias, setAuthorAlias] = useState<string>('local-reviewer-unverified');
  const [noteScope, setNoteScope] = useState<string>('general');
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [showNonCausalNotes, setShowNonCausalNotes] = useState<boolean>(false);

  // Export / Import UI state
  const [exportedJsonText, setExportedJsonText] = useState<string>('');
  const [importJsonDraft, setImportJsonDraft] = useState<string>('');
  const [importErrors, setImportErrors] = useState<ValidationErrorItem[]>([]);
  const [importSuccessBanner, setImportSuccessBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synthetic event injection form state
  const [injectSourceId, setInjectSourceId] = useState<string>('B');

  // Optional Section 7 test-only local feed adapter state (strictly separate from deterministic replay)
  const [adapterState, setAdapterState] = useState(() => createInitialAdapterState(5));
  const [nextAdapterSeq, setNextAdapterSeq] = useState<number>(1);
  const [showAdapterPanel, setShowAdapterPanel] = useState<boolean>(false);

  // Pure deterministic derivation of the entire dashboard state at currentT
  const snapshot = useMemo(
    () => deriveReplaySnapshot(scenario, currentT, syntheticConfig, reviewerNotes),
    [scenario, currentT, syntheticConfig, reviewerNotes]
  );

  const adapterView = useMemo(() => deriveAdapterView(adapterState), [adapterState]);

  // Persist session changes to localStorage truthfully
  useEffect(() => {
    const res = saveSessionToLocalStorage(
      scenario,
      currentT,
      syntheticConfig,
      reviewerNotes
    );
    setStorageStatus(res);
  }, [scenario, currentT, syntheticConfig, reviewerNotes]);

  // Deterministic virtual clock advancement during Play mode
  useEffect(() => {
    if (!isPlaying) return;
    if (currentT >= scenario.virtualDuration) {
      setIsPlaying(false);
      return;
    }
    const intervalMs = Math.round(1000 / speedMultiplier);
    const timer = window.setInterval(() => {
      setCurrentT((prevT) => {
        const nextT = Math.min(scenario.virtualDuration, prevT + 1);
        if (nextT >= scenario.virtualDuration) {
          setIsPlaying(false);
        }
        return nextT;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, speedMultiplier, currentT, scenario.virtualDuration]);

  // Handlers for transport controls
  const seekTo = (targetT: number) => {
    const clamped = Math.max(
      0,
      Math.min(scenario.virtualDuration, Math.round(targetT))
    );
    setCurrentT(clamped);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentT >= scenario.virtualDuration) {
        setCurrentT(0);
      }
      setIsPlaying(true);
    }
  };

  const handleStep = (delta: number) => {
    setIsPlaying(false);
    seekTo(currentT + delta);
  };

  const handleResetClock = () => {
    setIsPlaying(false);
    setCurrentT(0);
  };

  // Load built-in fixture preset
  const handleLoadPreset = (preset: ScenarioDefinition) => {
    setIsPlaying(false);
    setScenario(preset);
    setCurrentT(0);
    setSyntheticConfig(DEFAULT_SYNTHETIC_CONFIG);
    setReviewerNotes([]);
    setSnapshotMismatchWarning(null);
    setImportWarnings([]);
    setImportErrors([]);
    setImportSuccessBanner(`Loaded synthetic preset "${preset.title}" at T+0s.`);
    if (preset.sources.length > 0) {
      setInjectSourceId(preset.sources[0].id);
    }
  };

  // Clear localStorage and reset to clean Section 4 Reference Fixture
  const handleClearStorageAndReset = () => {
    setIsPlaying(false);
    const clearRes = clearSessionFromLocalStorage();
    setScenario(REFERENCE_FIXTURE);
    setCurrentT(0);
    setSyntheticConfig(DEFAULT_SYNTHETIC_CONFIG);
    setReviewerNotes([]);
    setSnapshotMismatchWarning(null);
    setImportWarnings([]);
    setImportErrors([]);
    setExportedJsonText('');
    setImportSuccessBanner(null);
    setStorageStatus(clearRes);
    setInjectSourceId('B');
  };

  // Add a local reviewer note at currentT
  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    const newNote: ReviewerNote = {
      id: `note-T${currentT}-${ reviewerNotes.length + 1 }`,
      authorAlias: authorAlias.trim() || 'unauthenticated-local-reviewer',
      recordedAtReplayT: currentT,
      createdAtIso: new Date().toISOString(),
      targetScope: noteScope,
      text: trimmed,
    };
    setReviewerNotes((prev) => [...prev, newNote]);
    setNoteDraft('');
  };

  // Explicit synthetic event injection / drop controls
  const handleInjectSyntheticHeartbeat = () => {
    const newId = `syn-hb-${injectSourceId}-T${currentT}-${syntheticConfig.injectedEvents.length + 1}`;
    setSyntheticConfig((prev) => ({
      ...prev,
      injectedEvents: [
        ...prev.injectedEvents,
        {
          id: newId,
          sourceId: injectSourceId,
          receivedAt: currentT,
          type: 'heartbeat',
          syntheticInjected: true,
        },
      ],
    }));
  };

  const handleToggleDropEvent = (eventId: string) => {
    setSyntheticConfig((prev) => {
      const exists = prev.droppedEventIds.includes(eventId);
      return {
        ...prev,
        droppedEventIds: exists
          ? prev.droppedEventIds.filter((id) => id !== eventId)
          : [...prev.droppedEventIds, eventId],
      };
    });
  };

  // Export JSON record
  const handleExportRecord = () => {
    const record = createExportRecord(
      scenario,
      currentT,
      syntheticConfig,
      reviewerNotes
    );
    const jsonStr = serializeExportRecord(record);
    setExportedJsonText(jsonStr);

    // Initiate browser file download without claiming remote/encrypted safety
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `groundtruth-blindspot-export-T${currentT}s.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: textarea already contains full JSON for copy/inspection
    }
  };

  // Validate and apply imported JSON (all-or-nothing)
  const applyImportString = (rawJson: string, sourceLabel: string) => {
    setImportErrors([]);
    setImportSuccessBanner(null);

    const result = validateScenarioInput(rawJson);
    if (!result.ok) {
      // All-or-nothing: leave current scenario, currentT, syntheticConfig, and reviewerNotes intact!
      setImportErrors(result.errors);
      return;
    }

    setIsPlaying(false);
    const bundle = result.value;
    setScenario(bundle.scenario);
    setCurrentT(bundle.replayPositionT);
    setSyntheticConfig(bundle.syntheticConfig);
    setReviewerNotes(bundle.reviewerNotes);
    setSnapshotMismatchWarning(bundle.snapshotMismatchWarning);
    setImportWarnings(result.warnings);
    setImportSuccessBanner(
      `Imported ${bundle.kind === 'exported_record' ? 'exported replay record' : 'scenario'} from ${sourceLabel}. Recomputed all states deterministically at T+${bundle.replayPositionT}s.`
    );
    if (bundle.scenario.sources.length > 0) {
      setInjectSourceId(bundle.scenario.sources[0].id);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_048_576) {
      setImportErrors([
        {
          path: 'root',
          message: `File "${file.name}" (${file.size} bytes) exceeds maximum limit of 1048576 bytes (1 MiB). Active session left unchanged.`,
        },
      ]);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setImportJsonDraft(content);
      applyImportString(content, `file "${file.name}"`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const freshCount = snapshot.sources.filter(
    (s) => s.status === 'FRESH HEARTBEAT'
  ).length;
  const staleCount = snapshot.sources.filter(
    (s) => s.status === 'STALE / UNKNOWN'
  ).length;
  const waitingCount = snapshot.sources.filter(
    (s) => s.status === 'WAITING / UNKNOWN'
  ).length;

  return (
    <div className="space-y-6" data-testid="groundtruth-blindspot-workbench">
      {/* 1. Non-negotiable Evidence & Synthetic Data Boundary Banner */}
      <section
        aria-label="Evidence boundaries and synthetic data disclosure"
        className="rounded-2xl border border-amber-400/40 bg-amber-950/30 p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-amber-100 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Synthetic / User-Provided Local Replay Prototype — Not Verified Hardware or Field Detection
            </span>
          </div>
          <span
            data-testid="provenance-badge"
            className="rounded-full border border-amber-300/40 bg-amber-900/50 px-3 py-0.5 font-mono text-xs font-semibold text-amber-200"
          >
            Provenance: {scenario.dataProvenance.toUpperCase()} (Unverified)
          </span>
        </div>
        <ul className="mt-2.5 grid gap-1.5 text-xs text-amber-100/90 sm:grid-cols-2">
          <li>
            • <strong>Heartbeat ≠ Working Sensor or Clear Scene:</strong>{' '}
            <code>FRESH HEARTBEAT</code> only means a heartbeat packet arrived within the declared{' '}
            {scenario.heartbeatThreshold}s threshold. It does not prove sensor calibration, valid
            measurements, coverage, or safety.
          </li>
          <li>
            • <strong>Silence ≠ Safe or Known Failure Cause:</strong>{' '}
            <code>STALE / UNKNOWN</code> and <code>WAITING / UNKNOWN</code> indicate missing recent
            heartbeats—never negative evidence about the environment or proof of jamming/failure.
          </li>
          <li>
            • <strong>Different IDs ≠ Independence:</strong> Sources listing different labels (e.g.{' '}
            <code>power-1</code> vs <code>power-2</code>) or <code>unknown</code> dependencies are{' '}
            <strong>not</strong> established independent. No numeric trust, confidence, or Brier
            score is calculated.
          </li>
          <li>
            • <strong>No Hardware, Scrubber, or Cloud Connected:</strong> Runs 100% locally in
            browser memory. No Atech board, Raspberry Pi, Nexus link, or privacy anonymizer is
            connected. Never enter sensitive personal or operational information.
          </li>
        </ul>
      </section>

      {/* Snapshot mismatch warning if imported file had a tampered/mismatched derivedSnapshotAtExportT */}
      {snapshotMismatchWarning && (
        <div
          role="alert"
          data-testid="snapshot-mismatch-warning"
          className="rounded-xl border border-rose-400/60 bg-rose-950/50 p-4 text-xs sm:text-sm text-rose-100"
        >
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>Stored Snapshot Mismatch on Import — Recomputed from Event Log</span>
          </div>
          <p className="mt-1">{snapshotMismatchWarning}</p>
        </div>
      )}

      {importWarnings.length > 0 && !snapshotMismatchWarning && (
        <div
          role="status"
          data-testid="import-warnings-banner"
          className="rounded-xl border border-amber-400/50 bg-amber-950/40 p-3.5 text-xs text-amber-100"
        >
          {importWarnings.map((w, idx) => (
            <p key={idx}>• {w}</p>
          ))}
        </div>
      )}

      {/* 2. Scenario / Fixture Selector & LocalStorage Status Bar */}
      <section
        aria-label="Scenario fixture selection and session storage controls"
        className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-300">
                Active Scenario Fixture
              </span>
              <code
                data-testid="active-scenario-id"
                className="rounded bg-slate-950 px-2 py-0.5 font-mono text-xs text-cyan-300"
              >
                {scenario.scenarioId}
              </code>
            </div>
            <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
              {scenario.title}
            </h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-300">
              {scenario.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="load-reference-fixture-btn"
              onClick={() => handleLoadPreset(REFERENCE_FIXTURE)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                scenario.scenarioId === REFERENCE_FIXTURE.scenarioId
                  ? 'border-teal-400 bg-teal-500/20 text-white'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
              }`}
            >
              Load Section 4 Reference Fixture
            </button>
            <button
              type="button"
              data-testid="load-diagnostic-fixture-btn"
              onClick={() => handleLoadPreset(CLOCK_AND_DEPENDENCY_EDGE_FIXTURE)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                scenario.scenarioId === CLOCK_AND_DEPENDENCY_EDGE_FIXTURE.scenarioId
                  ? 'border-teal-400 bg-teal-500/20 text-white'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
              }`}
            >
              Load Clock-Skew & Multi-Overlap Diagnostic
            </button>
            <button
              type="button"
              data-testid="clear-storage-reset-btn"
              onClick={handleClearStorageAndReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-900/50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear LocalStorage & Reset Session
            </button>
          </div>
        </div>

        <div
          data-testid="storage-status-bar"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-[11px] text-slate-400"
        >
          <span>
            <strong>Local Persistence ({LOCAL_STORAGE_KEY}):</strong> {storageStatus.message}
          </span>
          <span className="font-mono text-slate-300">
            Schema: {scenario.schemaVersion} · Unit: {scenario.timeUnit} (1s = 1000ms)
          </span>
        </div>
      </section>

      {/* 3. Deterministic Virtual Clock & Replay Transport Controls */}
      <section
        aria-label="Virtual replay clock and transport controls"
        className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/25 p-4 sm:p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-cyan-400/40 bg-slate-950 px-4 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                Virtual Replay Clock (T)
              </div>
              <div
                data-testid="virtual-clock-display"
                className="font-mono text-2xl font-black text-white sm:text-3xl"
              >
                T+{snapshot.currentT}s
                <span className="ml-1.5 text-sm font-normal text-slate-400">
                  / {scenario.virtualDuration}s
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="playback-state-badge"
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-bold ${
                    isPlaying
                      ? 'border-emerald-400/50 bg-emerald-950/60 text-emerald-200'
                      : 'border-slate-600 bg-slate-800 text-slate-200'
                  }`}
                >
                  {isPlaying
                    ? `▶ PLAYING (${speedMultiplier}x VIRTUAL CLOCK — NOT LIVE HARDWARE)`
                    : snapshot.currentT >= scenario.virtualDuration
                    ? '⏹ PAUSED AT END (DETERMINISTIC REPLAY)'
                    : '⏸ PAUSED (DETERMINISTIC REPLAY)'}
                </span>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-slate-300">
                  Heartbeat Threshold: <strong>{scenario.heartbeatThreshold}s</strong>
                </span>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-slate-300">
                  Comparison Tolerance: <strong>{scenario.comparisonTolerance}s</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Causal boundary: only events with <code>receivedAt &lt;= T+{snapshot.currentT}s</code>{' '}
                are evaluated ({snapshot.causalEventsUpToT.length} received,{' '}
                {snapshot.futureEventsCount} future event(s) withheld). Playing, stepping, or seeking
                to T+{snapshot.currentT}s produces identical state.
              </p>
            </div>
          </div>

          {/* Transport Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="reset-clock-btn"
              onClick={handleResetClock}
              aria-label="Reset virtual clock to T=0s"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              T=0s
            </button>
            <button
              type="button"
              data-testid="step-back-btn"
              onClick={() => handleStep(-1)}
              disabled={snapshot.currentT <= 0}
              aria-label="Step backward 1 second"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400 disabled:opacity-40"
            >
              <SkipBack className="h-3.5 w-3.5" />
              -1s
            </button>
            <button
              type="button"
              data-testid="play-pause-btn"
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause simulation replay' : 'Play simulation replay'}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-teal-300"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Play
                </>
              )}
            </button>
            <button
              type="button"
              data-testid="step-forward-btn"
              onClick={() => handleStep(1)}
              disabled={snapshot.currentT >= scenario.virtualDuration}
              aria-label="Step forward 1 second"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400 disabled:opacity-40"
            >
              +1s
              <SkipForward className="h-3.5 w-3.5" />
            </button>

            <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-300">
              <span>Speed:</span>
              <select
                aria-label="Replay speed multiplier"
                data-testid="speed-select"
                value={speedMultiplier}
                onChange={(e) =>
                  setSpeedMultiplier(Number(e.target.value) as 1 | 2 | 4)
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-white"
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>
          </div>
        </div>

        {/* Seek Slider & Direct Checkpoint Jump Buttons */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3">
            <label
              htmlFor="virtual-clock-slider"
              className="text-xs font-semibold text-slate-300"
            >
              Seek T:
            </label>
            <input
              id="virtual-clock-slider"
              data-testid="seek-slider"
              aria-label="Seek virtual replay time T"
              type="range"
              min={0}
              max={scenario.virtualDuration}
              step={1}
              value={snapshot.currentT}
              onChange={(e) => {
                setIsPlaying(false);
                seekTo(Number(e.target.value));
              }}
              className="h-2 flex-1 cursor-pointer accent-teal-400"
            />
            <span className="font-mono text-xs text-cyan-300">
              T+{snapshot.currentT}s
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Key Checkpoints:
            </span>
            {KEY_TIMESTAMPS.filter((t) => t <= scenario.virtualDuration).map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`jump-t-${t}`}
                onClick={() => {
                  setIsPlaying(false);
                  seekTo(t);
                }}
                className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition ${
                  snapshot.currentT === t
                    ? 'border-cyan-300 bg-cyan-400/20 text-white'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                }`}
              >
                T={t}s
              </button>
            ))}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
            <div className="text-[11px] text-slate-400">Fresh Heartbeats at T+{snapshot.currentT}s</div>
            <div
              data-testid="kpi-fresh-count"
              className="mt-0.5 font-mono text-lg font-bold text-emerald-300"
            >
              ● {freshCount} / {snapshot.sources.length} Fresh
            </div>
            <div className="text-[10px] text-slate-400">
              Recent packet receipt only (not sensor health)
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
            <div className="text-[11px] text-slate-400">Stale / Timed Out (&gt;= {scenario.heartbeatThreshold}s)</div>
            <div
              data-testid="kpi-stale-count"
              className="mt-0.5 font-mono text-lg font-bold text-amber-300"
            >
              ▲ {staleCount} Stale / Unknown
            </div>
            <div className="text-[10px] text-slate-400">
              No recent heartbeat (silence ≠ clear scene)
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
            <div className="text-[11px] text-slate-400">Waiting / Never Reported</div>
            <div
              data-testid="kpi-waiting-count"
              className="mt-0.5 font-mono text-lg font-bold text-slate-200"
            >
              ◌ {waitingCount} Waiting / Unknown
            </div>
            <div className="text-[10px] text-slate-400">
              Zero heartbeats received by T+{snapshot.currentT}s
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
            <div className="text-[11px] text-slate-400">Comparable Report Disagreements</div>
            <div
              data-testid="kpi-disagreement-count"
              className="mt-0.5 font-mono text-lg font-bold text-rose-300"
            >
              ≠ {snapshot.activeDisagreements.length} Disagreement(s)
            </div>
            <div className="text-[10px] text-slate-400">
              Explicit comparison rule · No winner selected
            </div>
          </div>
        </div>
      </section>

      {/* 4. Multi-Source Status Cards & Distinct Timing Breakdown (All Sources Visible Simultaneously) */}
      <section aria-label="Source availability, heartbeat freshness, and observation timing">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              <Radio className="h-5 w-5 text-teal-400" />
              <span>
                Source Availability, Heartbeat Freshness & Observation Timing at T+{snapshot.currentT}s
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Transport receipt time (<code>last packet received</code>), heartbeat freshness (
              <code>last heartbeat received</code>), and claimed sensor observation time (
              <code>last observation source time</code>) are tracked and displayed separately.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded border border-emerald-400/50 bg-emerald-950/50 px-2 py-0.5 text-emerald-200">
              ● FRESH HEARTBEAT (&lt;{scenario.heartbeatThreshold}s)
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-dashed border-amber-400/60 bg-amber-950/50 px-2 py-0.5 text-amber-200">
              ▲ STALE / UNKNOWN (&gt;={scenario.heartbeatThreshold}s)
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-dotted border-slate-400/60 bg-slate-900 px-2 py-0.5 text-slate-200">
              ◌ WAITING / UNKNOWN (no heartbeat)
            </span>
          </div>
        </div>

        {/* Source Cards Grid — keeps all sources visible simultaneously */}
        <div className="grid gap-4 lg:grid-cols-3">
          {snapshot.sources.map((srcState) => {
            const { source, status, lastObservation } = srcState;
            const icon = statusIconSymbol(status);
            return (
              <article
                key={source.id}
                data-testid={`source-card-${source.id}`}
                aria-label={`Source ${source.id} status card`}
                className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                  status === 'FRESH HEARTBEAT'
                    ? 'border-emerald-500/40 bg-slate-900/90'
                    : status === 'STALE / UNKNOWN'
                    ? 'border-dashed border-amber-500/60 bg-amber-950/15'
                    : 'border-dotted border-slate-600 bg-slate-900/60'
                }`}
              >
                <div>
                  {/* Source Header & Non-Color-Only Status Badge */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-950 px-2 py-0.5 font-mono text-xs font-bold text-cyan-300">
                          ID: {source.id}
                        </span>
                        <h4 className="text-sm font-bold text-white">{source.name}</h4>
                      </div>
                      {source.description && (
                        <p className="mt-1 text-[11px] text-slate-400">{source.description}</p>
                      )}
                    </div>
                    <span
                      data-testid={`source-status-${source.id}`}
                      className={`shrink-0 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${statusBadgeStyle(
                        status
                      )}`}
                    >
                      {icon} {status}
                    </span>
                  </div>

                  {/* Plain-language Status Interpretation */}
                  <p
                    data-testid={`source-explanation-${source.id}`}
                    className="mt-2.5 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 text-xs leading-relaxed text-slate-200"
                  >
                    {srcState.statusExplanation}
                  </p>

                  {/* Separate Timing Metrics Grid */}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-2">
                      <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                        Last Packet Received
                      </dt>
                      <dd
                        data-testid={`source-last-packet-${source.id}`}
                        className="mt-0.5 font-mono font-bold text-white"
                      >
                        {srcState.lastPacketReceivedAt !== null
                          ? `T+${srcState.lastPacketReceivedAt}s (age ${srcState.lastPacketReceiveAge}s)`
                          : 'None (—)'}
                      </dd>
                      <dd className="text-[10px] text-slate-400">
                        Event: {srcState.lastPacketEventId ?? 'none'}
                      </dd>
                    </div>

                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-2">
                      <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                        Last Heartbeat Received
                      </dt>
                      <dd
                        data-testid={`source-last-heartbeat-${source.id}`}
                        className="mt-0.5 font-mono font-bold text-white"
                      >
                        {srcState.lastHeartbeatReceivedAt !== null
                          ? `T+${srcState.lastHeartbeatReceivedAt}s (age ${srcState.lastHeartbeatAge}s)`
                          : 'None (—)'}
                      </dd>
                      <dd className="text-[10px] text-slate-400">
                        Event: {srcState.lastHeartbeatEventId ?? 'none'}
                      </dd>
                    </div>

                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-2">
                      <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                        Last Obs Source Time
                      </dt>
                      <dd
                        data-testid={`source-last-obs-time-${source.id}`}
                        className="mt-0.5 font-mono font-bold text-white"
                      >
                        {!lastObservation
                          ? 'None (—)'
                          : lastObservation.observedAt === 'unknown'
                          ? 'unknown'
                          : `T+${lastObservation.observedAt}s`}
                      </dd>
                      <dd
                        data-testid={`source-last-obs-age-${source.id}`}
                        className="font-mono text-[10px] text-cyan-300"
                      >
                        Obs Age:{' '}
                        {!lastObservation
                          ? '—'
                          : lastObservation.observationAge === 'clock_skew'
                          ? 'CLOCK SKEW (future)'
                          : lastObservation.observationAge === 'unknown'
                          ? 'unknown (unverified)'
                          : `${lastObservation.observationAge}s (rcv age ${lastObservation.receiveAge}s)`}
                      </dd>
                    </div>

                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-2">
                      <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                        Source Clock Quality
                      </dt>
                      <dd
                        data-testid={`source-clock-quality-${source.id}`}
                        className="mt-0.5 font-mono font-bold text-white"
                      >
                        {lastObservation ? lastObservation.clockQuality : 'no_observation'}
                      </dd>
                      <dd className="text-[10px] text-slate-400">
                        {lastObservation?.clockSkew
                          ? '⚠️ Skew: observedAt > receivedAt'
                          : lastObservation?.isBackfill
                          ? '⚠️ Backfilled report'
                          : 'Separate from heartbeat'}
                      </dd>
                    </div>
                  </dl>

                  {/* Declared Dependencies on Card */}
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Declared Dependencies
                      </span>
                      <span
                        data-testid={`source-dep-knowledge-${source.id}`}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          source.dependencyKnowledge === 'complete'
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        knowledge: {source.dependencyKnowledge}
                      </span>
                    </div>
                    {srcState.resolvedDependencies.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {srcState.resolvedDependencies.map((dep) => (
                          <li
                            key={dep.id}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-200"
                          >
                            {dep.id} <span className="text-slate-400">({dep.name})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[11px] text-amber-300">
                        No dependencies declared ({source.dependencyKnowledge} knowledge — NOT
                        established independent).
                      </p>
                    )}
                  </div>

                  {/* Causal Observation History for this Source */}
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 text-xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Received Observation History (receivedAt &lt;= T+{snapshot.currentT}s)
                    </div>
                    {srcState.observationHistory.length === 0 ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        No observations received by T+{snapshot.currentT}s. Silence is not negative
                        evidence.
                      </p>
                    ) : (
                      <ul
                        data-testid={`source-obs-history-${source.id}`}
                        className="mt-1.5 space-y-2"
                      >
                        {srcState.observationHistory.map((obs) => (
                          <li
                            key={obs.eventId}
                            data-testid={`obs-item-${obs.eventId}`}
                            className={`rounded-lg border p-2 ${
                              obs.clockSkew
                                ? 'border-rose-500/50 bg-rose-950/30'
                                : obs.isBackfill
                                ? 'border-amber-500/50 bg-amber-950/25'
                                : 'border-slate-800 bg-slate-900/80'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[11px]">
                              <span className="font-bold text-white">
                                [{obs.eventId}] {obs.value}
                              </span>
                              <span className="text-cyan-300">
                                obs:{' '}
                                {obs.observedAt === 'unknown'
                                  ? 'unknown'
                                  : `T+${obs.observedAt}s`}{' '}
                                · rcv: T+{obs.receivedAt}s
                              </span>
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-slate-300">
                              Key: {obs.comparisonKey.contextId} / {obs.comparisonKey.subject}.
                              {obs.comparisonKey.property} ({obs.comparisonKey.unit}) · Clock:{' '}
                              {obs.clockQuality}
                            </div>
                            <p className="mt-1 text-[11px] leading-snug text-amber-200/90">
                              {obs.freshnessCaveat}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 5. Dependency Overlap View (Graph + Pairwise Overlap Table) & Disagreement Cue */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left: Declared Dependency Overlap Graph & Pairwise Matrix */}
        <section
          aria-label="Declared shared dependencies and overlap analysis"
          data-testid="dependency-panel"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <GitBranch className="h-5 w-5 text-cyan-400" />
              <span>Declared Shared Dependencies & Overlap Analysis</span>
            </h3>
            <span className="rounded bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-400">
              No independence score computed
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Displays human-declared upstream dependencies and pairwise intersections. Unknown or
            partial metadata remains unknown; disjoint labels never prove independence.
          </p>

          {/* Readable SVG Node-Link Dependency Graph */}
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
            <svg
              viewBox="0 0 540 210"
              className="mx-auto w-full max-w-[540px]"
              role="img"
              aria-label="Source to declared dependency bipartite graph"
            >
              <defs>
                <pattern
                  id="unknown-hatch"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="2" />
                </pattern>
              </defs>

              <text x="85" y="20" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">
                SOURCES
              </text>
              <text
                x="415"
                y="20"
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#94a3b8"
              >
                DECLARED DEPENDENCIES
              </text>

              {/* Edges from Sources to Dependencies */}
              {snapshot.sources.map((srcState, sIdx) => {
                const sy = 52 + sIdx * 58;
                if (srcState.source.dependencyIds.length === 0) {
                  return (
                    <line
                      key={`${srcState.source.id}-unknown`}
                      x1="155"
                      y1={sy}
                      x2="315"
                      y2={175}
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  );
                }
                return srcState.source.dependencyIds.map((depId) => {
                  const dIdx = scenario.dependencies.findIndex((d) => d.id === depId);
                  const dy = 45 + (dIdx >= 0 ? dIdx : 0) * 43;
                  const isShared =
                    snapshot.sources.filter((other) =>
                      other.source.dependencyIds.includes(depId)
                    ).length > 1;
                  return (
                    <line
                      key={`${srcState.source.id}-${depId}`}
                      x1="155"
                      y1={sy}
                      x2="315"
                      y2={dy}
                      stroke={isShared ? '#f43f5e' : '#38bdf8'}
                      strokeWidth={isShared ? '2.8' : '1.8'}
                    />
                  );
                });
              })}

              {/* Source Nodes */}
              {snapshot.sources.map((srcState, sIdx) => {
                const sy = 52 + sIdx * 58;
                const icon = statusIconSymbol(srcState.status);
                return (
                  <g key={srcState.source.id}>
                    <rect
                      x="15"
                      y={sy - 18}
                      width="140"
                      height="36"
                      rx="8"
                      fill="#0f172a"
                      stroke={
                        srcState.status === 'FRESH HEARTBEAT'
                          ? '#34d399'
                          : srcState.status === 'STALE / UNKNOWN'
                          ? '#f59e0b'
                          : '#64748b'
                      }
                      strokeWidth="2"
                      strokeDasharray={
                        srcState.status === 'FRESH HEARTBEAT'
                          ? undefined
                          : srcState.status === 'STALE / UNKNOWN'
                          ? '6 3'
                          : '2 3'
                      }
                    />
                    <text x="85" y={sy - 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="#f8fafc">
                      {icon} Source {srcState.source.id}
                    </text>
                    <text x="85" y={sy + 11} textAnchor="middle" fontSize="9" fill="#94a3b8">
                      deps: {srcState.source.dependencyKnowledge}
                    </text>
                  </g>
                );
              })}

              {/* Dependency Nodes */}
              {scenario.dependencies.map((dep, dIdx) => {
                const dy = 45 + dIdx * 43;
                const sharers = snapshot.sources.filter((s) =>
                  s.source.dependencyIds.includes(dep.id)
                );
                const isShared = sharers.length > 1;
                return (
                  <g key={dep.id}>
                    <rect
                      x="315"
                      y={dy - 15}
                      width="210"
                      height="30"
                      rx="6"
                      fill={isShared ? '#4c0519' : '#0f172a'}
                      stroke={isShared ? '#fb7185' : '#38bdf8'}
                      strokeWidth={isShared ? '2.2' : '1.5'}
                    />
                    <text
                      x="420"
                      y={dy - 1}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#f8fafc"
                    >
                      {dep.id} {isShared ? `(SHARED: ${sharers.map((s) => s.source.id).join(', ')})` : ''}
                    </text>
                    <text x="420" y={dy + 10} textAnchor="middle" fontSize="8.5" fill="#cbd5e1">
                      {dep.name}
                    </text>
                  </g>
                );
              })}

              {/* Unknown / Undeclared Node */}
              <g>
                <rect
                  x="315"
                  y="160"
                  width="210"
                  height="30"
                  rx="6"
                  fill="url(#unknown-hatch)"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <rect
                  x="315"
                  y="160"
                  width="210"
                  height="30"
                  rx="6"
                  fill="rgba(15,23,42,0.82)"
                />
                <text x="420" y="174" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fde68a">
                  ? Unknown / Undeclared Dependencies
                </text>
                <text x="420" y="185" textAnchor="middle" fontSize="8.5" fill="#fcd34d">
                  Not established independent
                </text>
              </g>
            </svg>
          </div>

          {/* Pairwise Overlap Cards / Table */}
          <div className="mt-3 space-y-2.5" data-testid="dependency-overlap-list">
            {snapshot.dependencyOverlaps.map((ov) => (
              <div
                key={ov.pairKey}
                data-testid={`dep-pair-${ov.sourceAId}-${ov.sourceBId}`}
                className={`rounded-xl border p-3 text-xs ${
                  ov.sharedDependencies.length > 0
                    ? 'border-rose-500/40 bg-rose-950/20'
                    : 'border-amber-500/40 bg-amber-950/15'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-white">
                    Pair {ov.sourceAId} ↔ {ov.sourceBId}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                      ov.sharedDependencies.length > 0
                        ? 'bg-rose-500/20 text-rose-200'
                        : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {ov.category}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-slate-100">{ov.headline}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{ov.caveat}</p>
                <div className="mt-1.5 border-t border-slate-800/80 pt-1.5 font-mono text-[10px] text-slate-400">
                  Assertion provenance: {ov.assertionProvenance}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Limited Comparable Report Disagreement Cue */}
        <section
          aria-label="Comparable report disagreement and comparability cue"
          data-testid="disagreement-panel"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <Scale className="h-5 w-5 text-amber-400" />
              <span>Limited Comparable Report Disagreement Cue (T+{snapshot.currentT}s)</span>
            </h3>
            <span className="rounded bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-amber-300">
              No Auto-Winner
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Compares received observations only when <code>contextId</code>, <code>subject</code>,{' '}
            <code>property</code>, and compatible <code>unit</code> match, source clocks are{' '}
            <code>synthetic_synchronized</code> without skew, and{' '}
            <code>|observedAt_A - observedAt_B| &lt;= {scenario.comparisonTolerance}s</code>.
          </p>

          {/* Silent / Waiting Source Notice */}
          {snapshot.silentOrWaitingSourceIds.length > 0 && (
            <div
              data-testid="silent-sources-comparison-note"
              className="mt-3 rounded-xl border border-slate-700 bg-slate-950/90 p-3 text-xs text-slate-300"
            >
              <strong>Silent / Unavailable Source Rule:</strong> Source(s){' '}
              <code className="text-amber-300">
                {snapshot.silentOrWaitingSourceIds.join(', ')}
              </code>{' '}
              have zero received observations by T+{snapshot.currentT}s. An unavailable or silent
              source is <strong>never</strong> counted as an opposing or corroborating observation.
            </div>
          )}

          {snapshot.comparisons.length === 0 ? (
            <div
              data-testid="no-comparisons-yet"
              className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-6 text-center text-xs text-slate-400"
            >
              No cross-source observation pairs have been received by T+{snapshot.currentT}s. Step or
              play to T+2s to inspect the comparable observation disagreement.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {snapshot.comparisons.map((cmp) => (
                <div
                  key={cmp.id}
                  data-testid={`comparison-card-${cmp.id}`}
                  className={`rounded-xl border p-3.5 text-xs ${
                    cmp.outcome === 'disagreement'
                      ? 'border-rose-500/50 bg-rose-950/25'
                      : cmp.outcome === 'not_comparable'
                      ? 'border-slate-700 bg-slate-950/80'
                      : 'border-emerald-500/40 bg-emerald-950/20'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid={`comparison-outcome-${cmp.id}`}
                      className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
                        cmp.outcome === 'disagreement'
                          ? 'bg-rose-500/20 text-rose-200'
                          : cmp.outcome === 'not_comparable'
                          ? 'bg-slate-800 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-200'
                      }`}
                    >
                      {cmp.outcome === 'disagreement'
                        ? '≠ REPORT DISAGREEMENT (NO WINNER SELECTED)'
                        : cmp.outcome === 'not_comparable'
                        ? '⚠ not comparable / insufficient information'
                        : '✓ COMPARABLE REPORTS MATCH'}
                    </span>

                    {cmp.outcome !== 'not_comparable' && (
                      <span
                        data-testid={`comparison-historical-badge-${cmp.id}`}
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                          cmp.isHistoricalAtCurrentT
                            ? 'border border-amber-400/50 bg-amber-950/70 text-amber-200'
                            : 'border border-cyan-400/40 bg-cyan-950/60 text-cyan-200'
                        }`}
                      >
                        {cmp.isHistoricalAtCurrentT
                          ? `HISTORICAL CONTEXT (obs age ${cmp.historicalAgeSec}s at T+${snapshot.currentT}s)`
                          : `CURRENT STEP (T+${snapshot.currentT}s)`}
                      </span>
                    )}
                  </div>

                  <h4 className="mt-2 font-bold text-white">{cmp.headline}</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-200">{cmp.reason}</p>

                  {/* Side-by-side Raw Claims Table */}
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                      <div className="font-mono text-[11px] font-bold text-cyan-300">
                        Source {cmp.observationA.sourceId} ({cmp.sourceAName})
                      </div>
                      <div className="mt-1 font-mono text-xs font-bold text-white">
                        Claim: &quot;{cmp.observationA.value}&quot;
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">
                        Event ID: {cmp.observationA.eventId} · observedAt:{' '}
                        {cmp.observationA.observedAt === 'unknown'
                          ? 'unknown'
                          : `T+${cmp.observationA.observedAt}s`}{' '}
                        · receivedAt: T+{cmp.observationA.receivedAt}s · clock:{' '}
                        {cmp.observationA.clockQuality}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                      <div className="font-mono text-[11px] font-bold text-cyan-300">
                        Source {cmp.observationB.sourceId} ({cmp.sourceBName})
                      </div>
                      <div className="mt-1 font-mono text-xs font-bold text-white">
                        Claim: &quot;{cmp.observationB.value}&quot;
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">
                        Event ID: {cmp.observationB.eventId} · observedAt:{' '}
                        {cmp.observationB.observedAt === 'unknown'
                          ? 'unknown'
                          : `T+${cmp.observationB.observedAt}s`}{' '}
                        · receivedAt: T+{cmp.observationB.receivedAt}s · clock:{' '}
                        {cmp.observationB.clockQuality}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 rounded-lg border border-slate-800/90 bg-slate-950/60 p-2 text-[11px] text-slate-300">
                    <div>
                      <strong>Historical / Clock Caveat:</strong> {cmp.historicalCaveat}
                    </div>
                    <div>
                      <strong>Shared Dependency Overlap:</strong>{' '}
                      {cmp.sharedDependencies.length > 0
                        ? cmp.sharedDependencies.map((d) => `${d.id} (${d.name})`).join(', ')
                        : 'None declared'}{' '}
                      — {cmp.dependencyCaveat}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {cmp.comparisonRuleSummary}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 6. Causal State-Transition Timeline, Event Log & Explicit Synthetic Event Controls */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* State Transitions up to T */}
        <section
          aria-label="Causal heartbeat state transition history"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <Clock className="h-5 w-5 text-teal-400" />
              <span>Causal Heartbeat State Transitions (0s .. T+{snapshot.currentT}s)</span>
            </h3>
            <span
              data-testid="transition-count-badge"
              className="rounded bg-slate-950 px-2.5 py-0.5 font-mono text-xs text-teal-300"
            >
              {snapshot.transitions.length} transition(s)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Captures exact threshold boundary transitions even when jumping across timestamps.
            Observations (including historical backfills) never trigger heartbeat transitions.
          </p>

          <ul
            data-testid="transition-timeline"
            className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1 text-xs"
          >
            {snapshot.transitions.map((tr) => (
              <li
                key={tr.id}
                data-testid={`transition-item-${tr.id}`}
                className={`rounded-xl border p-3 ${
                  tr.triggerType === 'threshold_timeout'
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : tr.triggerType === 'heartbeat_recovery'
                    ? 'border-cyan-500/40 bg-cyan-950/25'
                    : 'border-emerald-500/30 bg-slate-950/80'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1 font-mono">
                  <span className="font-bold text-white">[T+{tr.atT}s] {tr.summary}</span>
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {tr.triggerType}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">{tr.uncertaintyCaveat}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Causal Event Log + Explicit Synthetic Event Controls */}
        <section
          aria-label="Causal event log and explicit synthetic event injection"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <Activity className="h-5 w-5 text-cyan-400" />
              <span>
                Causal Event Log (receivedAt &lt;= T+{snapshot.currentT}s) & Synthetic Controls
              </span>
            </h3>
            <span className="rounded bg-slate-950 px-2.5 py-0.5 font-mono text-xs text-cyan-300">
              {snapshot.causalEventsUpToT.length} received · {snapshot.futureEventsCount} future hidden
            </span>
          </div>

          {/* Explicit Synthetic Heartbeat Inject / Drop Controls */}
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/90 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-teal-300">
                  Explicit Synthetic Event Configuration (Recorded in Export):
                </span>
                <p className="text-[11px] text-slate-400">
                  Inject a synthetic heartbeat at T+{snapshot.currentT}s or toggle synthetic packet
                  drop. Never presented as a physical hardware cable unplug.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Select source for synthetic heartbeat injection"
                  data-testid="inject-source-select"
                  value={injectSourceId}
                  onChange={(e) => setInjectSourceId(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-white"
                >
                  {scenario.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      Source {s.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="inject-heartbeat-btn"
                  onClick={handleInjectSyntheticHeartbeat}
                  className="inline-flex items-center gap-1 rounded-lg border border-teal-400/50 bg-teal-500/20 px-2.5 py-1 font-bold text-teal-200 hover:bg-teal-500/30"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Inject Synthetic Heartbeat @ T+{snapshot.currentT}s
                </button>
              </div>
            </div>
          </div>

          <ul
            data-testid="causal-event-log"
            className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1 font-mono text-xs"
          >
            {snapshot.causalEventsUpToT.map((ev) => {
              const isDropped = syntheticConfig.droppedEventIds.includes(ev.id);
              return (
                <li
                  key={ev.id}
                  data-testid={`event-log-item-${ev.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2"
                >
                  <div>
                    <span className="font-bold text-cyan-300">[rcv T+{ev.receivedAt}s]</span>{' '}
                    <span className="text-white">
                      {ev.id} · Source {ev.sourceId} · {ev.type.toUpperCase()}
                    </span>
                    {ev.type === 'observation' && (
                      <span className="ml-2 text-amber-200">
                        val=&quot;{ev.value}&quot; (obsAt:{' '}
                        {ev.observedAt === 'unknown' ? 'unknown' : `T+${ev.observedAt}s`})
                      </span>
                    )}
                    {ev.syntheticInjected && (
                      <span className="ml-2 rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] text-teal-300">
                        SYNTHETIC INJECTED
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleDropEvent(ev.id)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:border-rose-400 hover:text-rose-200"
                  >
                    {isDropped ? 'Restore Event' : 'Drop (Synthetic)'}
                  </button>
                </li>
              );
            })}
          </ul>

          {syntheticConfig.droppedEventIds.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-xs text-amber-200">
              <span>Synthetically dropped event IDs: </span>
              {syntheticConfig.droppedEventIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleToggleDropEvent(id)}
                  className="mr-1.5 underline hover:text-white"
                >
                  Restore {id}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 7. Local Reviewer Notes & Reproducible Export / All-or-Nothing Import */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Reviewer Notes with Causal Filtering */}
        <section
          aria-label="Local reviewer notes and causal annotation layer"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-white">
              Local Reviewer Notes (Unauthenticated Local Alias)
            </h3>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                data-testid="toggle-noncausal-notes"
                checked={showNonCausalNotes}
                onChange={(e) => setShowNonCausalNotes(e.target.checked)}
                className="accent-teal-400"
              />
              <span>Show Non-Causal Full-Session Layer ({snapshot.allNotesNonCausal.length})</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Notes are tagged with current virtual clock <code>T+{snapshot.currentT}s</code> and an
            unauthenticated local alias. During ordinary causal replay, notes recorded at future
            replay timestamps (<code>recordedAtReplayT &gt; T</code>) are hidden unless the
            non-causal layer is explicitly enabled. All text is rendered as literal plain text.
          </p>

          <form onSubmit={handleAddNote} className="mt-3 space-y-2.5">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-slate-300">
                <span>Unauthenticated Local Alias:</span>
                <input
                  type="text"
                  data-testid="note-alias-input"
                  value={authorAlias}
                  onChange={(e) => setAuthorAlias(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                />
              </label>
              <label className="block text-xs text-slate-300">
                <span>Target Scope:</span>
                <select
                  data-testid="note-scope-select"
                  value={noteScope}
                  onChange={(e) => setNoteScope(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="general">General Scenario Review</option>
                  <option value="source:A">Source A</option>
                  <option value="source:B">Source B</option>
                  <option value="source:C">Source C</option>
                  <option value="disagreement">Observation Disagreement</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="note-text-input"
                aria-label="Reviewer note plain text"
                placeholder={`Enter plain-text reviewer note at T+${snapshot.currentT}s (never enter PII)...`}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                data-testid="add-note-btn"
                disabled={!noteDraft.trim()}
                className="rounded-xl bg-teal-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-40"
              >
                Add Note @ T+{snapshot.currentT}s
              </button>
            </div>
          </form>

          {snapshot.hiddenFutureNotesCount > 0 && !showNonCausalNotes && (
            <div
              data-testid="hidden-future-notes-banner"
              className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-200"
            >
              Causal filter active: {snapshot.hiddenFutureNotesCount} note(s) authored at a replay
              timestamp &gt; T+{snapshot.currentT}s are hidden during causal replay at T+
              {snapshot.currentT}s.
            </div>
          )}

          <ul data-testid="causal-notes-list" className="mt-3 space-y-2 text-xs">
            {(showNonCausalNotes ? snapshot.allNotesNonCausal : snapshot.causalNotes).length ===
            0 ? (
              <li className="text-slate-500">
                No reviewer notes visible at T+{snapshot.currentT}s.
              </li>
            ) : (
              (showNonCausalNotes ? snapshot.allNotesNonCausal : snapshot.causalNotes).map(
                (note) => (
                  <li
                    key={note.id}
                    data-testid={`note-item-${note.id}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/90 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[11px] text-slate-400">
                      <span>
                        <strong className="text-cyan-300">[T+{note.recordedAtReplayT}s]</strong>{' '}
                        Scope: {note.targetScope}
                      </span>
                      <span>
                        Alias (unauthenticated): <code>{note.authorAlias}</code>
                        {note.recordedAtReplayT > snapshot.currentT && (
                          <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                            NON-CAUSAL FUTURE NOTE
                          </span>
                        )}
                      </span>
                    </div>
                    <p
                      data-testid={`note-text-${note.id}`}
                      className="mt-1.5 whitespace-pre-wrap break-words text-slate-100"
                    >
                      {note.text}
                    </p>
                  </li>
                )
              )
            )}
          </ul>
        </section>

        {/* Export & All-or-Nothing Validated Import */}
        <section
          aria-label="Export and import reproducible replay record"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5"
        >
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            <FileJson className="h-5 w-5 text-teal-400" />
            <span>Reproducible JSON Export & All-or-Nothing Validated Import</span>
          </h3>
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-2.5 text-[11px] text-amber-200">
            <strong>Export Disclosure:</strong> Exports contain your plain-text notes, scenario
            definitions, and unauthenticated local aliases. They are <strong>not</strong>{' '}
            anonymized, scrubbed, encrypted, or signed. Do not rely on any regex scrubber.
          </div>

          {/* Export Controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="export-json-btn"
              onClick={handleExportRecord}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-teal-300"
            >
              <Download className="h-3.5 w-3.5" />
              Export Reproducible JSON @ T+{snapshot.currentT}s
            </button>
            {exportedJsonText && (
              <button
                type="button"
                data-testid="copy-export-to-import-btn"
                onClick={() => setImportJsonDraft(exportedJsonText)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400"
              >
                Copy Export JSON into Import Box
              </button>
            )}
          </div>

          {exportedJsonText && (
            <div className="mt-2.5">
              <label className="block text-[11px] font-semibold text-slate-400">
                Generated Export Record JSON (Versioned · Includes Rules & Notes):
                <textarea
                  readOnly
                  rows={4}
                  data-testid="export-json-textarea"
                  value={exportedJsonText}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-200"
                />
              </label>
            </div>
          )}

          {/* Import Controls */}
          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">
                Import Scenario or Exported Record (Max 1 MiB · All-or-Nothing Validation)
              </span>
              <div className="flex flex-wrap gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  data-testid="import-file-input"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-cyan-400"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Choose .json File
                </button>
                <button
                  type="button"
                  data-testid="load-invalid-sample-btn"
                  onClick={() => {
                    setImportJsonDraft(INVALID_SAMPLE_JSON);
                    applyImportString(INVALID_SAMPLE_JSON, 'deliberate invalid test sample');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-950/50"
                >
                  <FileWarning className="h-3.5 w-3.5" />
                  Test Invalid Input Rejection
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              data-testid="import-json-textarea"
              aria-label="Paste JSON to validate and import"
              placeholder="Paste exported replay JSON or scenario JSON here..."
              value={importJsonDraft}
              onChange={(e) => setImportJsonDraft(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-200"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="import-json-submit-btn"
                onClick={() => applyImportString(importJsonDraft, 'pasted JSON')}
                className="rounded-xl bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
              >
                Validate & Import JSON
              </button>
            </div>

            {/* Validation Errors (All-or-Nothing guarantee) */}
            {importErrors.length > 0 && (
              <div
                role="alert"
                data-testid="import-error-alert"
                className="mt-3 rounded-xl border border-rose-500/60 bg-rose-950/50 p-3 text-xs text-rose-100"
              >
                <div className="font-bold text-rose-300">
                  Import Rejected ({importErrors.length} validation error(s)) — Active Session Left
                  Intact at T+{snapshot.currentT}s:
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 font-mono text-[11px]">
                  {importErrors.map((err, idx) => (
                    <li key={idx} data-testid={`import-error-item-${idx}`}>
                      <strong className="text-rose-200">{err.path}:</strong> {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importSuccessBanner && (
              <div
                role="status"
                data-testid="import-success-banner"
                className="mt-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3 text-xs text-emerald-200"
              >
                ✓ {importSuccessBanner}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 8. Optional Separate Test-Only Local Heartbeat Adapter (Spec Section 7 & 8.6) */}
      <section
        aria-label="Optional test-only local heartbeat feed adapter"
        data-testid="opt-in-adapter-section"
        className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                OPTIONAL SECTION 7 EXTENSION · UNTESTED WITH PHYSICAL HARDWARE
              </span>
              <h3 className="text-sm font-bold text-white sm:text-base">
                Separate Opt-In Test-Only Local Heartbeat Feed Adapter Harness
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Isolated from the main deterministic replay. Physical Atech Frame 10 / Frame 2.1
              boards are <strong>UNTESTED</strong>. Demonstrates poll success → disconnect/failure
              immediately invalidating cached fresh cards with advancing local age → out-of-order
              callback rejection → recovery.
            </p>
          </div>
          <button
            type="button"
            data-testid="toggle-adapter-panel-btn"
            onClick={() => setShowAdapterPanel((prev) => !prev)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-cyan-400"
          >
            {showAdapterPanel ? 'Hide Optional Adapter Harness' : 'Open Optional Adapter Harness'}
          </button>
        </div>

        {showAdapterPanel && (
          <div className="mt-4 space-y-4 border-t border-slate-800 pt-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="adapter-opt-in-btn"
                  onClick={() =>
                    setAdapterState((prev) => setAdapterOptIn(prev, !prev.optedIn))
                  }
                  className={`rounded-xl border px-3 py-1.5 font-bold ${
                    adapterState.optedIn
                      ? 'border-teal-400 bg-teal-500/20 text-teal-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {adapterState.optedIn
                    ? 'Disable Opt-In Test Adapter'
                    : 'Enable Opt-In Test Adapter'}
                </button>
                <span className="font-mono text-slate-400">
                  Protocol: {ADAPTER_PROTOCOL_VERSION} · Local Adapter Clock: T+
                  {adapterState.localClockSec}s
                </span>
              </div>

              {adapterState.optedIn && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="adapter-send-valid-hb-btn"
                    onClick={() => {
                      const seq = nextAdapterSeq;
                      setNextAdapterSeq((s) => s + 1);
                      setAdapterState((prev) =>
                        handleAdapterPollSuccess(prev, seq, {
                          protocol: ADAPTER_PROTOCOL_VERSION,
                          sequenceNumber: seq,
                          sourceId: 'TEST-LOCAL-NODE-1',
                          sourceLabel: 'Simulated Local Test Feed (Untested Hardware)',
                        })
                      );
                    }}
                    className="rounded-lg border border-emerald-500/50 bg-emerald-950/40 px-2.5 py-1.5 font-bold text-emerald-200"
                  >
                    Simulate Valid Poll (#{nextAdapterSeq})
                  </button>
                  <button
                    type="button"
                    data-testid="adapter-trigger-failure-btn"
                    onClick={() => {
                      const seq = nextAdapterSeq;
                      setNextAdapterSeq((s) => s + 1);
                      setAdapterState((prev) =>
                        handleAdapterPollFailure(
                          prev,
                          seq,
                          'Transport poll HTTP 500 / serial read timeout'
                        )
                      );
                    }}
                    className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-2.5 py-1.5 font-bold text-rose-200"
                  >
                    Simulate Poll Failure / Disconnect
                  </button>
                  <button
                    type="button"
                    data-testid="adapter-advance-clock-btn"
                    onClick={() =>
                      setAdapterState((prev) => advanceAdapterClock(prev, 3))
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-bold text-slate-200"
                  >
                    Advance Adapter Clock +3s
                  </button>
                  <button
                    type="button"
                    data-testid="adapter-out-of-order-btn"
                    onClick={() =>
                      setAdapterState((prev) =>
                        handleAdapterPollSuccess(
                          prev,
                          Math.max(0, prev.highestCallbackSeq - 1),
                          {
                            protocol: ADAPTER_PROTOCOL_VERSION,
                            sequenceNumber: 0,
                            sourceId: 'STALE-CALLBACK',
                          }
                        )
                      )
                    }
                    className="rounded-lg border border-amber-500/50 bg-amber-950/40 px-2.5 py-1.5 font-bold text-amber-200"
                  >
                    Test Out-of-Order Callback Rejection
                  </button>
                </div>
              )}
            </div>

            <div
              data-testid="adapter-status-card"
              className={`rounded-xl border p-3.5 ${
                adapterView.cardStatus === 'FRESH_HEARTBEAT_RECEIVED'
                  ? 'border-emerald-500/40 bg-emerald-950/20'
                  : adapterView.isCachedDataStaleOrDisconnected
                  ? 'border-dashed border-rose-500/60 bg-rose-950/30'
                  : 'border-slate-800 bg-slate-900/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                <span data-testid="adapter-card-status" className="font-bold text-white">
                  Status: {adapterView.cardStatus} — {adapterView.statusHeadline}
                </span>
                <span className="text-cyan-300">
                  Snapshot Age:{' '}
                  {adapterView.snapshotAgeSec !== null
                    ? `${adapterView.snapshotAgeSec}s`
                    : '—'}{' '}
                  · Out-of-Order Ignored: {adapterState.ignoredOutOfOrderCallbacks}
                </span>
              </div>
              <p className="mt-1 text-slate-300">{adapterView.statusDetail}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
