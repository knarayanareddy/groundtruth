// Optional explicit save to this browser's localStorage. Nothing is stored unless the user presses "Save".
// Stored under one key: the full exported record JSON (scenario, synthetic additions, notes, replay position).

export const STORAGE_KEY = "groundtruth-blindspot:saved-session:v1";

export type StoreResult = { ok: true; bytes: number } | { ok: false; reason: string };

export function peekSaved(): { exists: boolean; bytes: number } {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? { exists: false, bytes: 0 } : { exists: true, bytes: new TextEncoder().encode(v).length };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

export function readSaved(): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? { ok: false, reason: "Nothing is saved in this browser." } : { ok: true, text: v };
  } catch (e) {
    return { ok: false, reason: `Browser storage is not available: ${(e as Error).name}` };
  }
}

export function writeSaved(text: string): StoreResult {
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
    // Read back to make the status truthful.
    if (window.localStorage.getItem(STORAGE_KEY) !== text) return { ok: false, reason: "Write could not be confirmed on read-back." };
    return { ok: true, bytes: new TextEncoder().encode(text).length };
  } catch (e) {
    const name = (e as Error).name;
    return {
      ok: false,
      reason:
        name === "QuotaExceededError"
          ? "Browser storage quota exceeded; nothing was saved."
          : `Browser storage refused the write (${name}); nothing was saved.`,
    };
  }
}

export function deleteSaved(): StoreResult {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return window.localStorage.getItem(STORAGE_KEY) === null ? { ok: true, bytes: 0 } : { ok: false, reason: "Deletion could not be confirmed." };
  } catch (e) {
    return { ok: false, reason: `Browser storage is not available: ${(e as Error).name}` };
  }
}
