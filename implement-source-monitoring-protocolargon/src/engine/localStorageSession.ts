import { createExportRecord } from './replayEngine';
import { ReviewerNote, ScenarioDefinition, SyntheticConfig } from './types';
import { ParsedImportBundle, validateScenarioInput } from './validator';

export const LOCAL_STORAGE_KEY = 'groundtruth_blindspot_session_v1' as const;

export interface StorageOperationStatus {
  state: 'saved' | 'loaded' | 'cleared' | 'unavailable_or_denied' | 'idle';
  message: string;
  updatedAtIso?: string;
}

export function saveSessionToLocalStorage(
  scenario: ScenarioDefinition,
  replayPositionT: number,
  syntheticConfig: SyntheticConfig,
  reviewerNotes: ReviewerNote[],
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined
): StorageOperationStatus {
  if (!storage) {
    return {
      state: 'unavailable_or_denied',
      message: 'localStorage is not available in this environment.',
    };
  }
  try {
    const record = createExportRecord(
      scenario,
      replayPositionT,
      syntheticConfig,
      reviewerNotes
    );
    const serialized = JSON.stringify(record);
    storage.setItem(LOCAL_STORAGE_KEY, serialized);
    return {
      state: 'saved',
      message: `Saved plain-text session to browser localStorage key "${LOCAL_STORAGE_KEY}" (${serialized.length} chars; not encrypted or anonymized).`,
      updatedAtIso: record.exportedAtIso,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      state: 'unavailable_or_denied',
      message: `localStorage save failed (quota exceeded or access denied): ${reason}`,
    };
  }
}

export function loadSessionFromLocalStorage(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined
): { bundle: ParsedImportBundle | null; status: StorageOperationStatus } {
  if (!storage) {
    return {
      bundle: null,
      status: {
        state: 'unavailable_or_denied',
        message: 'localStorage is not available in this environment.',
      },
    };
  }
  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return {
        bundle: null,
        status: {
          state: 'idle',
          message: `No saved session in localStorage key "${LOCAL_STORAGE_KEY}". Using checked-in Section 4 reference fixture.`,
        },
      };
    }
    const validation = validateScenarioInput(raw);
    if (!validation.ok) {
      return {
        bundle: null,
        status: {
          state: 'unavailable_or_denied',
          message: `Saved localStorage data under "${LOCAL_STORAGE_KEY}" failed schema validation (${validation.errors[0]?.message ?? 'invalid'}). Using default reference fixture.`,
        },
      };
    }
    return {
      bundle: validation.value,
      status: {
        state: 'loaded',
        message: `Loaded saved session from browser localStorage key "${LOCAL_STORAGE_KEY}" and recomputed all states from events.`,
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      bundle: null,
      status: {
        state: 'unavailable_or_denied',
        message: `localStorage read denied or failed: ${reason}`,
      },
    };
  }
}

export function clearSessionFromLocalStorage(
  storage: Pick<Storage, 'removeItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined
): StorageOperationStatus {
  if (!storage) {
    return {
      state: 'unavailable_or_denied',
      message: 'localStorage is not available in this environment.',
    };
  }
  try {
    storage.removeItem(LOCAL_STORAGE_KEY);
    return {
      state: 'cleared',
      message: `Cleared browser localStorage key "${LOCAL_STORAGE_KEY}" and reset to clean Section 4 reference fixture.`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      state: 'unavailable_or_denied',
      message: `Failed to clear localStorage key "${LOCAL_STORAGE_KEY}": ${reason}`,
    };
  }
}
