import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import fixtureJson from "../fixtures/reference-fixture.json";
import { LIMITS, TOOL_NAME, TOOL_VERSION } from "./engine/constants";
import { deriveAt } from "./engine/derive";
import { buildModel } from "./engine/model";
import { buildRecord, parseImportText } from "./engine/record";
import type { ReplayAction } from "./engine/replay";
import { validateScenario } from "./engine/validate";
import { ReplayControls } from "./ui/Controls";
import { DependencyPanel } from "./ui/DependencyPanel";
import { DisagreementPanel } from "./ui/DisagreementPanel";
import { EventLog } from "./ui/EventLog";
import { LimitsPanel } from "./ui/LimitsPanel";
import { NotesPanel } from "./ui/NotesPanel";
import { Badge, btn, btnPrimary, Section } from "./ui/shared";
import { SourceCards } from "./ui/SourceCards";
import { SyntheticPanel } from "./ui/SyntheticPanel";
import { Timeline } from "./ui/Timeline";
import { initialState, reducer } from "./ui/useSession";
import { deleteSaved, peekSaved, readSaved, writeSaved } from "./ui/storage";

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [saved, setSaved] = useState(() => peekSaved());
  const [storageMsg, setStorageMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { scenario, replay } = state;

  const model = useMemo(() => (scenario ? buildModel(scenario, state.user) : null), [scenario, state.user]);
  const snap = useMemo(() => (model && replay ? deriveAt(model, replay.T) : null), [model, replay?.T]); // eslint-disable-line react-hooks/exhaustive-deps

  const rd = useCallback((a: ReplayAction) => dispatch({ t: "replay", a }), []);

  // Play timer. The wall-clock delta only drives the virtual clock; derived status depends on T alone.
  const playing = replay?.playing ?? false;
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const h = window.setInterval(() => {
      const now = performance.now();
      rd({ type: "advance", wallMs: now - last });
      last = now;
    }, 200);
    return () => window.clearInterval(h);
  }, [playing, rd]);

  // Keyboard shortcuts (ignored while a control or field has focus so they never double-fire).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("input,textarea,select,button,a,[contenteditable]")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " ") { e.preventDefault(); rd({ type: "toggle" }); }
      else if (e.key === "ArrowRight") rd({ type: "step", delta: 1 });
      else if (e.key === "ArrowLeft") rd({ type: "step", delta: -1 });
      else if (e.key === "Home") rd({ type: "restart" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rd]);

  const loadText = useCallback((text: string, label: string) => {
    const r = parseImportText(text);
    if (r.ok) dispatch({ t: "load", imp: r.value, label });
    else dispatch({ t: "importError", label, errors: r.errors });
  }, []);

  const loadReference = () => {
    const r = validateScenario(fixtureJson);
    if (r.ok) {
      dispatch({
        t: "load",
        label: "the bundled reference fixture (synthetic)",
        imp: { kind: "scenario", scenario: r.value, user: { events: [], dropWindows: [] }, notes: [], T: 0, speed: 1, snapshotMismatch: false, warnings: r.warnings },
      });
    } else dispatch({ t: "importError", label: "bundled fixture", errors: r.errors });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > LIMITS.maxBytes) {
      dispatch({ t: "importError", label: file.name, errors: [{ path: "$", message: `file is ${file.size} bytes; the limit is ${LIMITS.maxBytes} bytes (1 MiB). It was not read.` }] });
      return;
    }
    try {
      loadText(await file.text(), `file “${file.name}”`);
    } catch {
      dispatch({ t: "importError", label: file.name, errors: [{ path: "$", message: "the file could not be read" }] });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const currentRecord = () =>
    scenario && replay
      ? buildRecord({ scenario, user: state.user, notes: state.notes, T: replay.T, speed: replay.speed }, new Date().toISOString())
      : null;

  const doExport = () => {
    const rec = currentRecord();
    if (!rec || !replay) return;
    downloadJson(`groundtruth-blindspot-record-T${replay.T}.json`, JSON.stringify(rec, null, 2));
    dispatch({ t: "msg", msg: { kind: "info", text: "A download was started. This app cannot see whether the browser saved the file or where. The export may contain text you typed and is not anonymised, encrypted or signed." } });
  };

  const doSave = () => {
    const rec = currentRecord();
    if (!rec) return;
    const r = writeSaved(JSON.stringify(rec));
    setStorageMsg(r.ok ? `Saved ${r.bytes} bytes to this browser's local storage (confirmed by read-back). It stays until you delete it.` : `NOT saved: ${r.reason}`);
    setSaved(peekSaved());
  };
  const doRestore = () => {
    const r = readSaved();
    if (!r.ok) { setStorageMsg(r.reason); return; }
    loadText(r.text, "the copy saved in this browser");
    setStorageMsg(null);
  };
  const doDelete = () => {
    const r = deleteSaved();
    setStorageMsg(r.ok ? "Saved browser copy deleted." : `Could not delete: ${r.reason}`);
    setSaved(peekSaved());
  };

  const announce = snap && !playing ? `T equals ${snap.T} seconds. ${snap.sources.map((s) => `${s.sourceId}: ${s.heartbeatState.replace("_", " ").replace("_", " ").toLowerCase()}`).join("; ")}.` : "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:outline focus:outline-4">Skip to main content</a>
      <header className="border-b-4 border-slate-900 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <h1 className="text-xl font-extrabold sm:text-2xl">Ground Truth + BlindSpot — source monitoring &amp; uncertainty review</h1>
          <p className="text-sm text-slate-700">Local-first prototype · {TOOL_NAME} v{TOOL_VERSION} · everything runs in this browser tab</p>
          <p data-testid="banner" className="mt-2 rounded border-2 border-slate-900 bg-yellow-100 p-2 text-sm font-semibold text-slate-950">
            SYNTHETIC OR USER-PROVIDED DATA · REPLAY ON A VIRTUAL CLOCK · NOT LIVE · NO HARDWARE. A heartbeat only means a message arrived; it is not proof that anything works or is correct. Silence is not a clear scene.
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl space-y-4 px-4 py-4" tabIndex={-1}>
        <Section id="session" title="Scenario and record" hint="Load the bundled synthetic reference fixture, or import your own JSON scenario or a previously exported record. Import is validated completely before anything changes.">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} onClick={loadReference} data-testid="btn-load-ref">Load reference fixture</button>
            <button type="button" className={btn} onClick={() => fileRef.current?.click()} data-testid="btn-import">Import JSON file…</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Import JSON file" data-testid="file-input" onChange={(e) => void onFile(e.target.files?.[0])} />
            <button type="button" className={btn} onClick={doExport} disabled={!scenario} data-testid="btn-export">Export record (JSON download)</button>
            <button type="button" className={btn} onClick={() => dispatch({ t: "reset" })} disabled={!scenario} data-testid="btn-reset">Clear session</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="storage-box">
            <span className="font-semibold">Browser storage (optional, explicit):</span>
            <button type="button" className={btn} onClick={doSave} disabled={!scenario} data-testid="btn-save-local">Save to this browser</button>
            <button type="button" className={btn} onClick={doRestore} disabled={!saved.exists} data-testid="btn-restore-local">Restore saved copy</button>
            <button type="button" className={btn} onClick={doDelete} disabled={!saved.exists} data-testid="btn-delete-local">Delete saved copy</button>
            <span data-testid="storage-status">{saved.exists ? `A saved copy exists (${saved.bytes} bytes).` : "Nothing is saved in this browser."}</span>
          </div>
          <p className="mt-1 text-xs text-slate-700">
            Save stores one JSON record (scenario, your synthetic additions, notes, replay position) under one localStorage key, only when you press Save. Exports are plain JSON that may contain text you typed; they are not anonymised, encrypted or signed.
          </p>
          {storageMsg ? <p role="status" data-testid="storage-msg" className="mt-1 text-sm font-semibold">{storageMsg}</p> : null}

          {state.msg ? (
            <div
              role={state.msg.kind === "error" ? "alert" : "status"}
              data-testid="message"
              data-kind={state.msg.kind}
              className={`mt-3 rounded border-2 p-2 text-sm font-semibold ${state.msg.kind === "error" ? "border-rose-800 bg-rose-50 text-rose-950" : state.msg.kind === "warn" ? "border-amber-800 bg-amber-50 text-amber-950" : "border-slate-600 bg-slate-50"}`}
            >
              {state.msg.kind === "error" ? "✖ " : state.msg.kind === "warn" ? "▲ " : "ℹ "}
              {state.msg.text}
            </div>
          ) : null}
          {state.importErrors ? (
            <div role="alert" data-testid="import-errors" className="mt-2 rounded border-2 border-rose-800 bg-white p-2 text-sm">
              <div className="font-bold">Rejected: {state.importErrors.label}. Nothing was imported; the current session is unchanged.</div>
              <ul className="mt-1 list-disc pl-5">
                {state.importErrors.errors.map((e, i) => (
                  <li key={i}><code className="font-bold">{e.path}</code> — {e.message}</li>
                ))}
              </ul>
              <button type="button" className={`${btn} mt-2`} onClick={() => dispatch({ t: "dismissImport" })}>Dismiss</button>
            </div>
          ) : null}
          {state.importWarnings.length > 0 ? (
            <ul data-testid="import-warnings" className="mt-2 list-disc rounded border-2 border-amber-800 bg-amber-50 p-2 pl-6 text-sm">
              {state.importWarnings.map((w, i) => (<li key={i}>{w}</li>))}
            </ul>
          ) : null}
        </Section>

        {!scenario || !replay || !snap || !model ? (
          <Section id="empty" title="No scenario loaded">
            <p data-testid="empty-state" className="text-sm">Nothing is being replayed, so no source has any status. Load the reference fixture to begin. Absence of data is shown as unknown, never as fresh or clear.</p>
            {saved.exists ? <p className="mt-1 text-sm">A copy saved in this browser is available — use “Restore saved copy”.</p> : null}
          </Section>
        ) : (
          <>
            <Section id="replay" title="Replay clock">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm" data-testid="scenario-meta">
                <strong>{scenario.meta.title}</strong>
                <Badge tone={scenario.meta.dataOrigin === "synthetic" ? "violet" : "amber"}>{scenario.meta.dataOrigin === "synthetic" ? "SYNTHETIC DATA" : "USER-PROVIDED DATA — unverified"}</Badge>
                <span>heartbeat threshold {scenario.heartbeatThresholdSeconds} s · comparison tolerance {scenario.comparisonToleranceSeconds} s · observation recency {model.recency} s · origin: {state.origin}</span>
                {scenario.meta.description ? <span className="basis-full text-xs text-slate-700">{scenario.meta.description}</span> : null}
              </div>
              <ReplayControls replay={replay} dispatch={rd} />
              <div className="sr-only" role="status" aria-live="polite" data-testid="announce">{announce}</div>
            </Section>

            <Section id="sources" title="Source status at T" hint="Heartbeat state, last packet, last heartbeat and observation timing are shown separately. They are three different things.">
              <SourceCards scenario={scenario} snap={snap} threshold={model.threshold} />
            </Section>

            <Section id="timeline" title="Timeline and transitions">
              <Timeline scenario={scenario} snap={snap} />
            </Section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section id="dependencies" title="Declared dependencies">
                <DependencyPanel scenario={scenario} />
              </Section>
              <Section id="disagreement" title="Report disagreement (limited cue)" hint="Compares received claims only under an explicit rule. It never picks a winner.">
                <DisagreementPanel snap={snap} />
              </Section>
            </div>

            <Section id="events" title="Event log (received so far)">
              <EventLog snap={snap} />
            </Section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section id="synthetic" title="Synthetic injection (optional)">
                <SyntheticPanel
                  scenario={scenario}
                  user={state.user}
                  T={replay.T}
                  onInject={(id) => dispatch({ t: "inject", sourceId: id })}
                  onDrop={(id, s) => dispatch({ t: "drop", sourceId: id, seconds: s })}
                  onClear={() => dispatch({ t: "clearSynthetic" })}
                />
              </Section>
              <Section id="notes" title="Reviewer notes (local)">
                <NotesPanel
                  notes={state.notes}
                  T={replay.T}
                  alias={state.alias}
                  showAll={state.showAllNotes}
                  onAlias={(v) => dispatch({ t: "alias", v })}
                  onAdd={(text) => dispatch({ t: "note", text })}
                  onShowAll={(v) => dispatch({ t: "showAll", v })}
                />
              </Section>
            </div>
          </>
        )}

        <Section id="limits" title="What this prototype does not show">
          <LimitsPanel />
        </Section>
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-600">
        No network requests are made by this app. Prototype for review of source status; not a safety, security or detection system.
      </footer>
    </div>
  );
}
