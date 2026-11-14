import {
  CLOCK_QUALITY,
  DATA_ORIGIN,
  DEPENDENCY_KNOWLEDGE,
  ENGINE_VERSION,
  ID_PATTERN,
  LIMITS,
  RECORD_SCHEMA,
  SCENARIO_SCHEMA,
  SCHEMA_VERSION,
  SPEEDS,
} from "./constants";
import { compareEvents } from "./model";
import type {
  ComparisonKey,
  Dependency,
  DropWindow,
  LogEvent,
  ObservationPayload,
  ReviewerNote,
  Scenario,
  SourceDef,
  SyntheticHeartbeat,
  UserSynthetic,
} from "./types";

export interface ValidationError {
  path: string;
  message: string;
}
export type Result<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: ValidationError[] };

class Ctx {
  errors: ValidationError[] = [];
  warnings: string[] = [];
  overflow = false;
  err(path: string, message: string) {
    if (this.errors.length < LIMITS.maxErrors) this.errors.push({ path, message });
    else this.overflow = true;
  }
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function keys(c: Ctx, o: Record<string, unknown>, path: string, required: string[], optional: string[] = []) {
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) c.err(`${path}.${k}`, "unknown field (strict schema)");
  }
  for (const r of required) if (!has(o, r)) c.err(`${path}.${r}`, "required field is missing");
}

function str(c: Ctx, v: unknown, path: string, max: number = LIMITS.maxStringLen): string | null {
  if (typeof v !== "string") {
    c.err(path, "must be a string");
    return null;
  }
  if (v.trim().length === 0) {
    c.err(path, "must not be empty");
    return null;
  }
  if (v.length > max) {
    c.err(path, `must be at most ${max} characters`);
    return null;
  }
  return v;
}

function id(c: Ctx, v: unknown, path: string): string | null {
  if (typeof v !== "string") {
    c.err(path, "must be a string ID");
    return null;
  }
  if (!ID_PATTERN.test(v)) {
    c.err(path, "invalid ID: use 1-64 chars of A-Z a-z 0-9 . _ : - and start with a letter or digit");
    return null;
  }
  return v;
}

function int(c: Ctx, v: unknown, path: string, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    c.err(path, "must be a finite number");
    return null;
  }
  if (!Number.isSafeInteger(v)) {
    c.err(path, "must be an integer number of virtual seconds");
    return null;
  }
  if (v < min) {
    c.err(path, `must be >= ${min}`);
    return null;
  }
  if (v > max) {
    c.err(path, `must be <= ${max}`);
    return null;
  }
  return v;
}

function oneOf<T extends string>(c: Ctx, v: unknown, path: string, allowed: readonly T[]): T | null {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    c.err(path, `must be one of: ${allowed.join(", ")}`);
    return null;
  }
  return v as T;
}

function arr(c: Ctx, v: unknown, path: string, max: number): unknown[] | null {
  if (!Array.isArray(v)) {
    c.err(path, "must be an array");
    return null;
  }
  if (v.length > max) {
    c.err(path, `has ${v.length} entries; the limit is ${max}`);
    return null;
  }
  return v;
}

function validateObservation(c: Ctx, o: unknown, path: string, durationMax: number): ObservationPayload | null {
  if (!isObj(o)) {
    c.err(path, "must be an object");
    return null;
  }
  keys(c, o, path, ["comparisonKey", "value", "observedAt", "clockQuality"], ["backfilled"]);
  let ck: ComparisonKey | null = null;
  if (has(o, "comparisonKey")) {
    const k = o.comparisonKey;
    if (!isObj(k)) c.err(`${path}.comparisonKey`, "must be an object");
    else {
      keys(c, k, `${path}.comparisonKey`, ["subject", "property", "unit", "context"]);
      const subject = has(k, "subject") ? str(c, k.subject, `${path}.comparisonKey.subject`) : null;
      const property = has(k, "property") ? str(c, k.property, `${path}.comparisonKey.property`) : null;
      const unit = has(k, "unit") ? str(c, k.unit, `${path}.comparisonKey.unit`) : null;
      const context = has(k, "context") ? str(c, k.context, `${path}.comparisonKey.context`) : null;
      if (subject && property && unit && context) ck = { subject, property, unit, context };
    }
  }
  let value: string | null | undefined;
  if (has(o, "value")) {
    if (o.value === null) value = null;
    else value = str(c, o.value, `${path}.value`) ?? undefined;
  }
  let observedAt: number | "unknown" | undefined;
  if (has(o, "observedAt")) {
    if (o.observedAt === "unknown") observedAt = "unknown";
    else observedAt = int(c, o.observedAt, `${path}.observedAt`, 0, durationMax) ?? undefined;
  }
  const clock = has(o, "clockQuality") ? oneOf(c, o.clockQuality, `${path}.clockQuality`, CLOCK_QUALITY) : null;
  let backfilled = false;
  if (has(o, "backfilled")) {
    if (typeof o.backfilled !== "boolean") c.err(`${path}.backfilled`, "must be true or false");
    else backfilled = o.backfilled;
  }
  if (ck && value !== undefined && observedAt !== undefined && clock) {
    return { comparisonKey: ck, value, observedAt, clockQuality: clock, backfilled };
  }
  return null;
}

function validateScenarioInto(c: Ctx, raw: unknown, path: string): Scenario | null {
  if (!isObj(raw)) {
    c.err(path, "must be a JSON object");
    return null;
  }
  keys(
    c, raw, path,
    ["schema", "schemaVersion", "engineVersion", "meta", "timeUnit", "durationSeconds", "heartbeatThresholdSeconds", "comparisonToleranceSeconds", "dependencies", "sources", "events"],
    ["observationRecencySeconds"],
  );
  if (has(raw, "schema") && raw.schema !== SCENARIO_SCHEMA) c.err(`${path}.schema`, `must be "${SCENARIO_SCHEMA}"`);
  if (has(raw, "schemaVersion") && raw.schemaVersion !== SCHEMA_VERSION) {
    c.err(`${path}.schemaVersion`, `unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)}; supported: ${SCHEMA_VERSION}`);
  }
  if (has(raw, "engineVersion") && raw.engineVersion !== ENGINE_VERSION) {
    c.err(`${path}.engineVersion`, `unsupported engineVersion ${JSON.stringify(raw.engineVersion)}; supported: "${ENGINE_VERSION}"`);
  }
  if (has(raw, "timeUnit") && raw.timeUnit !== "seconds") c.err(`${path}.timeUnit`, 'must be "seconds" (integer virtual elapsed seconds)');

  let meta: Scenario["meta"] | null = null;
  if (has(raw, "meta")) {
    if (!isObj(raw.meta)) c.err(`${path}.meta`, "must be an object");
    else {
      keys(c, raw.meta, `${path}.meta`, ["title", "dataOrigin"], ["description"]);
      const title = has(raw.meta, "title") ? str(c, raw.meta.title, `${path}.meta.title`) : null;
      const origin = has(raw.meta, "dataOrigin") ? oneOf(c, raw.meta.dataOrigin, `${path}.meta.dataOrigin`, DATA_ORIGIN) : null;
      let description = "";
      if (has(raw.meta, "description")) description = str(c, raw.meta.description, `${path}.meta.description`, LIMITS.maxDescriptionLen) ?? "";
      if (title && origin) meta = { title, description, dataOrigin: origin };
    }
  }

  const duration = has(raw, "durationSeconds") ? int(c, raw.durationSeconds, `${path}.durationSeconds`, 1, LIMITS.maxDuration) : null;
  const threshold = has(raw, "heartbeatThresholdSeconds")
    ? int(c, raw.heartbeatThresholdSeconds, `${path}.heartbeatThresholdSeconds`, 1, LIMITS.maxThreshold)
    : null;
  const tolerance = has(raw, "comparisonToleranceSeconds")
    ? int(c, raw.comparisonToleranceSeconds, `${path}.comparisonToleranceSeconds`, 0, LIMITS.maxTolerance)
    : null;
  let recency: number | undefined;
  if (has(raw, "observationRecencySeconds")) {
    recency = int(c, raw.observationRecencySeconds, `${path}.observationRecencySeconds`, 1, LIMITS.maxDuration) ?? undefined;
  }
  const dmax = duration ?? LIMITS.maxDuration;

  // Dependencies
  const dependencies: Dependency[] = [];
  const depIds = new Set<string>();
  const depNames = new Set<string>();
  const depArr = has(raw, "dependencies") ? arr(c, raw.dependencies, `${path}.dependencies`, LIMITS.maxDependencies) : null;
  depArr?.forEach((d, i) => {
    const p = `${path}.dependencies[${i}]`;
    if (!isObj(d)) return c.err(p, "must be an object");
    keys(c, d, p, ["id", "name"]);
    const did = has(d, "id") ? id(c, d.id, `${p}.id`) : null;
    const name = has(d, "name") ? str(c, d.name, `${p}.name`) : null;
    if (did) {
      if (depIds.has(did)) c.err(`${p}.id`, `duplicate dependency ID "${did}"`);
      depIds.add(did);
    }
    if (name) {
      const n = name.trim().toLowerCase();
      if (depNames.has(n)) c.err(`${p}.name`, `duplicate dependency name "${name}"`);
      depNames.add(n);
    }
    if (did && name) dependencies.push({ id: did, name });
  });

  // Sources
  const sources: SourceDef[] = [];
  const srcIds = new Set<string>();
  const srcNames = new Set<string>();
  const srcArr = has(raw, "sources") ? arr(c, raw.sources, `${path}.sources`, LIMITS.maxSources) : null;
  if (srcArr && srcArr.length === 0) c.err(`${path}.sources`, "must contain at least one source");
  srcArr?.forEach((s, i) => {
    const p = `${path}.sources[${i}]`;
    if (!isObj(s)) return c.err(p, "must be an object");
    keys(c, s, p, ["id", "name", "dependencyKnowledge", "dependencyIds", "dependencyDeclaredBy"]);
    const sid = has(s, "id") ? id(c, s.id, `${p}.id`) : null;
    const name = has(s, "name") ? str(c, s.name, `${p}.name`) : null;
    const know = has(s, "dependencyKnowledge") ? oneOf(c, s.dependencyKnowledge, `${p}.dependencyKnowledge`, DEPENDENCY_KNOWLEDGE) : null;
    const declBy = has(s, "dependencyDeclaredBy") ? str(c, s.dependencyDeclaredBy, `${p}.dependencyDeclaredBy`) : null;
    let ids: string[] | null = null;
    if (has(s, "dependencyIds")) {
      const a = arr(c, s.dependencyIds, `${p}.dependencyIds`, LIMITS.maxDependencies);
      if (a) {
        ids = [];
        const seen = new Set<string>();
        a.forEach((d, j) => {
          const dp = `${p}.dependencyIds[${j}]`;
          const did = id(c, d, dp);
          if (!did) return;
          if (!depIds.has(did)) c.err(dp, `unresolved reference: dependency "${did}" is not defined in dependencies`);
          if (seen.has(did)) c.err(dp, `duplicate dependency reference "${did}"`);
          seen.add(did);
          ids!.push(did);
        });
      }
    }
    if (sid) {
      if (srcIds.has(sid)) c.err(`${p}.id`, `duplicate source ID "${sid}"`);
      srcIds.add(sid);
    }
    if (name) {
      const n = name.trim().toLowerCase();
      if (srcNames.has(n)) c.err(`${p}.name`, `duplicate source name "${name}"`);
      srcNames.add(n);
    }
    if (sid && name && know && declBy && ids) sources.push({ id: sid, name, dependencyKnowledge: know, dependencyIds: ids, dependencyDeclaredBy: declBy });
  });

  // Events
  const events: LogEvent[] = [];
  const evIds = new Set<string>();
  const evArr = has(raw, "events") ? arr(c, raw.events, `${path}.events`, LIMITS.maxEvents) : null;
  evArr?.forEach((e, i) => {
    const p = `${path}.events[${i}]`;
    if (!isObj(e)) return c.err(p, "must be an object");
    const type = has(e, "type") ? oneOf(c, e.type, `${p}.type`, ["heartbeat", "observation"] as const) : null;
    if (type === "heartbeat") keys(c, e, p, ["id", "sourceId", "receivedAt", "type"]);
    else if (type === "observation") keys(c, e, p, ["id", "sourceId", "receivedAt", "type", "observation"]);
    else keys(c, e, p, ["id", "sourceId", "receivedAt", "type"], ["observation"]);
    const eid = has(e, "id") ? id(c, e.id, `${p}.id`) : null;
    const sid = has(e, "sourceId") ? id(c, e.sourceId, `${p}.sourceId`) : null;
    if (sid && !srcIds.has(sid)) c.err(`${p}.sourceId`, `unresolved reference: source "${sid}" is not defined in sources`);
    const rcv = has(e, "receivedAt") ? int(c, e.receivedAt, `${p}.receivedAt`, 0, dmax) : null;
    if (eid) {
      if (evIds.has(eid)) c.err(`${p}.id`, `duplicate event ID "${eid}" (ambiguous duplicate rejected)`);
      evIds.add(eid);
    }
    if (type === "heartbeat" && eid && sid && rcv !== null) events.push({ id: eid, sourceId: sid, receivedAt: rcv, type });
    if (type === "observation") {
      const ob = has(e, "observation") ? validateObservation(c, e.observation, `${p}.observation`, dmax) : null;
      if (ob && eid && sid && rcv !== null) events.push({ id: eid, sourceId: sid, receivedAt: rcv, type, observation: ob });
    }
  });

  if (c.errors.length > 0 || !meta || duration === null || threshold === null || tolerance === null) return null;

  // Warnings (non-fatal).
  let inversions = 0;
  for (let i = 1; i < events.length; i++) if (compareEvents(events[i - 1], events[i]) > 0) inversions++;
  if (inversions > 0) {
    c.warnings.push(
      `${inversions} event(s) appear out of receivedAt order in the file. They are sorted by (receivedAt, id) for replay; no arrival affects state before its receivedAt. The original order is kept in exports.`,
    );
  }
  const seen = new Set<string>();
  let dupContent = 0;
  for (const e of events) {
    const k = JSON.stringify([e.sourceId, e.type, e.receivedAt, e.type === "observation" ? e.observation : null]);
    if (seen.has(k)) dupContent++;
    seen.add(k);
  }
  if (dupContent > 0) c.warnings.push(`${dupContent} event(s) have the same content as another event under a different ID (possible duplicate delivery). They are kept and replayed as separate events.`);
  const skewed = events.filter((e) => e.type === "observation" && typeof e.observation.observedAt === "number" && e.observation.observedAt > e.receivedAt).length;
  if (skewed > 0) c.warnings.push(`${skewed} observation(s) claim an observation time later than their receipt time (clock skew). They are flagged, not treated as fresh, and not compared.`);

  const scenario: Scenario = {
    schema: SCENARIO_SCHEMA,
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    meta,
    timeUnit: "seconds",
    durationSeconds: duration,
    heartbeatThresholdSeconds: threshold,
    comparisonToleranceSeconds: tolerance,
    dependencies,
    sources,
    events,
  };
  if (recency !== undefined) scenario.observationRecencySeconds = recency;
  return scenario;
}

export function validateScenario(raw: unknown): Result<Scenario> {
  const c = new Ctx();
  const s = validateScenarioInto(c, raw, "$");
  if (!s || c.errors.length) return { ok: false, errors: finish(c) };
  return { ok: true, value: s, warnings: c.warnings };
}

function finish(c: Ctx): ValidationError[] {
  const e = [...c.errors];
  if (c.overflow) e.push({ path: "$", message: `more than ${LIMITS.maxErrors} errors; further errors not shown` });
  if (e.length === 0) e.push({ path: "$", message: "invalid input" });
  return e;
}

export interface ValidatedRecord {
  scenario: Scenario;
  user: UserSynthetic;
  notes: ReviewerNote[];
  replay: { currentT: number; speed: number };
  derivedSnapshot: unknown | null;
}

export function validateRecord(raw: unknown): Result<ValidatedRecord> {
  const c = new Ctx();
  if (!isObj(raw)) {
    c.err("$", "must be a JSON object");
    return { ok: false, errors: finish(c) };
  }
  keys(c, raw, "$", ["schema", "schemaVersion", "engineVersion", "tool", "scenario", "userSynthetic", "replay", "reviewerNotes"], ["labels", "derivationRules", "derivedSnapshot", "exportNotice", "exportedAtWallClock"]);
  if (has(raw, "schema") && raw.schema !== RECORD_SCHEMA) c.err("$.schema", `must be "${RECORD_SCHEMA}"`);
  if (has(raw, "schemaVersion") && raw.schemaVersion !== SCHEMA_VERSION) c.err("$.schemaVersion", `unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)}; supported: ${SCHEMA_VERSION}`);
  if (has(raw, "engineVersion") && raw.engineVersion !== ENGINE_VERSION) c.err("$.engineVersion", `unsupported engineVersion ${JSON.stringify(raw.engineVersion)}; supported: "${ENGINE_VERSION}"`);
  if (has(raw, "tool")) {
    if (!isObj(raw.tool)) c.err("$.tool", "must be an object");
    else {
      keys(c, raw.tool, "$.tool", ["name", "version"]);
      if (has(raw.tool, "name")) str(c, raw.tool.name, "$.tool.name");
      if (has(raw.tool, "version")) str(c, raw.tool.version, "$.tool.version");
    }
  }
  for (const k of ["labels", "derivationRules"]) {
    if (has(raw, k)) {
      const a = arr(c, raw[k], `$.${k}`, 100);
      a?.forEach((x, i) => str(c, x, `$.${k}[${i}]`, LIMITS.maxNoteLen));
    }
  }
  if (has(raw, "exportNotice")) str(c, raw.exportNotice, "$.exportNotice", LIMITS.maxNoteLen);
  if (has(raw, "exportedAtWallClock")) str(c, raw.exportedAtWallClock, "$.exportedAtWallClock");

  const scenario = has(raw, "scenario") ? validateScenarioInto(c, raw.scenario, "$.scenario") : null;
  const duration = scenario?.durationSeconds ?? LIMITS.maxDuration;
  const srcIds = new Set(scenario?.sources.map((s) => s.id) ?? []);
  const evIds = new Set(scenario?.events.map((e) => e.id) ?? []);

  const user: UserSynthetic = { events: [], dropWindows: [] };
  if (has(raw, "userSynthetic")) {
    const u = raw.userSynthetic;
    if (!isObj(u)) c.err("$.userSynthetic", "must be an object");
    else {
      keys(c, u, "$.userSynthetic", ["events", "dropWindows"]);
      const ev = has(u, "events") ? arr(c, u.events, "$.userSynthetic.events", LIMITS.maxUserEvents) : null;
      ev?.forEach((e, i) => {
        const p = `$.userSynthetic.events[${i}]`;
        if (!isObj(e)) return c.err(p, "must be an object");
        keys(c, e, p, ["id", "sourceId", "receivedAt", "type", "synthetic", "authoredAtT"]);
        const eid = has(e, "id") ? id(c, e.id, `${p}.id`) : null;
        const sid = has(e, "sourceId") ? id(c, e.sourceId, `${p}.sourceId`) : null;
        if (sid && scenario && !srcIds.has(sid)) c.err(`${p}.sourceId`, `unresolved reference: source "${sid}"`);
        const rcv = has(e, "receivedAt") ? int(c, e.receivedAt, `${p}.receivedAt`, 0, duration) : null;
        if (has(e, "type") && e.type !== "heartbeat") c.err(`${p}.type`, 'only "heartbeat" is supported for synthetic events');
        if (has(e, "synthetic") && e.synthetic !== true) c.err(`${p}.synthetic`, "must be true");
        const at = has(e, "authoredAtT") ? int(c, e.authoredAtT, `${p}.authoredAtT`, 0, duration) : null;
        if (rcv !== null && at !== null && at > rcv) c.err(`${p}.authoredAtT`, "must not be later than receivedAt (no retroactive synthetic events)");
        if (eid) {
          if (evIds.has(eid)) c.err(`${p}.id`, `duplicate event ID "${eid}"`);
          evIds.add(eid);
        }
        if (eid && sid && rcv !== null && at !== null) user.events.push({ id: eid, sourceId: sid, receivedAt: rcv, type: "heartbeat", synthetic: true, authoredAtT: at } as SyntheticHeartbeat);
      });
      const dw = has(u, "dropWindows") ? arr(c, u.dropWindows, "$.userSynthetic.dropWindows", LIMITS.maxDropWindows) : null;
      const dwIds = new Set<string>();
      dw?.forEach((w, i) => {
        const p = `$.userSynthetic.dropWindows[${i}]`;
        if (!isObj(w)) return c.err(p, "must be an object");
        keys(c, w, p, ["id", "sourceId", "fromT", "untilT", "authoredAtT"]);
        const wid = has(w, "id") ? id(c, w.id, `${p}.id`) : null;
        const sid = has(w, "sourceId") ? id(c, w.sourceId, `${p}.sourceId`) : null;
        if (sid && scenario && !srcIds.has(sid)) c.err(`${p}.sourceId`, `unresolved reference: source "${sid}"`);
        const from = has(w, "fromT") ? int(c, w.fromT, `${p}.fromT`, 0, LIMITS.maxDuration + 1) : null;
        const until = has(w, "untilT") ? int(c, w.untilT, `${p}.untilT`, 0, LIMITS.maxDuration + 1) : null;
        const at = has(w, "authoredAtT") ? int(c, w.authoredAtT, `${p}.authoredAtT`, 0, duration) : null;
        if (from !== null && until !== null && until <= from) c.err(`${p}.untilT`, "must be greater than fromT");
        if (from !== null && at !== null && from <= at) c.err(`${p}.fromT`, "must be later than authoredAtT (a drop window cannot un-receive packets already seen)");
        if (wid) {
          if (dwIds.has(wid)) c.err(`${p}.id`, `duplicate drop window ID "${wid}"`);
          dwIds.add(wid);
        }
        if (wid && sid && from !== null && until !== null && at !== null) user.dropWindows.push({ id: wid, sourceId: sid, fromT: from, untilT: until, authoredAtT: at } as DropWindow);
      });
    }
  }

  let currentT = 0;
  let speed = 1;
  if (has(raw, "replay")) {
    const r = raw.replay;
    if (!isObj(r)) c.err("$.replay", "must be an object");
    else {
      keys(c, r, "$.replay", ["currentT", "speed"]);
      if (has(r, "currentT")) currentT = int(c, r.currentT, "$.replay.currentT", 0, duration) ?? 0;
      if (has(r, "speed")) {
        if (typeof r.speed !== "number" || !(SPEEDS as readonly number[]).includes(r.speed)) c.err("$.replay.speed", `must be one of: ${SPEEDS.join(", ")}`);
        else speed = r.speed;
      }
    }
  }

  const notes: ReviewerNote[] = [];
  const noteIds = new Set<string>();
  const na = has(raw, "reviewerNotes") ? arr(c, raw.reviewerNotes, "$.reviewerNotes", LIMITS.maxNotes) : null;
  na?.forEach((n, i) => {
    const p = `$.reviewerNotes[${i}]`;
    if (!isObj(n)) return c.err(p, "must be an object");
    keys(c, n, p, ["id", "text", "authoredAtT", "alias"]);
    const nid = has(n, "id") ? id(c, n.id, `${p}.id`) : null;
    const text = has(n, "text") ? str(c, n.text, `${p}.text`, LIMITS.maxNoteLen) : null;
    const at = has(n, "authoredAtT") ? int(c, n.authoredAtT, `${p}.authoredAtT`, 0, duration) : null;
    const alias = has(n, "alias") ? str(c, n.alias, `${p}.alias`, 40) : null;
    if (nid) {
      if (noteIds.has(nid)) c.err(`${p}.id`, `duplicate note ID "${nid}"`);
      noteIds.add(nid);
    }
    if (nid && text && at !== null && alias) notes.push({ id: nid, text, authoredAtT: at, alias });
  });

  let derivedSnapshot: unknown | null = null;
  if (has(raw, "derivedSnapshot")) {
    if (!isObj(raw.derivedSnapshot)) c.err("$.derivedSnapshot", "must be an object");
    else derivedSnapshot = raw.derivedSnapshot;
  }

  if (!scenario || c.errors.length > 0) return { ok: false, errors: finish(c) };
  return { ok: true, value: { scenario, user, notes, replay: { currentT, speed }, derivedSnapshot }, warnings: c.warnings };
}
