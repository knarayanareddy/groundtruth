import {
  DERIVATION_RULES,
  ENGINE_VERSION,
  LIMITS,
  RECORD_SCHEMA,
  SCENARIO_SCHEMA,
  SCHEMA_VERSION,
  TOOL_NAME,
  TOOL_VERSION,
} from "./constants";
import { deriveAt } from "./derive";
import { EXPORT_LABELS } from "./limits";
import { buildModel } from "./model";
import type { Model, ReviewerNote, Scenario, UserSynthetic } from "./types";
import { validateRecord, validateScenario, type Result, type ValidationError } from "./validate";

export interface Session {
  scenario: Scenario;
  user: UserSynthetic;
  notes: ReviewerNote[];
  T: number;
  speed: number;
}

export interface SnapshotSummary {
  atT: number;
  sources: {
    id: string;
    heartbeatState: string;
    lastPacketReceivedAt: number | null;
    lastHeartbeatReceivedAt: number | null;
  }[];
  transitions: { sourceId: string; at: number; from: string; to: string }[];
  comparisons: { id: string; verdict: string }[];
}

export function summarize(model: Model, T: number): SnapshotSummary {
  const s = deriveAt(model, T);
  return {
    atT: T,
    sources: s.sources.map((x) => ({
      id: x.sourceId,
      heartbeatState: x.heartbeatState,
      lastPacketReceivedAt: x.lastPacketReceivedAt,
      lastHeartbeatReceivedAt: x.lastHeartbeatReceivedAt,
    })),
    transitions: s.transitions.map((t) => ({ sourceId: t.sourceId, at: t.at, from: t.from, to: t.to })),
    comparisons: s.comparisons.map((c) => ({ id: c.id, verdict: c.verdict })),
  };
}

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function buildRecord(s: Session, exportedAtWallClock?: string): Record<string, unknown> {
  const model = buildModel(s.scenario, s.user);
  const rec: Record<string, unknown> = {
    schema: RECORD_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    labels: EXPORT_LABELS,
    derivationRules: DERIVATION_RULES,
    exportNotice:
      "This export may contain text you typed. It is not anonymised, encrypted or signed. Reviewer aliases are unauthenticated. The importing app recomputes all status from events and does not trust derivedSnapshot.",
    scenario: s.scenario,
    userSynthetic: s.user,
    replay: { currentT: s.T, speed: s.speed },
    reviewerNotes: s.notes,
    derivedSnapshot: summarize(model, s.T),
  };
  if (exportedAtWallClock) rec.exportedAtWallClock = exportedAtWallClock;
  return rec;
}

export interface Imported {
  kind: "scenario" | "record";
  scenario: Scenario;
  user: UserSynthetic;
  notes: ReviewerNote[];
  T: number;
  speed: number;
  /** True when a stored derivedSnapshot disagrees with the recomputation (recomputed values win). */
  snapshotMismatch: boolean;
  warnings: string[];
}

/** All-or-nothing: returns either a fully validated import or errors. Never partially applies. */
export function parseImportText(text: string): Result<Imported> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > LIMITS.maxBytes) {
    return { ok: false, errors: [{ path: "$", message: `input is ${bytes} bytes; the limit is ${LIMITS.maxBytes} bytes (1 MiB)` }] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: "$", message: `malformed JSON: ${(e as Error).message}` }] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: "$", message: "must be a JSON object" }] };
  }
  const schema = (raw as Record<string, unknown>).schema;
  if (schema === RECORD_SCHEMA) {
    const r = validateRecord(raw);
    if (!r.ok) return r;
    const v = r.value;
    let mismatch = false;
    const warnings = [...r.warnings];
    if (v.derivedSnapshot !== null) {
      const stored = v.derivedSnapshot as Record<string, unknown>;
      const atT = stored.atT;
      if (typeof atT !== "number" || !Number.isInteger(atT) || atT < 0 || atT > v.scenario.durationSeconds) {
        mismatch = true;
      } else {
        const fresh = summarize(buildModel(v.scenario, v.user), atT);
        mismatch = canonicalJson(fresh) !== canonicalJson(stored);
      }
      if (mismatch) {
        warnings.push(
          "The stored derivedSnapshot does not match the status recomputed from the events. The recomputed values are used; the stored snapshot is ignored.",
        );
      }
    }
    return {
      ok: true,
      warnings,
      value: { kind: "record", scenario: v.scenario, user: v.user, notes: v.notes, T: v.replay.currentT, speed: v.replay.speed, snapshotMismatch: mismatch, warnings },
    };
  }
  if (schema === SCENARIO_SCHEMA) {
    const r = validateScenario(raw);
    if (!r.ok) return r;
    return {
      ok: true,
      warnings: r.warnings,
      value: { kind: "scenario", scenario: r.value, user: { events: [], dropWindows: [] }, notes: [], T: 0, speed: 1, snapshotMismatch: false, warnings: r.warnings },
    };
  }
  const errors: ValidationError[] = [
    { path: "$.schema", message: `must be "${SCENARIO_SCHEMA}" (scenario) or "${RECORD_SCHEMA}" (exported record)` },
  ];
  return { ok: false, errors };
}

export function nextId(prefix: string, used: Set<string>): string {
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Notes are a separate non-causal layer: during ordinary replay only notes authored at T' <= T are shown. */
export function visibleNotes(notes: ReviewerNote[], T: number, showAll: boolean): ReviewerNote[] {
  return showAll ? notes : notes.filter((n) => n.authoredAtT <= T);
}
