import {
  buildSummarySnapshot,
  DEFAULT_SYNTHETIC_CONFIG,
  deriveReplaySnapshot,
  normalizeEvents,
} from './replayEngine';
import {
  ClockQuality,
  ComparisonKey,
  DataProvenance,
  DependencyDefinition,
  DependencyKnowledge,
  ENGINE_VERSION,
  ExportedReplayRecord,
  MAX_DEPENDENCIES,
  MAX_DURATION_SEC,
  MAX_EVENTS,
  MAX_IMPORT_BYTES,
  MAX_NOTES,
  MAX_SOURCES,
  MAX_THRESHOLD_SEC,
  MAX_TOLERANCE_SEC,
  ReviewerNote,
  SCHEMA_VERSION,
  ScenarioDefinition,
  ScenarioEvent,
  SourceDefinition,
  StoredDerivedSummarySnapshot,
  SyntheticConfig,
  ValidationErrorItem,
  ValidationResult,
} from './types';

export interface ParsedImportBundle {
  kind: 'scenario' | 'exported_record';
  scenario: ScenarioDefinition;
  replayPositionT: number;
  syntheticConfig: SyntheticConfig;
  reviewerNotes: ReviewerNote[];
  snapshotMismatchWarning: string | null;
}

const VALID_DEPENDENCY_KNOWLEDGE = new Set<DependencyKnowledge>([
  'complete',
  'partial',
  'unknown',
]);
const VALID_CLOCK_QUALITY = new Set<ClockQuality>([
  'synthetic_synchronized',
  'unverified',
  'unknown',
]);
const VALID_PROVENANCE = new Set<DataProvenance>(['synthetic', 'user_provided']);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isFiniteNonNegative(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

function validateEventsList(
  rawEvents: unknown,
  basePath: string,
  validSourceIds: Set<string>,
  seenEventIds: Set<string>,
  errors: ValidationErrorItem[]
): ScenarioEvent[] {
  if (!Array.isArray(rawEvents)) {
    errors.push({ path: basePath, message: 'Must be an array of events.' });
    return [];
  }
  if (rawEvents.length > MAX_EVENTS) {
    errors.push({
      path: basePath,
      message: `Event count (${rawEvents.length}) exceeds maximum limit of ${MAX_EVENTS}.`,
    });
    return [];
  }

  const parsed: ScenarioEvent[] = [];

  rawEvents.forEach((item, idx) => {
    const itemPath = `${basePath}[${idx}]`;
    if (!isPlainObject(item)) {
      errors.push({ path: itemPath, message: 'Event must be an object.' });
      return;
    }

    const id = item.id;
    if (!isNonEmptyString(id)) {
      errors.push({
        path: `${itemPath}.id`,
        message: 'Event id is required and must be a non-empty string.',
      });
    } else if (seenEventIds.has(id)) {
      errors.push({
        path: `${itemPath}.id`,
        message: `Duplicate event id "${id}". Event IDs must be unique.`,
      });
    } else {
      seenEventIds.add(id);
    }

    const sourceId = item.sourceId;
    if (!isNonEmptyString(sourceId)) {
      errors.push({
        path: `${itemPath}.sourceId`,
        message: 'Event sourceId is required and must be a non-empty string.',
      });
    } else if (validSourceIds.size > 0 && !validSourceIds.has(sourceId)) {
      errors.push({
        path: `${itemPath}.sourceId`,
        message: `Unresolved source reference "${sourceId}". No such source in sources[].`,
      });
    }

    const receivedAt = item.receivedAt;
    if (!isFiniteNonNegative(receivedAt) || receivedAt > MAX_DURATION_SEC) {
      errors.push({
        path: `${itemPath}.receivedAt`,
        message: `receivedAt must be a finite nonnegative number <= ${MAX_DURATION_SEC}.`,
      });
    }

    const type = item.type;
    if (type !== 'heartbeat' && type !== 'observation') {
      errors.push({
        path: `${itemPath}.type`,
        message: `Invalid event type "${String(type)}". Expected "heartbeat" or "observation".`,
      });
      return;
    }

    if (type === 'heartbeat') {
      if (
        isNonEmptyString(id) &&
        isNonEmptyString(sourceId) &&
        isFiniteNonNegative(receivedAt)
      ) {
        parsed.push({
          id,
          sourceId,
          receivedAt,
          type: 'heartbeat',
          ...(typeof item.syntheticInjected === 'boolean'
            ? { syntheticInjected: item.syntheticInjected }
            : {}),
        });
      }
    } else {
      const value = item.value;
      if (typeof value !== 'string') {
        errors.push({
          path: `${itemPath}.value`,
          message: 'Observation value must be a string.',
        });
      }

      const rawKey = item.comparisonKey;
      let validKey: ComparisonKey | null = null;
      if (!isPlainObject(rawKey)) {
        errors.push({
          path: `${itemPath}.comparisonKey`,
          message: 'Observation comparisonKey is required and must be an object.',
        });
      } else {
        const { contextId, subject, property, unit } = rawKey;
        if (!isNonEmptyString(contextId)) {
          errors.push({
            path: `${itemPath}.comparisonKey.contextId`,
            message: 'comparisonKey.contextId must be a non-empty string.',
          });
        }
        if (!isNonEmptyString(subject)) {
          errors.push({
            path: `${itemPath}.comparisonKey.subject`,
            message: 'comparisonKey.subject must be a non-empty string.',
          });
        }
        if (!isNonEmptyString(property)) {
          errors.push({
            path: `${itemPath}.comparisonKey.property`,
            message: 'comparisonKey.property must be a non-empty string.',
          });
        }
        if (!isNonEmptyString(unit)) {
          errors.push({
            path: `${itemPath}.comparisonKey.unit`,
            message: 'comparisonKey.unit must be a non-empty string.',
          });
        }
        if (
          isNonEmptyString(contextId) &&
          isNonEmptyString(subject) &&
          isNonEmptyString(property) &&
          isNonEmptyString(unit)
        ) {
          validKey = { contextId, subject, property, unit };
        }
      }

      const observedAt = item.observedAt;
      const isObsTimeValid =
        observedAt === 'unknown' ||
        (isFiniteNonNegative(observedAt) && observedAt <= MAX_DURATION_SEC);
      if (!isObsTimeValid) {
        errors.push({
          path: `${itemPath}.observedAt`,
          message: `observedAt must be "unknown" or a finite nonnegative number <= ${MAX_DURATION_SEC}.`,
        });
      }

      const clockQuality = item.clockQuality;
      const isClockValid =
        typeof clockQuality === 'string' &&
        VALID_CLOCK_QUALITY.has(clockQuality as ClockQuality);
      if (!isClockValid) {
        errors.push({
          path: `${itemPath}.clockQuality`,
          message: `Invalid clockQuality "${String(clockQuality)}". Expected "synthetic_synchronized", "unverified", or "unknown".`,
        });
      }

      if (
        isNonEmptyString(id) &&
        isNonEmptyString(sourceId) &&
        isFiniteNonNegative(receivedAt) &&
        typeof value === 'string' &&
        validKey &&
        isObsTimeValid &&
        isClockValid
      ) {
        parsed.push({
          id,
          sourceId,
          receivedAt,
          type: 'observation',
          value,
          comparisonKey: validKey,
          observedAt: observedAt as number | 'unknown',
          clockQuality: clockQuality as ClockQuality,
          ...(typeof item.isBackfill === 'boolean' ? { isBackfill: item.isBackfill } : {}),
          ...(typeof item.syntheticInjected === 'boolean'
            ? { syntheticInjected: item.syntheticInjected }
            : {}),
        });
      }
    }
  });

  return parsed;
}

function validateScenarioObject(
  obj: Record<string, unknown>,
  basePath: string,
  errors: ValidationErrorItem[]
): {
  scenario: ScenarioDefinition | null;
  validSourceIds: Set<string>;
  seenEventIds: Set<string>;
} {
  const prefix = basePath ? `${basePath}.` : '';

  if (obj.schemaVersion !== SCHEMA_VERSION) {
    errors.push({
      path: `${prefix}schemaVersion`,
      message: `Unsupported or missing schemaVersion "${String(obj.schemaVersion)}". Expected "${SCHEMA_VERSION}".`,
    });
  }

  if (!isNonEmptyString(obj.scenarioId)) {
    errors.push({
      path: `${prefix}scenarioId`,
      message: 'scenarioId is required and must be a non-empty string.',
    });
  }

  if (!isNonEmptyString(obj.title)) {
    errors.push({
      path: `${prefix}title`,
      message: 'title is required and must be a non-empty string.',
    });
  }

  const description = typeof obj.description === 'string' ? obj.description : '';

  const dataProvenance: DataProvenance =
    typeof obj.dataProvenance === 'string' &&
    VALID_PROVENANCE.has(obj.dataProvenance as DataProvenance)
      ? (obj.dataProvenance as DataProvenance)
      : 'user_provided';

  if (
    obj.dataProvenance !== undefined &&
    (!isNonEmptyString(obj.dataProvenance) ||
      !VALID_PROVENANCE.has(obj.dataProvenance as DataProvenance))
  ) {
    errors.push({
      path: `${prefix}dataProvenance`,
      message: `Invalid dataProvenance "${String(obj.dataProvenance)}". Expected "synthetic" or "user_provided".`,
    });
  }

  if (obj.timeUnit !== 'seconds') {
    errors.push({
      path: `${prefix}timeUnit`,
      message: `Invalid or missing timeUnit "${String(obj.timeUnit)}". Expected "seconds".`,
    });
  }

  const virtualDuration = obj.virtualDuration;
  if (
    typeof virtualDuration !== 'number' ||
    !Number.isFinite(virtualDuration) ||
    virtualDuration <= 0 ||
    virtualDuration > MAX_DURATION_SEC
  ) {
    errors.push({
      path: `${prefix}virtualDuration`,
      message: `virtualDuration must be a finite positive number in (0, ${MAX_DURATION_SEC}].`,
    });
  }

  const heartbeatThreshold = obj.heartbeatThreshold;
  if (
    typeof heartbeatThreshold !== 'number' ||
    !Number.isFinite(heartbeatThreshold) ||
    heartbeatThreshold <= 0 ||
    heartbeatThreshold > MAX_THRESHOLD_SEC
  ) {
    errors.push({
      path: `${prefix}heartbeatThreshold`,
      message: `heartbeatThreshold must be a finite positive number in (0, ${MAX_THRESHOLD_SEC}].`,
    });
  }

  const comparisonTolerance = obj.comparisonTolerance;
  if (
    typeof comparisonTolerance !== 'number' ||
    !Number.isFinite(comparisonTolerance) ||
    comparisonTolerance < 0 ||
    comparisonTolerance > MAX_TOLERANCE_SEC
  ) {
    errors.push({
      path: `${prefix}comparisonTolerance`,
      message: `comparisonTolerance must be a finite nonnegative number in [0, ${MAX_TOLERANCE_SEC}].`,
    });
  }

  // Validate dependencies
  const validDepIds = new Set<string>();
  const dependencies: DependencyDefinition[] = [];
  if (!Array.isArray(obj.dependencies)) {
    errors.push({
      path: `${prefix}dependencies`,
      message: 'dependencies must be an array.',
    });
  } else if (obj.dependencies.length > MAX_DEPENDENCIES) {
    errors.push({
      path: `${prefix}dependencies`,
      message: `Dependency count (${obj.dependencies.length}) exceeds maximum limit of ${MAX_DEPENDENCIES}.`,
    });
  } else {
    obj.dependencies.forEach((rawDep, idx) => {
      const dPath = `${prefix}dependencies[${idx}]`;
      if (!isPlainObject(rawDep)) {
        errors.push({ path: dPath, message: 'Dependency entry must be an object.' });
        return;
      }
      const id = rawDep.id;
      const name = rawDep.name;
      if (!isNonEmptyString(id)) {
        errors.push({
          path: `${dPath}.id`,
          message: 'Dependency id is required and must be a non-empty string.',
        });
      } else if (validDepIds.has(id)) {
        errors.push({
          path: `${dPath}.id`,
          message: `Duplicate dependency id "${id}".`,
        });
      } else {
        validDepIds.add(id);
      }

      if (!isNonEmptyString(name)) {
        errors.push({
          path: `${dPath}.name`,
          message: 'Dependency human-readable name is required and must be a non-empty string.',
        });
      }

      if (isNonEmptyString(id) && isNonEmptyString(name)) {
        dependencies.push({
          id,
          name,
          category: typeof rawDep.category === 'string' ? rawDep.category : undefined,
          description:
            typeof rawDep.description === 'string' ? rawDep.description : undefined,
          declaredBy: isNonEmptyString(rawDep.declaredBy)
            ? rawDep.declaredBy
            : 'User-provided dependency metadata (unverified)',
        });
      }
    });
  }

  // Validate sources
  const validSourceIds = new Set<string>();
  const sources: SourceDefinition[] = [];
  if (!Array.isArray(obj.sources)) {
    errors.push({
      path: `${prefix}sources`,
      message: 'sources must be an array.',
    });
  } else if (obj.sources.length === 0) {
    errors.push({
      path: `${prefix}sources`,
      message: 'sources must contain at least one source definition.',
    });
  } else if (obj.sources.length > MAX_SOURCES) {
    errors.push({
      path: `${prefix}sources`,
      message: `Source count (${obj.sources.length}) exceeds maximum limit of ${MAX_SOURCES}.`,
    });
  } else {
    obj.sources.forEach((rawSrc, idx) => {
      const sPath = `${prefix}sources[${idx}]`;
      if (!isPlainObject(rawSrc)) {
        errors.push({ path: sPath, message: 'Source entry must be an object.' });
        return;
      }
      const id = rawSrc.id;
      const name = rawSrc.name;
      if (!isNonEmptyString(id)) {
        errors.push({
          path: `${sPath}.id`,
          message: 'Source id is required and must be a non-empty string.',
        });
      } else if (validSourceIds.has(id)) {
        errors.push({
          path: `${sPath}.id`,
          message: `Duplicate source id "${id}".`,
        });
      } else {
        validSourceIds.add(id);
      }

      if (!isNonEmptyString(name)) {
        errors.push({
          path: `${sPath}.name`,
          message: 'Source name is required and must be a non-empty string.',
        });
      }

      const dk = rawSrc.dependencyKnowledge;
      const validDk =
        typeof dk === 'string' &&
        VALID_DEPENDENCY_KNOWLEDGE.has(dk as DependencyKnowledge);
      if (!validDk) {
        errors.push({
          path: `${sPath}.dependencyKnowledge`,
          message: `Invalid dependencyKnowledge "${String(dk)}". Expected "complete", "partial", or "unknown".`,
        });
      }

      const depIds: string[] = [];
      if (!Array.isArray(rawSrc.dependencyIds)) {
        errors.push({
          path: `${sPath}.dependencyIds`,
          message: 'dependencyIds must be an array of strings.',
        });
      } else {
        const seenSrcDeps = new Set<string>();
        rawSrc.dependencyIds.forEach((depId, dIdx) => {
          const refPath = `${sPath}.dependencyIds[${dIdx}]`;
          if (!isNonEmptyString(depId)) {
            errors.push({
              path: refPath,
              message: 'Dependency ID reference must be a non-empty string.',
            });
          } else if (seenSrcDeps.has(depId)) {
            errors.push({
              path: refPath,
              message: `Duplicate dependency reference "${depId}" on source "${String(id)}".`,
            });
          } else if (!validDepIds.has(depId)) {
            errors.push({
              path: refPath,
              message: `Unresolved dependency reference "${depId}". No such dependency in dependencies[].`,
            });
          } else {
            seenSrcDeps.add(depId);
            depIds.push(depId);
          }
        });
      }

      if (isNonEmptyString(id) && isNonEmptyString(name) && validDk) {
        sources.push({
          id,
          name,
          description:
            typeof rawSrc.description === 'string' ? rawSrc.description : undefined,
          dependencyIds: depIds,
          dependencyKnowledge: dk as DependencyKnowledge,
          declarationProvenance: isNonEmptyString(rawSrc.declarationProvenance)
            ? rawSrc.declarationProvenance
            : 'User-provided declaration metadata (not proof of independence)',
        });
      }
    });
  }

  // Validate events
  const seenEventIds = new Set<string>();
  const events = validateEventsList(
    obj.events,
    `${prefix}events`,
    validSourceIds,
    seenEventIds,
    errors
  );

  if (errors.length > 0) {
    return { scenario: null, validSourceIds, seenEventIds };
  }

  return {
    scenario: {
      schemaVersion: SCHEMA_VERSION,
      scenarioId: obj.scenarioId as string,
      title: obj.title as string,
      description,
      dataProvenance,
      timeUnit: 'seconds',
      virtualDuration: virtualDuration as number,
      heartbeatThreshold: heartbeatThreshold as number,
      comparisonTolerance: comparisonTolerance as number,
      dependencies,
      sources,
      events,
    },
    validSourceIds,
    seenEventIds,
  };
}

/**
 * Validates either a raw JSON string or a parsed object representing a ScenarioDefinition
 * or an ExportedReplayRecord. Enforces all-or-nothing validation.
 */
export function validateScenarioInput(
  rawInput: string | unknown
): ValidationResult<ParsedImportBundle> {
  const errors: ValidationErrorItem[] = [];
  const warnings: string[] = [];

  let parsedObj: unknown;

  if (typeof rawInput === 'string') {
    const byteLen = new TextEncoder().encode(rawInput).byteLength;
    if (byteLen > MAX_IMPORT_BYTES) {
      return {
        ok: false,
        errors: [
          {
            path: 'root',
            message: `Input size (${byteLen} bytes) exceeds maximum limit of ${MAX_IMPORT_BYTES} bytes (1 MiB).`,
          },
        ],
      };
    }
    if (rawInput.trim().length === 0) {
      return {
        ok: false,
        errors: [{ path: 'root', message: 'Input JSON string is empty.' }],
      };
    }
    try {
      parsedObj = JSON.parse(rawInput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        errors: [{ path: 'root', message: `Malformed JSON: ${msg}` }],
      };
    }
  } else {
    parsedObj = rawInput;
  }

  if (!isPlainObject(parsedObj)) {
    return {
      ok: false,
      errors: [{ path: 'root', message: 'Root JSON value must be an object.' }],
    };
  }

  // Determine whether this is an ExportedReplayRecord (has nested .scenario) or a standalone ScenarioDefinition
  const isExportRecord = 'scenario' in parsedObj || 'replayPositionT' in parsedObj;

  if (!isExportRecord) {
    const { scenario } = validateScenarioObject(parsedObj, '', errors);
    if (errors.length > 0 || !scenario) {
      return { ok: false, errors };
    }
    const { wasSortedFromOutOfOrderInput } = normalizeEvents(scenario.events);
    if (wasSortedFromOutOfOrderInput) {
      warnings.push(
        'Imported events had out-of-order arrival timestamps (receivedAt) and were deterministically sorted by (receivedAt ASC, id ASC).'
      );
    }
    return {
      ok: true,
      value: {
        kind: 'scenario',
        scenario,
        replayPositionT: 0,
        syntheticConfig: { injectedEvents: [], droppedEventIds: [] },
        reviewerNotes: [],
        snapshotMismatchWarning: null,
      },
      warnings,
    };
  }

  // Validate ExportedReplayRecord
  if (parsedObj.schemaVersion !== SCHEMA_VERSION) {
    errors.push({
      path: 'schemaVersion',
      message: `Unsupported or missing schemaVersion "${String(parsedObj.schemaVersion)}". Expected "${SCHEMA_VERSION}".`,
    });
  }

  if (
    parsedObj.engineVersion !== undefined &&
    parsedObj.engineVersion !== ENGINE_VERSION
  ) {
    errors.push({
      path: 'engineVersion',
      message: `Unsupported engineVersion "${String(parsedObj.engineVersion)}". Expected "${ENGINE_VERSION}".`,
    });
  }

  if (!isPlainObject(parsedObj.scenario)) {
    errors.push({
      path: 'scenario',
      message: 'Exported record must include a valid scenario object.',
    });
    return { ok: false, errors };
  }

  const { scenario, validSourceIds, seenEventIds } = validateScenarioObject(
    parsedObj.scenario,
    'scenario',
    errors
  );

  const replayPositionT = parsedObj.replayPositionT;
  if (
    !isFiniteNonNegative(replayPositionT) ||
    (scenario && replayPositionT > scenario.virtualDuration)
  ) {
    errors.push({
      path: 'replayPositionT',
      message: `replayPositionT must be a finite nonnegative number within [0, virtualDuration (${scenario?.virtualDuration ?? MAX_DURATION_SEC})].`,
    });
  }

  // Validate syntheticConfig if present
  let syntheticConfig: SyntheticConfig = DEFAULT_SYNTHETIC_CONFIG;
  if (parsedObj.syntheticConfig !== undefined) {
    if (!isPlainObject(parsedObj.syntheticConfig)) {
      errors.push({
        path: 'syntheticConfig',
        message: 'syntheticConfig must be an object.',
      });
    } else {
      const injectedEvents = validateEventsList(
        parsedObj.syntheticConfig.injectedEvents ?? [],
        'syntheticConfig.injectedEvents',
        validSourceIds,
        seenEventIds,
        errors
      );
      const rawDropped = parsedObj.syntheticConfig.droppedEventIds ?? [];
      const droppedEventIds: string[] = [];
      if (!Array.isArray(rawDropped)) {
        errors.push({
          path: 'syntheticConfig.droppedEventIds',
          message: 'droppedEventIds must be an array of strings.',
        });
      } else {
        rawDropped.forEach((dId, idx) => {
          if (!isNonEmptyString(dId)) {
            errors.push({
              path: `syntheticConfig.droppedEventIds[${idx}]`,
              message: 'Dropped event ID must be a non-empty string.',
            });
          } else {
            droppedEventIds.push(dId);
          }
        });
      }
      syntheticConfig = { injectedEvents, droppedEventIds };
    }
  }

  // Validate reviewerNotes if present
  const reviewerNotes: ReviewerNote[] = [];
  if (parsedObj.reviewerNotes !== undefined) {
    if (!Array.isArray(parsedObj.reviewerNotes)) {
      errors.push({
        path: 'reviewerNotes',
        message: 'reviewerNotes must be an array.',
      });
    } else if (parsedObj.reviewerNotes.length > MAX_NOTES) {
      errors.push({
        path: 'reviewerNotes',
        message: `Reviewer note count (${parsedObj.reviewerNotes.length}) exceeds maximum limit of ${MAX_NOTES}.`,
      });
    } else {
      const seenNoteIds = new Set<string>();
      parsedObj.reviewerNotes.forEach((rawNote, idx) => {
        const nPath = `reviewerNotes[${idx}]`;
        if (!isPlainObject(rawNote)) {
          errors.push({ path: nPath, message: 'Note must be an object.' });
          return;
        }
        const id = rawNote.id;
        if (!isNonEmptyString(id)) {
          errors.push({
            path: `${nPath}.id`,
            message: 'Note id is required and must be a non-empty string.',
          });
        } else if (seenNoteIds.has(id)) {
          errors.push({
            path: `${nPath}.id`,
            message: `Duplicate note id "${id}".`,
          });
        } else {
          seenNoteIds.add(id);
        }

        const authorAlias = isNonEmptyString(rawNote.authorAlias)
          ? rawNote.authorAlias
          : 'unauthenticated-local-reviewer';
        const recordedAtReplayT = rawNote.recordedAtReplayT;
        if (
          !isFiniteNonNegative(recordedAtReplayT) ||
          recordedAtReplayT > MAX_DURATION_SEC
        ) {
          errors.push({
            path: `${nPath}.recordedAtReplayT`,
            message: 'Note recordedAtReplayT must be a finite nonnegative number.',
          });
        }

        const text = rawNote.text;
        if (!isNonEmptyString(text)) {
          errors.push({
            path: `${nPath}.text`,
            message: 'Note text must be a non-empty string.',
          });
        }

        if (
          isNonEmptyString(id) &&
          isFiniteNonNegative(recordedAtReplayT) &&
          isNonEmptyString(text)
        ) {
          reviewerNotes.push({
            id,
            authorAlias,
            recordedAtReplayT,
            createdAtIso: isNonEmptyString(rawNote.createdAtIso)
              ? rawNote.createdAtIso
              : 'local-unverified-time',
            targetScope: isNonEmptyString(rawNote.targetScope)
              ? rawNote.targetScope
              : 'general',
            text,
          });
        }
      });
    }
  }

  if (errors.length > 0 || !scenario || !isFiniteNonNegative(replayPositionT)) {
    return { ok: false, errors };
  }

  // Recompute status and disagreement from events rather than trusting stored snapshot!
  const recomputed = deriveReplaySnapshot(
    scenario,
    replayPositionT,
    syntheticConfig,
    reviewerNotes
  );

  if (recomputed.wasSortedFromOutOfOrderInput) {
    warnings.push(
      'Imported events had out-of-order arrival timestamps (receivedAt) and were deterministically sorted by (receivedAt ASC, id ASC).'
    );
  }

  let snapshotMismatchWarning: string | null = null;
  if (isPlainObject(parsedObj.derivedSnapshotAtExportT)) {
    const stored =
      parsedObj.derivedSnapshotAtExportT as unknown as StoredDerivedSummarySnapshot;
    const actual = buildSummarySnapshot(recomputed);
    const mismatches: string[] = [];

    if (stored.atT !== actual.atT) {
      mismatches.push(`stored atT=${String(stored.atT)} vs recomputed T=${actual.atT}`);
    }
    if (stored.transitionCount !== actual.transitionCount) {
      mismatches.push(
        `stored transitionCount=${String(stored.transitionCount)} vs recomputed=${actual.transitionCount}`
      );
    }
    if (stored.disagreementCount !== actual.disagreementCount) {
      mismatches.push(
        `stored disagreementCount=${String(stored.disagreementCount)} vs recomputed=${actual.disagreementCount}`
      );
    }
    if (isPlainObject(stored.sourceStatuses)) {
      for (const [srcId, actualStatus] of Object.entries(actual.sourceStatuses)) {
        const storedStatus = stored.sourceStatuses[srcId];
        if (storedStatus !== actualStatus) {
          mismatches.push(
            `source "${srcId}" stored status "${String(storedStatus)}" vs recomputed "${actualStatus}"`
          );
        }
      }
    } else {
      mismatches.push('stored sourceStatuses missing or invalid');
    }

    if (mismatches.length > 0) {
      snapshotMismatchWarning = `STORED SNAPSHOT MISMATCH DETECTED: The imported file's derivedSnapshotAtExportT did not match deterministic recomputation from the event log (${mismatches.join('; ')}). The app never trusts stored snapshots and has recomputed all states from the event log.`;
      warnings.push(snapshotMismatchWarning);
    }
  }

  return {
    ok: true,
    value: {
      kind: 'exported_record',
      scenario,
      replayPositionT,
      syntheticConfig,
      reviewerNotes,
      snapshotMismatchWarning,
    },
    warnings,
  };
}

export function serializeExportRecord(record: ExportedReplayRecord): string {
  return JSON.stringify(record, null, 2);
}
