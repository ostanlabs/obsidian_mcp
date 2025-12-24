/**
 * Batch Operations Tools
 *
 * Category 2: Batch Operations
 * - batch_operations: Create multiple entities with dependencies
 * - batch_update_status: Update status of multiple entities
 * - batch_archive: Archive multiple entities
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

  /** Archive entity */
  archiveEntity: (id: EntityId, archivePath: string) => Promise<void>;

  /** Get children of an entity */
  getChildren: (id: EntityId) => Promise<Entity[]>;

  /** Validate status transition */
  validateStatusTransition: (entity: Entity, newStatus: EntityStatus) => { valid: boolean; reason?: string };

  /** Compute cascade effects */
  computeCascadeEffects: (entity: Entity, newStatus: EntityStatus) => Promise<EntityId[]>;

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
