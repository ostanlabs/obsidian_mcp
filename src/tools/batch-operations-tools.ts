/**
 * Batch Operations Tools
 *
 * Category 2: Batch Operations
 * - batch_update: NEW unified batch operation with client_id support
 * - batch_operations: DEPRECATED - Create multiple entities with dependencies
 * - batch_update_status: DEPRECATED - Update status of multiple entities
 * - batch_archive: DEPRECATED - Archive multiple entities
 */

import type {
  Entity,
  EntityId,
  EntityType,
} from '../models/v2-types.js';

import type {
  BatchUpdateInput,
  BatchUpdateOutput,
  BatchOpResult,
  EntityStatus,
  EntityFull,
  EntityField,
  DryRunPreview,
  FieldChange,
} from './tool-types.js';

import { validateRelationships } from './entity-management-tools.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for batch operations tools.
 * Injected at runtime to allow for testing and flexibility.
 */
export interface BatchOperationsDependencies {
  /** Create a new entity */
  createEntity: (type: EntityType, data: Record<string, unknown>) => Promise<Entity>;

  /** Get entity by ID */
  getEntity: (id: EntityId) => Promise<Entity | null>;

  /** Check if entity exists */
  entityExists: (id: EntityId) => boolean;

  /** Get entity type from ID */
  getEntityType: (id: EntityId) => EntityType | null;

  /** Update entity status */
  updateEntityStatus: (id: EntityId, status: EntityStatus) => Promise<void>;

  /** Write entity to disk */
  writeEntity: (entity: Entity) => Promise<void>;

  /** Archive entity */
  archiveEntity: (id: EntityId, archivePath: string) => Promise<void>;

  /** Get children of an entity */
  getChildren: (id: EntityId) => Promise<Entity[]>;

  /** Validate status transition */
  validateStatusTransition: (entity: Entity, newStatus: EntityStatus) => { valid: boolean; reason?: string };

  /** Compute cascade effects */
  computeCascadeEffects: (entity: Entity, newStatus: EntityStatus) => Promise<EntityId[]>;

  /** Get current timestamp */
  getCurrentTimestamp: () => string;

  /** Add node to canvas */
  addToCanvas?: (entity: Entity, canvasPath: string) => Promise<boolean>;

  /** Remove node from canvas */
  removeFromCanvas?: (id: EntityId, canvasPath: string) => Promise<boolean>;

  /** Convert entity to full representation */
  toEntityFull: (entity: Entity) => Promise<EntityFull>;
}

// =============================================================================
// Batch Operations
// =============================================================================

// =============================================================================
// Unified Batch Update
// =============================================================================

/**
 * Unified batch operation with client_id support for idempotency and cross-referencing.
 * Supports create, update, and archive operations in a single call.
 */
export async function batchUpdate(
  input: BatchUpdateInput,
  deps: BatchOperationsDependencies
): Promise<BatchUpdateOutput> {
  const { ops, options } = input;
  const atomic = options?.atomic ?? false;
  const includeEntities = options?.include_entities ?? false;
  const requestedFields = options?.fields;
  const dryRun = options?.dry_run ?? false;

  // Map of client_id → real EntityId (for cross-referencing within batch)
  const clientIdMap = new Map<string, EntityId>();

  // Track processed client_ids for idempotency
  const processedClientIds = new Set<string>();

  const results: BatchOpResult[] = [];
  const dryRunPreviews: DryRunPreview[] = [];
  let succeeded = 0;
  let failed = 0;

  // Helper to filter entity fields based on requested fields
  const filterEntityFields = (entityFull: EntityFull): Partial<EntityFull> => {
    if (!requestedFields || requestedFields.length === 0) {
      return entityFull; // Return all fields if none specified
    }
    const filtered: Partial<EntityFull> = {};
    for (const field of requestedFields) {
      if (field in entityFull) {
        (filtered as Record<string, unknown>)[field] = (entityFull as unknown as Record<string, unknown>)[field];
      }
    }
    return filtered;
  };

  // Helper to compute field changes for dry_run preview
  const computeChanges = (entity: Entity, payload: Record<string, unknown>): FieldChange[] => {
    const changes: FieldChange[] = [];

    // Check all fields in the payload, not just a hardcoded list
    for (const field of Object.keys(payload)) {
      if (payload[field] !== undefined) {
        const before = (entity as unknown as Record<string, unknown>)[field];
        const after = payload[field];

        // Check if values are different
        const beforeStr = JSON.stringify(before);
        const afterStr = JSON.stringify(after);
        if (beforeStr !== afterStr) {
          const change: FieldChange = { field, before, after };

          // For array fields, compute added/removed
          if (Array.isArray(before) && Array.isArray(after)) {
            const beforeSet = new Set(before as unknown[]);
            const afterSet = new Set(after as unknown[]);
            change.added = (after as unknown[]).filter(v => !beforeSet.has(v));
            change.removed = (before as unknown[]).filter(v => !afterSet.has(v));
          }

          changes.push(change);
        }
      }
    }
    return changes;
  };

  // Helper to resolve client_ids in payload
  const resolveClientIds = (payload: Record<string, unknown>): Record<string, unknown> => {
    const resolved = { ...payload };

    // Resolve parent reference
    if (resolved.parent && typeof resolved.parent === 'string') {
      const parentId = clientIdMap.get(resolved.parent);
      if (parentId) {
        resolved.parent = parentId;
      }
    }

    // Resolve depends_on references
    if (resolved.depends_on && Array.isArray(resolved.depends_on)) {
      resolved.depends_on = resolved.depends_on.map((dep: string) => {
        const resolvedId = clientIdMap.get(dep);
        return resolvedId || dep;
      });
    }

    // Resolve enables references (for decisions)
    if (resolved.enables && Array.isArray(resolved.enables)) {
      resolved.enables = resolved.enables.map((ref: string) => {
        const resolvedId = clientIdMap.get(ref);
        return resolvedId || ref;
      });
    }

    // Resolve implements references
    if (resolved.implements && Array.isArray(resolved.implements)) {
      resolved.implements = resolved.implements.map((ref: string) => {
        const resolvedId = clientIdMap.get(ref);
        return resolvedId || ref;
      });
    }

    return resolved;
  };

  for (const op of ops) {
    // Skip duplicate client_ids (idempotency)
    if (processedClientIds.has(op.client_id)) {
      // Return existing result if we have one
      const existingResult = results.find(r => r.client_id === op.client_id);
      if (existingResult) {
        results.push({ ...existingResult });
      }
      continue;
    }

    processedClientIds.add(op.client_id);

    try {
      switch (op.op) {
        case 'create': {
          if (!op.type) {
            throw new Error('type is required for create operation');
          }
          if (!op.payload.title) {
            throw new Error('title is required for create operation');
          }

          // Resolve client_ids in payload
          const resolvedPayload = resolveClientIds(op.payload);

          if (dryRun) {
            // In dry_run mode, just preview what would be created
            const preview: DryRunPreview = {
              client_id: op.client_id,
              op: 'create',
              changes: Object.entries(resolvedPayload).map(([field, value]) => ({
                field,
                before: undefined,
                after: value,
              })),
              validation_errors: [],
            };
            dryRunPreviews.push(preview);
            succeeded++;
            break;
          }

          // Create the entity
          const entity = await deps.createEntity(op.type, resolvedPayload);

          // Store mapping for cross-references
          clientIdMap.set(op.client_id, entity.id);

          // Add to canvas if requested
          if (options?.add_to_canvas && deps.addToCanvas && options.canvas_source) {
            await deps.addToCanvas(entity, options.canvas_source);
          }

          // Build result with optional entity data
          const createResult: BatchOpResult = {
            client_id: op.client_id,
            status: 'ok',
            id: entity.id,
          };

          // Include entity data if requested
          if (includeEntities) {
            const entityFull = await deps.toEntityFull(entity);
            createResult.entity = filterEntityFields(entityFull);
          }

          results.push(createResult);
          succeeded++;
          break;
        }

        case 'update': {
          if (!op.id) {
            throw new Error('id is required for update operation');
          }

          // Get entity
          const entity = await deps.getEntity(op.id);
          if (!entity) {
            throw new Error(`Entity not found: ${op.id}`);
          }

          // Resolve client_ids in payload
          const resolvedPayload = resolveClientIds(op.payload);

          // Validate status transition if status is being changed
          const validationErrors: string[] = [];
          if (resolvedPayload.status && resolvedPayload.status !== entity.status) {
            const validation = deps.validateStatusTransition(entity, resolvedPayload.status as EntityStatus);
            if (!validation.valid) {
              validationErrors.push(validation.reason || 'Invalid status transition');
            }
          }

          if (dryRun) {
            // In dry_run mode, compute and preview changes without executing
            const preview: DryRunPreview = {
              client_id: op.client_id,
              id: op.id,
              op: 'update',
              changes: computeChanges(entity, resolvedPayload),
              validation_errors: validationErrors,
            };
            dryRunPreviews.push(preview);
            if (validationErrors.length === 0) {
              succeeded++;
            } else {
              failed++;
            }
            break;
          }

          // Throw validation errors in non-dry_run mode
          if (validationErrors.length > 0) {
            throw new Error(validationErrors[0]);
          }

          // Track what was updated
          let statusChanged = false;
          let dependenciesAdded = 0;
          let fieldsUpdated = 0;

          // Handle status update
          if (resolvedPayload.status && resolvedPayload.status !== entity.status) {
            (entity as any).status = resolvedPayload.status;
            statusChanged = true;
          }

          // Handle depends_on - add to existing dependencies
          if (resolvedPayload.depends_on && Array.isArray(resolvedPayload.depends_on) && 'depends_on' in entity) {
            const currentDeps = ((entity as any).depends_on as EntityId[]) || [];
            const newDeps = resolvedPayload.depends_on as EntityId[];
            const mergedDeps = [...new Set([...currentDeps, ...newDeps])];
            dependenciesAdded = mergedDeps.length - currentDeps.length;
            (entity as any).depends_on = mergedDeps;
          }

          // Handle other field updates (title, priority, effort, content, parent, etc.)
          const fieldsToUpdate = ['title', 'priority', 'effort', 'content', 'workstream',
            'target_date', 'owner', 'acceptance_criteria', 'implements', 'enables', 'parent'];
          for (const field of fieldsToUpdate) {
            if (field in resolvedPayload && resolvedPayload[field] !== undefined) {
              // For array fields like implements/enables, merge with existing
              if ((field === 'implements' || field === 'enables') && Array.isArray(resolvedPayload[field])) {
                const current = ((entity as any)[field] as EntityId[]) || [];
                const newValues = resolvedPayload[field] as EntityId[];
                (entity as any)[field] = [...new Set([...current, ...newValues])];
              } else {
                (entity as any)[field] = resolvedPayload[field];
              }
              fieldsUpdated++;
            }
          }

          // Update timestamp and write if anything changed
          if (statusChanged || dependenciesAdded > 0 || fieldsUpdated > 0) {
            entity.updated_at = deps.getCurrentTimestamp() as any;
            await deps.writeEntity(entity);
          }

          // Store mapping for potential cross-references
          clientIdMap.set(op.client_id, op.id);

          // Build result with optional entity data
          const updateResult: BatchOpResult = {
            client_id: op.client_id,
            status: 'ok',
            id: op.id,
          };

          // Include entity data if requested
          if (includeEntities) {
            const entityFull = await deps.toEntityFull(entity);
            updateResult.entity = filterEntityFields(entityFull);
          }

          results.push(updateResult);
          succeeded++;
          break;
        }

        case 'archive': {
          if (!op.id) {
            throw new Error('id is required for archive operation');
          }

          // Get entity
          const entity = await deps.getEntity(op.id);
          if (!entity) {
            throw new Error(`Entity not found: ${op.id}`);
          }

          if (dryRun) {
            // In dry_run mode, preview what would be archived
            const preview: DryRunPreview = {
              client_id: op.client_id,
              id: op.id,
              op: 'archive',
              changes: [{ field: 'archived', before: entity.archived, after: true }],
              validation_errors: [],
            };
            dryRunPreviews.push(preview);
            succeeded++;
            break;
          }

          // Compute archive path
          const now = new Date();
          const quarter = Math.ceil((now.getMonth() + 1) / 3);
          const archivePath = `archive/${now.getFullYear()}-Q${quarter}`;

          // Archive with cascade if requested
          if (op.payload.cascade) {
            // Archive children first
            const children = await deps.getChildren(op.id);
            for (const child of children) {
              // Recursively get grandchildren for stories
              if (child.type === 'story') {
                const grandchildren = await deps.getChildren(child.id);
                for (const grandchild of grandchildren) {
                  await deps.archiveEntity(grandchild.id, archivePath);
                  if (options?.add_to_canvas === false && deps.removeFromCanvas && options.canvas_source) {
                    await deps.removeFromCanvas(grandchild.id, options.canvas_source);
                  }
                }
              }
              await deps.archiveEntity(child.id, archivePath);
              if (options?.add_to_canvas === false && deps.removeFromCanvas && options.canvas_source) {
                await deps.removeFromCanvas(child.id, options.canvas_source);
              }
            }
          }

          await deps.archiveEntity(op.id, archivePath);
          if (options?.add_to_canvas === false && deps.removeFromCanvas && options.canvas_source) {
            await deps.removeFromCanvas(op.id, options.canvas_source);
          }

          // Build result with optional entity data
          const archiveResult: BatchOpResult = {
            client_id: op.client_id,
            status: 'ok',
            id: op.id,
          };

          // Include entity data if requested (re-fetch after archive to get updated state)
          if (includeEntities) {
            const archivedEntity = await deps.getEntity(op.id);
            if (archivedEntity) {
              const entityFull = await deps.toEntityFull(archivedEntity);
              archiveResult.entity = filterEntityFields(entityFull);
            }
          }

          results.push(archiveResult);
          succeeded++;
          break;
        }

        default:
          throw new Error(`Unknown operation type: ${(op as any).op}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (atomic) {
        // In atomic mode, fail the entire batch
        throw new Error(`Batch operation failed at ${op.client_id}: ${errorMessage}`);
      }

      results.push({
        client_id: op.client_id,
        status: 'error',
        error: {
          code: 'OPERATION_FAILED',
          message: errorMessage,
        },
      });
      failed++;
    }
  }

  // Build output
  const output: BatchUpdateOutput = {
    results: dryRun ? [] : results,
    summary: {
      total: ops.length,
      succeeded,
      failed,
    },
  };

  // Add dry_run specific fields
  if (dryRun) {
    output.dry_run = true;
    output.would_update = dryRunPreviews;
  }

  return output;
}
