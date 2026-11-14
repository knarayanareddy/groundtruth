/**
 * Optional test-only feed adapter — a pure state machine for a heartbeat feed.
 *
 * HONEST PROVENANCE (spec §7):
 *   - No physical device was attached, and none was tested. Every value here comes from buttons in
 *     the UI, which produce synthetic packets. This module opens no serial port, no USB device and
 *     no network connection, and it reads no wall clock.
 *   - Its purpose is to demonstrate the *state transitions* a real adapter would have to get right:
 *     a cached card must stop looking fresh the moment a poll fails, the age must keep advancing
 *     locally, and a late out-of-order callback must never roll the state backwards.
 *   - "Heartbeat received" means only that a frame arrived. It says nothing about whether any
 *     physical thing is working, and nothing about what is being monitored.
 *
 * Ported from the Protocol Argon implementation (src/engine/localFeedAdapter.ts) and adapted to this
 * codebase. The clock is advanced explicitly by the caller, so every derived value is a pure
 * function of the state.
 */

export const ADAPTER_PROTOCOL = "groundtruth-blindspot-test-feed/v1";
export const ADAPTER_MAX_LOG = 20;

/** Shown verbatim in the UI so the hardware status can never be mistaken for a tested result. */
export const HARDWARE_STATUS_LABEL = "UNTESTED — NO PHYSICAL DEVICE ATTACHED";

export type AdapterCardStatus =
  | "OPT_IN_DISABLED"
  | "WAITING_FOR_FIRST_PACKET"
  | "FRESH_HEARTBEAT_RECEIVED"
  | "DISCONNECTED_OR_POLL_FAILED_UNKNOWN"
  | "STALE_THRESHOLD_EXCEEDED_UNKNOWN";

export interface AdapterPacket {
  protocol: string;
  sequenceNumber: number;
  sourceId: string;
  sourceLabel?: string;
}

export interface AdapterState {
  optedIn: boolean;
  hardwareStatusLabel: typeof HARDWARE_STATUS_LABEL;
  protocolVersion: typeof ADAPTER_PROTOCOL;
  thresholdSec: number;
  /** Local adapter clock, in whole seconds. Advanced only by advanceAdapterClock. */
  clockSec: number;
  /** Highest callback sequence already processed; enforces monotonic ordering. */
  highestCallbackSeq: number;
  lastSuccessfulPollAtSec: number | null;
  lastHeartbeatAtSec: number | null;
  lastSequenceNumber: number | null;
  lastSourceId: string | null;
  lastSourceLabel: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  /** Set on the poll that ended an outage; null again on the next healthy poll. */
  recoveredAfterOutageSec: number | null;
  ignoredOutOfOrderCallbacks: number;
  log: string[];
}

export interface AdapterView {
  cardStatus: AdapterCardStatus;
  snapshotAgeSec: number | null;
  heartbeatAgeSec: number | null;
  /** True whenever the cached card must not be read as current. */
  cachedDataIsStaleOrDisconnected: boolean;
  headline: string;
  detail: string;
}

function push(log: string[], entry: string): string[] {
  return [entry, ...log].slice(0, ADAPTER_MAX_LOG);
}

export function createAdapterState(thresholdSec = 5): AdapterState {
  const threshold = Number.isFinite(thresholdSec) && thresholdSec > 0 ? Math.trunc(thresholdSec) : 5;
  return {
    optedIn: false,
    hardwareStatusLabel: HARDWARE_STATUS_LABEL,
    protocolVersion: ADAPTER_PROTOCOL,
    thresholdSec: threshold,
    clockSec: 0,
    highestCallbackSeq: 0,
    lastSuccessfulPollAtSec: null,
    lastHeartbeatAtSec: null,
    lastSequenceNumber: null,
    lastSourceId: null,
    lastSourceLabel: null,
    consecutiveFailures: 0,
    lastError: null,
    recoveredAfterOutageSec: null,
    ignoredOutOfOrderCallbacks: 0,
    log: [`Adapter created, opt-in off. ${HARDWARE_STATUS_LABEL}.`],
  };
}

export function setOptIn(state: AdapterState, optedIn: boolean): AdapterState {
  if (!optedIn) {
    // Turning opt-in off discards all cached feed data: nothing stale may linger as if current.
    return {
      ...createAdapterState(state.thresholdSec),
      clockSec: state.clockSec,
      log: push(state.log, `[t=${state.clockSec}s] Opt-in turned off. Cached feed state discarded.`),
    };
  }
  return {
    ...state,
    optedIn: true,
    consecutiveFailures: 0,
    lastError: null,
    log: push(state.log, `[t=${state.clockSec}s] Opt-in turned on for the simulated test feed (protocol ${ADAPTER_PROTOCOL}). Still no physical device.`),
  };
}

export function advanceAdapterClock(state: AdapterState, deltaSec: number): AdapterState {
  if (!Number.isFinite(deltaSec) || deltaSec <= 0) return state;
  return { ...state, clockSec: state.clockSec + Math.trunc(deltaSec) };
}

/**
 * Handles a successful poll. Validates the frame, then enforces monotonic callback ordering so a
 * late callback cannot overwrite a newer result.
 */
export function handlePollSuccess(state: AdapterState, callbackSeq: number, rawPacket: unknown): AdapterState {
  if (!state.optedIn) return state;

  if (!Number.isInteger(callbackSeq) || callbackSeq <= state.highestCallbackSeq) {
    return {
      ...state,
      ignoredOutOfOrderCallbacks: state.ignoredOutOfOrderCallbacks + 1,
      log: push(state.log, `[t=${state.clockSec}s] Ignored out-of-order callback (seq ${callbackSeq}, highest processed ${state.highestCallbackSeq}). State cannot roll backwards.`),
    };
  }

  if (typeof rawPacket !== "object" || rawPacket === null) {
    return handlePollFailure(state, callbackSeq, "frame is not a JSON object");
  }
  const pkt = rawPacket as Record<string, unknown>;
  if (pkt.protocol !== ADAPTER_PROTOCOL) {
    return handlePollFailure(state, callbackSeq, `protocol mismatch: got ${JSON.stringify(pkt.protocol)}, expected ${ADAPTER_PROTOCOL}`);
  }
  if (typeof pkt.sequenceNumber !== "number" || !Number.isFinite(pkt.sequenceNumber) || pkt.sequenceNumber < 0) {
    return handlePollFailure(state, callbackSeq, "sequenceNumber must be a non-negative finite number");
  }
  if (typeof pkt.sourceId !== "string" || pkt.sourceId.trim().length === 0) {
    return handlePollFailure(state, callbackSeq, "sourceId must be a non-empty string");
  }

  const prev = deriveAdapterView(state);
  const hadHeartbeat = state.lastHeartbeatAtSec !== null;
  const wasOutage = hadHeartbeat && (state.consecutiveFailures > 0 || prev.cachedDataIsStaleOrDisconnected);
  const outageSec = wasOutage && state.lastHeartbeatAtSec !== null ? state.clockSec - state.lastHeartbeatAtSec : null;

  const entry = wasOutage
    ? `[t=${state.clockSec}s] Heartbeat receipt RESUMED (callback ${callbackSeq}, frame seq ${pkt.sequenceNumber}) after a ${outageSec}s gap. Receipt only — not evidence about any device or area.`
    : `[t=${state.clockSec}s] Frame accepted (callback ${callbackSeq}, frame seq ${pkt.sequenceNumber}, source ${pkt.sourceId}).`;

  return {
    ...state,
    highestCallbackSeq: callbackSeq,
    lastSuccessfulPollAtSec: state.clockSec,
    lastHeartbeatAtSec: state.clockSec,
    lastSequenceNumber: pkt.sequenceNumber,
    lastSourceId: pkt.sourceId,
    lastSourceLabel: typeof pkt.sourceLabel === "string" && pkt.sourceLabel.trim() ? pkt.sourceLabel : pkt.sourceId,
    consecutiveFailures: 0,
    lastError: null,
    // Keep the recovery note for the poll that ended the outage only; a later healthy poll clears it.
    recoveredAfterOutageSec: outageSec,
    log: push(state.log, entry),
  };
}

/** Handles a poll error or disconnect. A cached card stops being presentable immediately. */
export function handlePollFailure(state: AdapterState, callbackSeq: number, reason: string): AdapterState {
  if (!state.optedIn) return state;

  if (!Number.isInteger(callbackSeq) || callbackSeq <= state.highestCallbackSeq) {
    return {
      ...state,
      ignoredOutOfOrderCallbacks: state.ignoredOutOfOrderCallbacks + 1,
      log: push(state.log, `[t=${state.clockSec}s] Ignored out-of-order failure callback (seq ${callbackSeq}, highest processed ${state.highestCallbackSeq}).`),
    };
  }
  const failures = state.consecutiveFailures + 1;
  return {
    ...state,
    highestCallbackSeq: callbackSeq,
    consecutiveFailures: failures,
    lastError: reason,
    log: push(state.log, `[t=${state.clockSec}s] Poll failure ${failures} (callback ${callbackSeq}): ${reason}. Cached card is no longer presented as fresh.`),
  };
}

/**
 * Derives what the UI may show. A failure or a threshold timeout always moves the card off
 * FRESH_HEARTBEAT_RECEIVED, and the reported age keeps growing with the local clock.
 */
export function deriveAdapterView(state: AdapterState): AdapterView {
  if (!state.optedIn) {
    return {
      cardStatus: "OPT_IN_DISABLED",
      snapshotAgeSec: null,
      heartbeatAgeSec: null,
      cachedDataIsStaleOrDisconnected: false,
      headline: "OPT-IN OFF — NOTHING CACHED",
      detail: `The core prototype does not need this adapter; it replays a local event log. ${HARDWARE_STATUS_LABEL}.`,
    };
  }

  const snapshotAgeSec = state.lastSuccessfulPollAtSec === null ? null : state.clockSec - state.lastSuccessfulPollAtSec;
  const heartbeatAgeSec = state.lastHeartbeatAtSec === null ? null : state.clockSec - state.lastHeartbeatAtSec;

  if (state.consecutiveFailures > 0) {
    return {
      cardStatus: "DISCONNECTED_OR_POLL_FAILED_UNKNOWN",
      snapshotAgeSec,
      heartbeatAgeSec,
      cachedDataIsStaleOrDisconnected: true,
      headline: "DISCONNECTED / POLL FAILED — STATUS UNKNOWN (NOT FRESH)",
      detail: `Last error: ${state.lastError ?? "poll failed"} (${state.consecutiveFailures} consecutive). ${
        snapshotAgeSec === null
          ? "No successful poll has been received yet."
          : `The cached snapshot from t=${state.lastSuccessfulPollAtSec}s is now ${snapshotAgeSec}s old and cannot be treated as current.`
      }`,
    };
  }

  if (state.lastHeartbeatAtSec === null || heartbeatAgeSec === null) {
    return {
      cardStatus: "WAITING_FOR_FIRST_PACKET",
      snapshotAgeSec: null,
      heartbeatAgeSec: null,
      cachedDataIsStaleOrDisconnected: false,
      headline: "WAITING / UNKNOWN — NO HEARTBEAT RECEIVED YET",
      detail: "Opt-in is on and the first frame has not arrived. Nothing is shown as fresh before receipt.",
    };
  }

  if (heartbeatAgeSec >= state.thresholdSec) {
    return {
      cardStatus: "STALE_THRESHOLD_EXCEEDED_UNKNOWN",
      snapshotAgeSec,
      heartbeatAgeSec,
      cachedDataIsStaleOrDisconnected: true,
      headline: `STALE / UNKNOWN — AGE ${heartbeatAgeSec}s ≥ ${state.thresholdSec}s THRESHOLD`,
      detail: `Last heartbeat received at t=${state.lastHeartbeatAtSec}s; the local age keeps advancing. No recent heartbeat — the cause is not established.`,
    };
  }

  return {
    cardStatus: "FRESH_HEARTBEAT_RECEIVED",
    snapshotAgeSec,
    heartbeatAgeSec,
    cachedDataIsStaleOrDisconnected: false,
    headline:
      state.recoveredAfterOutageSec !== null
        ? `FRESH HEARTBEAT (RESUMED AFTER A ${state.recoveredAfterOutageSec}s GAP)`
        : `FRESH HEARTBEAT (AGE ${heartbeatAgeSec}s < ${state.thresholdSec}s THRESHOLD)`,
    detail: `Frame seq ${state.lastSequenceNumber} from "${state.lastSourceLabel}" at t=${state.lastHeartbeatAtSec}s (snapshot age ${snapshotAgeSec}s). Simulated feed — ${HARDWARE_STATUS_LABEL}.`,
  };
}

/** Builds the synthetic frame the UI buttons send. Kept here so tests and UI share one shape. */
export function makeSimulatedPacket(sourceId: string, sequenceNumber: number, sourceLabel?: string): AdapterPacket {
  return { protocol: ADAPTER_PROTOCOL, sequenceNumber, sourceId, sourceLabel };
}
