import { LIMITS } from "../engine/constants";
import { nextId, type Imported } from "../engine/record";
import { initialReplay, replayReducer, type ReplayAction, type ReplayState } from "../engine/replay";
import type { ReviewerNote, Scenario, UserSynthetic } from "../engine/types";
import type { ValidationError } from "../engine/validate";

export type Msg = { kind: "info" | "ok" | "warn" | "error"; text: string };

export interface AppState {
  scenario: Scenario | null;
  user: UserSynthetic;
  notes: ReviewerNote[];
  replay: ReplayState | null;
  showAllNotes: boolean;
  alias: string;
  msg: Msg | null;
  importErrors: { label: string; errors: ValidationError[] } | null;
  importWarnings: string[];
  origin: string | null;
}

export const EMPTY_USER: UserSynthetic = { events: [], dropWindows: [] };

export const initialState: AppState = {
  scenario: null,
  user: EMPTY_USER,
  notes: [],
  replay: null,
  showAllNotes: false,
  alias: "local reviewer",
  msg: null,
  importErrors: null,
  importWarnings: [],
  origin: null,
};

export type Action =
  | { t: "load"; imp: Imported; label: string }
  | { t: "reset" }
  | { t: "replay"; a: ReplayAction }
  | { t: "note"; text: string }
  | { t: "alias"; v: string }
  | { t: "inject"; sourceId: string }
  | { t: "drop"; sourceId: string; seconds: number }
  | { t: "clearSynthetic" }
  | { t: "showAll"; v: boolean }
  | { t: "importError"; label: string; errors: ValidationError[] }
  | { t: "msg"; msg: Msg | null }
  | { t: "dismissImport" };

function allEventIds(s: AppState): Set<string> {
  return new Set([...(s.scenario?.events.map((e) => e.id) ?? []), ...s.user.events.map((e) => e.id)]);
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.t) {
    case "load": {
      const { imp } = a;
      return {
        ...s,
        scenario: imp.scenario,
        user: imp.user,
        notes: imp.notes,
        replay: initialReplay(imp.scenario.durationSeconds, imp.T, imp.speed),
        showAllNotes: false,
        importErrors: null,
        importWarnings: imp.warnings,
        origin: a.label,
        msg: {
          kind: imp.warnings.length ? "warn" : "ok",
          text: `Loaded ${a.label}. Replay is paused at T = ${imp.T} s. Status was recomputed from the events.`,
        },
      };
    }
    case "reset":
      return { ...initialState, alias: s.alias, msg: { kind: "info", text: "Session cleared in this tab. Any copy saved in this browser is untouched until you delete it." } };
    case "replay":
      return s.replay ? { ...s, replay: replayReducer(s.replay, a.a) } : s;
    case "note": {
      if (!s.replay || s.notes.length >= LIMITS.maxNotes) return { ...s, msg: { kind: "error", text: `Note limit (${LIMITS.maxNotes}) reached.` } };
      const text = a.text.trim().slice(0, LIMITS.maxNoteLen);
      if (!text) return s;
      const note: ReviewerNote = {
        id: nextId("note-", new Set(s.notes.map((n) => n.id))),
        text,
        authoredAtT: s.replay.T,
        alias: (s.alias.trim() || "local reviewer").slice(0, 40),
      };
      return { ...s, notes: [...s.notes, note], msg: { kind: "ok", text: `Note ${note.id} added at T = ${note.authoredAtT} s (local, unauthenticated alias).` } };
    }
    case "alias":
      return { ...s, alias: a.v.slice(0, 40) };
    case "inject": {
      if (!s.replay || !s.scenario || s.user.events.length >= LIMITS.maxUserEvents) return s;
      const T = s.replay.T;
      const id = nextId("syn-hb-", allEventIds(s));
      return {
        ...s,
        user: { ...s.user, events: [...s.user.events, { id, sourceId: a.sourceId, receivedAt: T, type: "heartbeat", synthetic: true, authoredAtT: T }] },
        msg: { kind: "info", text: `Synthetic heartbeat ${id} added for ${a.sourceId} at T = ${T} s. It is an explicit synthetic event, included in exports. It is not a real device message.` },
      };
    }
    case "drop": {
      if (!s.replay || !s.scenario || s.user.dropWindows.length >= LIMITS.maxDropWindows) return s;
      const T = s.replay.T;
      const seconds = Math.max(1, Math.min(LIMITS.maxDuration, Math.trunc(a.seconds) || 1));
      const used = new Set(s.user.dropWindows.map((w) => w.id));
      const id = nextId("drop-", used);
      return {
        ...s,
        user: { ...s.user, dropWindows: [...s.user.dropWindows, { id, sourceId: a.sourceId, fromT: T + 1, untilT: T + 1 + seconds, authoredAtT: T }] },
        msg: { kind: "info", text: `Synthetic drop window ${id}: original-log heartbeats from ${a.sourceId} received in t = ${T + 1}…${T + seconds} s will be treated as not received. Included in exports. Nothing is physically unplugged.` },
      };
    }
    case "clearSynthetic":
      return { ...s, user: EMPTY_USER, msg: { kind: "info", text: "All user-added synthetic heartbeats and drop windows were removed from this session." } };
    case "showAll":
      return { ...s, showAllNotes: a.v };
    case "importError":
      return {
        ...s,
        importErrors: { label: a.label, errors: a.errors },
        msg: { kind: "error", text: `Import of ${a.label} was rejected. The existing session was not changed.` },
      };
    case "dismissImport":
      return { ...s, importErrors: null };
    case "msg":
      return { ...s, msg: a.msg };
  }
}
