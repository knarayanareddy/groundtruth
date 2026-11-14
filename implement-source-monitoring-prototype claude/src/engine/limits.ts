// Honest limitation wording. This is the ONLY place where statements negating unsupported claims live
// (the claims test exempts this file and scans everything else in src/).

/** Labels that every export carries. */
export const EXPORT_LABELS = [
  "SYNTHETIC OR USER-PROVIDED DATA — never automatically verified.",
  "Replay of a recorded or simulated event log on a virtual clock. Not live. Not hardware.",
  "A heartbeat only means a message was received. It does not show a sensor is working or correct.",
  "Silence or a stale source is not evidence that an area or scene is clear.",
  "Declared dependencies are human-provided metadata, not proof of independence or of overlap completeness.",
  "Report disagreement is a comparison of claims; it does not say which claim is correct.",
];


/** What this prototype does not show — displayed permanently in the UI and embedded in the docs. */
export const LIMITATIONS: string[] = [
  "Synthetic or user-provided data only. Nothing here is verified automatically.",
  "This is a replay on a virtual clock, not live monitoring. No hardware, network, cloud service, robot or recording is connected.",
  "A received heartbeat means only that a message arrived recently. It does not show that a sensor is working, calibrated or correct.",
  "A missing or stale heartbeat means no recent message. The cause (failure, jamming, power, network, schedule) is not established.",
  "Silence is not a clear scene. A source that is quiet, waiting or stale says nothing about the monitored area.",
  "Dependencies are human-declared metadata. Different IDs or labels do not make sources independent; unknown stays unknown.",
  "Report disagreement compares claims under an explicit rule. It does not say which claim is correct, nor prove deception, jamming or error.",
  "No detection, identification, trust score, confidence score, certification, field validation or privacy protection is provided.",
  "Exports may contain text you typed; they are not anonymised, encrypted or signed. Reviewer aliases are unauthenticated.",
];

/** Per-state caveat shown on every source card (negations live here by design). */
export function heartbeatCaveat(state: "WAITING_UNKNOWN" | "FRESH_HEARTBEAT" | "STALE_UNKNOWN"): string {
  if (state === "WAITING_UNKNOWN") return "No heartbeat has been received. That is unknown status — it is not a clear scene.";
  if (state === "STALE_UNKNOWN") return "No recent heartbeat. The cause is not established, and silence says nothing about the monitored area.";
  return "A heartbeat was received recently. That says nothing about whether the sensor is working or correct, or whether anything is clear.";
}
