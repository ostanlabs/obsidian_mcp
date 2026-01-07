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
  BatchOperationsInput,
  BatchOperationsOutput,
  BatchUpdateStatusInput,
  BatchUpdateStatusOutput,
  BatchArchiveInput,
  BatchArchiveOutput,
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

/**
 * Create multiple entities with dependencies in a single operation.
 * Validates all relationships before creating any entities.
 */
export async function batchOperations(
  input: BatchOperationsInput,
  deps: BatchOperationsDependencies
): Promise<BatchOperationsOutput> {
  const { entities, dependencies, options } = input;
  const atomic = options?.atomic ?? true;

  // Build a map of batch IDs (ref -> type) for validation
  // This allows validation to check references within the same batch
  const batchIds = new Map<EntityId, EntityType>();
  for (let i = 0; i < entities.length; i++) {
    const ref = `entity_${i}` as EntityId;
    batchIds.set(ref, entities[i].type);
  }

  // Pre-validate all entities before creating any (for atomic operations)
  if (atomic) {
    const allErrors: Array<{ ref: string; errors: string[] }> = [];

    for (let i = 0; i < entities.length; i++) {
      const entityDef = entities[i];
      const ref = `entity_${i}`;

      const validationErrors = validateRelationships(
        entityDef.type,
        entityDef.data,
        deps,
        batchIds
      );

      if (validationErrors.length > 0) {
        allErrors.push({
          ref,
          errors: validationErrors.map(e => `${e.field}: ${e.message}`),
        });
      }
    }

    if (allErrors.length > 0) {
      const errorMsg = allErrors
        .map(e => `${e.ref}: ${e.errors.join('; ')}`)
        .join('\n');
      throw new Error(`Batch validation failed:\n${errorMsg}`);
    }
  }

  // Map of ref -> created entity ID
  const refToId = new Map<string, EntityId>();
  const created: BatchOperationsOutput['created'] = [];

  // Create entities in order
  for (let i = 0; i < entities.length; i++) {
    const entityDef = entities[i];
    const ref = `entity_${i}`;

    // Resolve parent reference if it's a ref
    const data = { ...entityDef.data };
    if (data.parent && typeof data.parent === 'string' && data.parent.startsWith('entity_')) {
      const resolvedParent = refToId.get(data.parent);
      if (!resolvedParent) {
        if (atomic) {
          throw new Error(`Cannot resolve parent reference: ${data.parent}`);
        }
        continue;
      }
      data.parent = resolvedParent;
    }

    // Resolve depends_on references
    if (data.depends_on && Array.isArray(data.depends_on)) {
      data.depends_on = data.depends_on.map((dep: string) => {
        if (dep.startsWith('entity_')) {
          const resolved = refToId.get(dep);
          if (!resolved && atomic) {
            throw new Error(`Cannot resolve dependency reference: ${dep}`);
          }
          return resolved || dep;
        }
        return dep;
      });
    }

    // Resolve enables references (for decisions)
    if (data.enables && Array.isArray(data.enables)) {
      data.enables = data.enables.map((enabledRef: string) => {
        if (enabledRef.startsWith('entity_')) {
          const resolved = refToId.get(enabledRef);
          if (!resolved && atomic) {
            throw new Error(`Cannot resolve enables reference: ${enabledRef}`);
          }
          return resolved || enabledRef;
        }
        return enabledRef;
      });
    }

    // Resolve implemented_by references (for documents)
    if (data.implemented_by && Array.isArray(data.implemented_by)) {
      data.implemented_by = data.implemented_by.map((implRef: string) => {
        if (implRef.startsWith('entity_')) {
          const resolved = refToId.get(implRef);
          if (!resolved && atomic) {
            throw new Error(`Cannot resolve implemented_by reference: ${implRef}`);
          }
          return resolved || implRef;
        }
        return implRef;
      });
    }

    try {
      const entity = await deps.createEntity(entityDef.type, data);
      refToId.set(ref, entity.id);
      created.push({ ref, id: entity.id, type: entityDef.type });

      // Add to canvas if requested
      if (options?.add_to_canvas && deps.addToCanvas && options.canvas_source) {
        await deps.addToCanvas(entity, options.canvas_source);
      }
    } catch (error) {
      if (atomic) {
        throw error;
      }
      // Non-atomic: continue with other entities
    }
  }

  // Create explicit dependencies
  let dependenciesCreated = 0;
  if (dependencies) {
    for (const dep of dependencies) {
      const fromId = dep.from.startsWith('entity_') ? refToId.get(dep.from) : dep.from as EntityId;
      const toId = dep.to.startsWith('entity_') ? refToId.get(dep.to) : dep.to as EntityId;

      if (fromId && toId) {
        // Dependencies are handled via entity updates
        // The depends_on field is already set during creation
        dependenciesCreated++;
      }
    }
  }

  return {
    created,
    dependencies_created: dependenciesCreated,
    canvas_nodes_added: options?.add_to_canvas ? created.length : 0,
  };
}

// =============================================================================
// Batch Update Status
// =============================================================================

/**
 * Update status of multiple entities with optional cascading.
 */
export async function batchUpdateStatus(
  input: BatchUpdateStatusInput,
  deps: BatchOperationsDependencies
): Promise<BatchUpdateStatusOutput> {
  const { updates, options } = input;
  const autoCascade = options?.auto_cascade ?? false;

  const updated: EntityId[] = [];
  const cascaded: EntityId[] = [];
  const failed: Array<{ id: EntityId; error: string }> = [];

  for (const update of updates) {
    try {
      // Get entity
      const entity = await deps.getEntity(update.id);
      if (!entity) {
        failed.push({ id: update.id, error: 'Entity not found' });
        continue;
      }

      // Validate transition
      const validation = deps.validateStatusTransition(entity, update.status);
      if (!validation.valid) {
        failed.push({ id: update.id, error: validation.reason || 'Invalid transition' });
        continue;
      }

      // Update status
      await deps.updateEntityStatus(update.id, update.status);
      updated.push(update.id);

      // Handle cascade if enabled
      if (autoCascade) {
        const cascadeEffects = await deps.computeCascadeEffects(entity, update.status);
        for (const cascadeId of cascadeEffects) {
          if (!updated.includes(cascadeId) && !cascaded.includes(cascadeId)) {
            cascaded.push(cascadeId);
          }
        }
      }
    } catch (error) {
      failed.push({
        id: update.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { updated, cascaded, failed };
}

// =============================================================================
// Batch Archive
// =============================================================================

/**
 * Archive multiple entities (milestones with children, or individual entities).
 */
export async function batchArchive(
  input: BatchArchiveInput,
  deps: BatchOperationsDependencies
): Promise<BatchArchiveOutput> {
  const { milestone_ids, entity_ids, options } = input;

  // Compute archive path
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const archivePath = options?.archive_folder || `archive/${now.getFullYear()}-Q${quarter}`;

  const archived: BatchArchiveOutput['archived'] = {
    milestones: [],
    stories: [],
    tasks: [],
    decisions: [],
    documents: [],
  };

  // Archive milestones with all children
  if (milestone_ids) {
    for (const milestoneId of milestone_ids) {
      const milestone = await deps.getEntity(milestoneId);
      if (!milestone || milestone.type !== 'milestone') continue;

      // Get stories under milestone
      const stories = await deps.getChildren(milestoneId);
      for (const story of stories) {
        // Get tasks under story
        const tasks = await deps.getChildren(story.id);
        for (const task of tasks) {
          await deps.archiveEntity(task.id, archivePath);
          archived.tasks.push(task.id);

          if (options?.remove_from_canvas && deps.removeFromCanvas && options.canvas_source) {
            await deps.removeFromCanvas(task.id, options.canvas_source);
          }
        }

        await deps.archiveEntity(story.id, archivePath);
        archived.stories.push(story.id);

        if (options?.remove_from_canvas && deps.removeFromCanvas && options.canvas_source) {
          await deps.removeFromCanvas(story.id, options.canvas_source);
        }
      }

      await deps.archiveEntity(milestoneId, archivePath);
      archived.milestones.push(milestoneId);

      if (options?.remove_from_canvas && deps.removeFromCanvas && options.canvas_source) {
        await deps.removeFromCanvas(milestoneId, options.canvas_source);
      }
    }
  }

  // Archive individual entities
  if (entity_ids) {
    for (const entityId of entity_ids) {
      const entity = await deps.getEntity(entityId);
      if (!entity) continue;

      await deps.archiveEntity(entityId, archivePath);

      // Add to appropriate category
      switch (entity.type) {
        case 'milestone':
          archived.milestones.push(entityId);
          break;
        case 'story':
          archived.stories.push(entityId);
          break;
        case 'task':
          archived.tasks.push(entityId);
          break;
        case 'decision':
          archived.decisions.push(entityId);
          break;
        case 'document':
          archived.documents.push(entityId);
          break;
      }

      if (options?.remove_from_canvas && deps.removeFromCanvas && options.canvas_source) {
        await deps.removeFromCanvas(entityId, options.canvas_source);
      }
    }
  }

  const totalArchived =
    archived.milestones.length +
    archived.stories.length +
    archived.tasks.length +
    archived.decisions.length +
    archived.documents.length;

  return {
    archived,
    total_archived: totalArchived,
    archive_path: archivePath,
  };
}

// =============================================================================
// NEW: Unified Batch Update (replaces batch_operations, batch_update_status, batch_archive)
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
