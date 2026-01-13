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

  // Map of client_id → real EntityId (for cross-referencing within batch)
  const clientIdMap = new Map<string, EntityId>();

  // Track processed client_ids for idempotency
  const processedClientIds = new Set<string>();

  const results: BatchOpResult[] = [];
  let succeeded = 0;
  let failed = 0;

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

          // Create the entity
          const entity = await deps.createEntity(op.type, resolvedPayload);

          // Store mapping for cross-references
          clientIdMap.set(op.client_id, entity.id);

          // Add to canvas if requested
          if (options?.add_to_canvas && deps.addToCanvas && options.canvas_source) {
            await deps.addToCanvas(entity, options.canvas_source);
          }

          results.push({
            client_id: op.client_id,
            status: 'ok',
            id: entity.id,
          });
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

          // Track what was updated
          let statusChanged = false;
          let dependenciesAdded = 0;
          let fieldsUpdated = 0;

          // Handle status update with validation
          if (resolvedPayload.status && resolvedPayload.status !== entity.status) {
            const validation = deps.validateStatusTransition(entity, resolvedPayload.status as EntityStatus);
            if (!validation.valid) {
              throw new Error(validation.reason || 'Invalid status transition');
            }
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

          results.push({
            client_id: op.client_id,
            status: 'ok',
            id: op.id,
          });
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

          results.push({
            client_id: op.client_id,
            status: 'ok',
            id: op.id,
          });
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

  return {
    results,
    summary: {
      total: ops.length,
      succeeded,
      failed,
    },
  };
}
