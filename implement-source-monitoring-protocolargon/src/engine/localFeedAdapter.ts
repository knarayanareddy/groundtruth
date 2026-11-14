/**
 * Optional, strictly separated test-only local heartbeat feed adapter state machine (Spec Section 7 & 8.6).
 *
 * HONEST HARDWARE PROVENANCE LABEL:
 * - Physical hardware verification status: UNTESTED WITH PHYSICAL ATECH FRAME 10 / FRAME 2.1 BOARDS.
 * - This module exercises local feed polling, disconnect/failure handling, advancing snapshot age,
 *   out-of-order callback rejection, and recovery transitions in software only.
 * - Never claims a physical USB serial device is connected unless an actual validated transport provides frames,
 *   and never leaves a cached FRESH card visible when a poll fails or disconnects.
 */

export const ADAPTER_PROTOCOL_VERSION = 'groundtruth-local-heartbeat-v1' as const;

export type AdapterCardStatus =
  | 'OPT_IN_DISABLED'
  | 'WAITING_FOR_FIRST_PACKET'
  | 'FRESH_HEARTBEAT_RECEIVED'
  | 'DISCONNECTED_OR_POLL_FAILED_UNKNOWN'
  | 'STALE_THRESHOLD_EXCEEDED_UNKNOWN';

export interface LocalAdapterPacket {
  protocol: string;
  sequenceNumber: number;
  sourceId: string;
  sourceLabel: string;
  sentAtSec?: number | 'unknown';
}

export interface AdapterState {
  optedIn: boolean;
  hardwareVerificationLabel: 'UNTESTED_NO_PHYSICAL_ATECH_CONNECTED';
  protocolVersion: typeof ADAPTER_PROTOCOL_VERSION;
  thresholdSec: number;
  localClockSec: number;
  highestCallbackSeq: number;
  lastSuccessfulPollAtSec: number | null;
  lastHeartbeatReceivedAtSec: number | null;
  lastSequenceNumber: number | null;
  lastSourceId: string | null;
  lastSourceLabel: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  recoveredAfterOutageDurationSec: number | null;
  ignoredOutOfOrderCallbacks: number;
  log: string[];
}

export interface DerivedAdapterView {
  cardStatus: AdapterCardStatus;
  snapshotAgeSec: number | null;
  heartbeatAgeSec: number | null;
  isCachedDataStaleOrDisconnected: boolean;
  statusHeadline: string;
  statusDetail: string;
}

export function createInitialAdapterState(thresholdSec: number = 5): AdapterState {
  return {
    optedIn: false,
    hardwareVerificationLabel: 'UNTESTED_NO_PHYSICAL_ATECH_CONNECTED',
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    thresholdSec,
    localClockSec: 0,
    highestCallbackSeq: 0,
    lastSuccessfulPollAtSec: null,
    lastHeartbeatReceivedAtSec: null,
    lastSequenceNumber: null,
    lastSourceId: null,
    lastSourceLabel: null,
    consecutiveFailures: 0,
    lastError: null,
    recoveredAfterOutageDurationSec: null,
    ignoredOutOfOrderCallbacks: 0,
    log: [
      'Adapter initialized in opt-in disabled state. Physical Atech Frame 10 / 2.1 hardware is UNTESTED.',
    ],
  };
}

export function setAdapterOptIn(state: AdapterState, optedIn: boolean): AdapterState {
  if (!optedIn) {
    return {
      ...createInitialAdapterState(state.thresholdSec),
      localClockSec: state.localClockSec,
      log: [
        `[T+${state.localClockSec}s] User disabled opt-in test adapter. Resetting cached feed state.`,
        ...state.log.slice(0, 19),
      ],
    };
  }
  return {
    ...state,
    optedIn: true,
    consecutiveFailures: 0,
    lastError: null,
    log: [
      `[T+${state.localClockSec}s] User enabled opt-in test-only feed adapter (protocol ${ADAPTER_PROTOCOL_VERSION}; physical hardware UNTESTED).`,
      ...state.log.slice(0, 19),
    ],
  };
}

export function advanceAdapterClock(
  state: AdapterState,
  deltaSec: number
): AdapterState {
  if (deltaSec <= 0 || !Number.isFinite(deltaSec)) return state;
  const nextClock = state.localClockSec + deltaSec;
  return {
    ...state,
    localClockSec: nextClock,
  };
}

/**
 * Processes an incoming poll callback.
 * Enforces monotonic callbackSeq so out-of-order network/serial callbacks cannot roll state backward.
 * Validates protocol version and payload fields before accepting.
 */
export function handleAdapterPollSuccess(
  state: AdapterState,
  callbackSeq: number,
  rawPacket: unknown
): AdapterState {
  if (!state.optedIn) {
    return state;
  }

  // Reject out-of-order callback
  if (callbackSeq <= state.highestCallbackSeq) {
    return {
      ...state,
      ignoredOutOfOrderCallbacks: state.ignoredOutOfOrderCallbacks + 1,
      log: [
        `[T+${state.localClockSec}s] Rejected out-of-order callback (seq ${callbackSeq} <= highest processed ${state.highestCallbackSeq}). State cannot roll backward.`,
        ...state.log.slice(0, 19),
      ],
    };
  }

  if (typeof rawPacket !== 'object' || rawPacket === null) {
    return handleAdapterPollFailure(
      state,
      callbackSeq,
      'Invalid adapter payload: expected JSON object.'
    );
  }

  const pkt = rawPacket as Record<string, unknown>;
  if (pkt.protocol !== ADAPTER_PROTOCOL_VERSION) {
    return handleAdapterPollFailure(
      state,
      callbackSeq,
      `Protocol mismatch: received "${String(pkt.protocol)}", expected "${ADAPTER_PROTOCOL_VERSION}".`
    );
  }

  if (
    typeof pkt.sequenceNumber !== 'number' ||
    !Number.isFinite(pkt.sequenceNumber) ||
    pkt.sequenceNumber < 0
  ) {
    return handleAdapterPollFailure(
      state,
      callbackSeq,
      'Invalid sequenceNumber: expected nonnegative finite number.'
    );
  }

  if (typeof pkt.sourceId !== 'string' || pkt.sourceId.trim().length === 0) {
    return handleAdapterPollFailure(
      state,
      callbackSeq,
      'Invalid sourceId: expected non-empty string.'
    );
  }

  const sourceLabel =
    typeof pkt.sourceLabel === 'string' && pkt.sourceLabel.trim().length > 0
      ? pkt.sourceLabel
      : pkt.sourceId;

  const prevDerived = deriveAdapterView(state);
  const wasDisconnectedOrStale =
    state.lastHeartbeatReceivedAtSec !== null &&
    (state.consecutiveFailures > 0 ||
      prevDerived.cardStatus === 'DISCONNECTED_OR_POLL_FAILED_UNKNOWN' ||
      prevDerived.cardStatus === 'STALE_THRESHOLD_EXCEEDED_UNKNOWN');

  const outageDuration =
    wasDisconnectedOrStale && state.lastHeartbeatReceivedAtSec !== null
      ? state.localClockSec - state.lastHeartbeatReceivedAtSec
      : null;

  const logEntry = wasDisconnectedOrStale
    ? `[T+${state.localClockSec}s] Heartbeat receipt RECOVERED (callback #${callbackSeq}, pkt seq ${pkt.sequenceNumber}) after ${outageDuration}s gap/failure. Transport receipt only — not hardware validation.`
    : `[T+${state.localClockSec}s] Valid test heartbeat received (callback #${callbackSeq}, pkt seq ${pkt.sequenceNumber}, source "${pkt.sourceId}").`;

  return {
    ...state,
    highestCallbackSeq: callbackSeq,
    lastSuccessfulPollAtSec: state.localClockSec,
    lastHeartbeatReceivedAtSec: state.localClockSec,
    lastSequenceNumber: pkt.sequenceNumber,
    lastSourceId: pkt.sourceId,
    lastSourceLabel: sourceLabel,
    consecutiveFailures: 0,
    lastError: null,
    recoveredAfterOutageDurationSec: outageDuration,
    log: [logEntry, ...state.log.slice(0, 19)],
  };
}

/**
 * Processes a poll error or disconnect.
 * If callbackSeq <= highestCallbackSeq, ignores the stale out-of-order error callback so it
 * cannot overwrite a newer valid response.
 * Otherwise immediately marks the adapter as disconnected/failed so cached fresh cards NEVER remain displayed as fresh.
 */
export function handleAdapterPollFailure(
  state: AdapterState,
  callbackSeq: number,
  errorReason: string
): AdapterState {
  if (!state.optedIn) {
    return state;
  }

  if (callbackSeq <= state.highestCallbackSeq) {
    return {
      ...state,
      ignoredOutOfOrderCallbacks: state.ignoredOutOfOrderCallbacks + 1,
      log: [
        `[T+${state.localClockSec}s] Ignored out-of-order failure callback (seq ${callbackSeq} <= highest processed ${state.highestCallbackSeq}).`,
        ...state.log.slice(0, 19),
      ],
    };
  }

  const nextFailures = state.consecutiveFailures + 1;
  return {
    ...state,
    highestCallbackSeq: callbackSeq,
    consecutiveFailures: nextFailures,
    lastError: errorReason,
    log: [
      `[T+${state.localClockSec}s] Poll failure / disconnect (#${nextFailures}, callback #${callbackSeq}): ${errorReason}. Cached card immediately marked STALE / UNKNOWN.`,
      ...state.log.slice(0, 19),
    ],
  };
}

/**
 * Derives the UI view for the opt-in adapter at the current local adapter clock.
 * Guarantees that any poll failure or threshold timeout immediately transitions the card
 * away from FRESH_HEARTBEAT_RECEIVED and exposes advancing local snapshot age.
 */
export function deriveAdapterView(state: AdapterState): DerivedAdapterView {
  if (!state.optedIn) {
    return {
      cardStatus: 'OPT_IN_DISABLED',
      snapshotAgeSec: null,
      heartbeatAgeSec: null,
      isCachedDataStaleOrDisconnected: false,
      statusHeadline: 'OPT-IN ADAPTER DISABLED (UNTESTED WITH PHYSICAL HARDWARE)',
      statusDetail:
        'Core prototype runs entirely on deterministic local event logs without this adapter.',
    };
  }

  const snapshotAgeSec =
    state.lastSuccessfulPollAtSec !== null
      ? state.localClockSec - state.lastSuccessfulPollAtSec
      : null;

  const heartbeatAgeSec =
    state.lastHeartbeatReceivedAtSec !== null
      ? state.localClockSec - state.lastHeartbeatReceivedAtSec
      : null;

  if (state.consecutiveFailures > 0) {
    return {
      cardStatus: 'DISCONNECTED_OR_POLL_FAILED_UNKNOWN',
      snapshotAgeSec,
      heartbeatAgeSec,
      isCachedDataStaleOrDisconnected: true,
      statusHeadline: 'DISCONNECTED / POLL FAILED — STATUS UNKNOWN (NOT FRESH)',
      statusDetail: `Last error: ${state.lastError ?? 'poll failed'} (${state.consecutiveFailures} consecutive failure(s)). ${
        snapshotAgeSec !== null
          ? `Cached snapshot from T+${state.lastSuccessfulPollAtSec}s is now ${snapshotAgeSec}s old and CANNOT be treated as current.`
          : 'No valid poll received yet.'
      }`,
    };
  }

  if (state.lastHeartbeatReceivedAtSec === null || heartbeatAgeSec === null) {
    return {
      cardStatus: 'WAITING_FOR_FIRST_PACKET',
      snapshotAgeSec: null,
      heartbeatAgeSec: null,
      isCachedDataStaleOrDisconnected: false,
      statusHeadline: 'WAITING / UNKNOWN — NO HEARTBEAT RECEIVED YET',
      statusDetail:
        'Adapter opted in, awaiting first valid test heartbeat frame. Never shown as fresh before receipt.',
    };
  }

  if (heartbeatAgeSec >= state.thresholdSec) {
    return {
      cardStatus: 'STALE_THRESHOLD_EXCEEDED_UNKNOWN',
      snapshotAgeSec,
      heartbeatAgeSec,
      isCachedDataStaleOrDisconnected: true,
      statusHeadline: `STALE / UNKNOWN — AGE ${heartbeatAgeSec}s >= ${state.thresholdSec}s THRESHOLD`,
      statusDetail: `Last heartbeat was received at T+${state.lastHeartbeatReceivedAtSec}s (advancing local age: ${heartbeatAgeSec}s). Cached card is explicitly marked stale/unknown.`,
    };
  }

  return {
    cardStatus: 'FRESH_HEARTBEAT_RECEIVED',
    snapshotAgeSec,
    heartbeatAgeSec,
    isCachedDataStaleOrDisconnected: false,
    statusHeadline:
      state.recoveredAfterOutageDurationSec !== null
        ? `FRESH HEARTBEAT (RECOVERED AFTER ${state.recoveredAfterOutageDurationSec}s OUTAGE)`
        : `FRESH HEARTBEAT (AGE ${heartbeatAgeSec}s < ${state.thresholdSec}s THRESHOLD)`,
    statusDetail: `Last valid heartbeat frame seq #${state.lastSequenceNumber} from "${state.lastSourceLabel}" at T+${state.lastHeartbeatReceivedAtSec}s (snapshot age ${snapshotAgeSec}s). Test harness only — physical Atech hardware is UNTESTED.`,
  };
}
