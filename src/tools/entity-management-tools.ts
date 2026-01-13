/**
 * V2 Entity Management Tools
 *
 * MCP tools for creating, updating, archiving, and restoring entities.
 */

import {
  Entity,
  EntityId,
  EntityType,
  EntityStatus,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  MilestoneId,
  StoryId,
  TaskId,
  DecisionId,
  DocumentId,
} from '../models/v2-types.js';

import {
  CreateEntityInput,
  CreateEntityOutput,
  UpdateEntityInput,
  UpdateEntityOutput,
  UpdateEntityStatusInput,
  UpdateEntityStatusOutput,
  ArchiveEntityInput,
  ArchiveEntityOutput,
  ArchiveMilestoneInput,
  ArchiveMilestoneOutput,
  RestoreFromArchiveInput,
  RestoreFromArchiveOutput,
  EntityFull,
} from './tool-types.js';

import { generateCssClasses } from '../services/v2/entity-serializer.js';

// =============================================================================
// Relationship Validation Constants
// =============================================================================

/**
 * Valid target types for Decision.blocks field.
 * Decisions can block: documents, stories, tasks (NOT milestones)
 */
const DECISION_BLOCKS_VALID_TYPES: EntityType[] = ['document', 'story', 'task'];

/**
 * Valid target types for Document.implemented_by field.
 * Documents can be implemented by: stories, tasks (NOT milestones)
 */
const DOCUMENT_IMPLEMENTED_BY_VALID_TYPES: EntityType[] = ['story', 'task'];

/**
 * Valid target types for depends_on fields by entity type.
 */
const DEPENDS_ON_VALID_TYPES: Record<EntityType, EntityType[]> = {
  milestone: ['milestone', 'decision'],
  story: ['story', 'decision', 'document'],
  task: ['task', 'decision'],
  decision: ['decision'],
  document: ['document', 'decision'],
  feature: ['feature', 'decision'],
};

// =============================================================================
// Dependencies (injected)
// =============================================================================

export interface EntityManagementDependencies {
  // Index operations
  getEntity: (id: EntityId) => Promise<Entity | null>;
  getNextId: (type: EntityType) => Promise<EntityId>;
  getChildren: (parentId: EntityId) => Promise<Entity[]>;
  entityExists: (id: EntityId) => boolean;
  getEntityType: (id: EntityId) => EntityType | null;

  // File operations
  writeEntity: (entity: Entity) => Promise<void>;
  moveToArchive: (id: EntityId, archivePath?: string) => Promise<string>;
  restoreFromArchive: (id: EntityId) => Promise<string>;

  // Lifecycle operations
  validateStatusTransition: (
    entity: Entity,
    newStatus: EntityStatus
  ) => { valid: boolean; reason?: string };
  computeCascadeEffects: (
    entity: Entity,
    newStatus: EntityStatus
  ) => Promise<EntityId[]>;

  // Canvas operations (optional)
  addToCanvas?: (entity: Entity, canvasPath: string) => Promise<boolean>;
  removeFromCanvas?: (id: EntityId, canvasPath: string) => Promise<boolean>;

  // Utility
  toEntityFull: (entity: Entity) => Promise<EntityFull>;
  getCurrentTimestamp: () => string;
}

// =============================================================================
// Relationship Validation
// =============================================================================

export interface RelationshipValidationError {
  field: string;
  message: string;
  invalidId?: EntityId;
}

/**
 * Validate entity relationships before creation/update.
 * Checks that:
 * 1. All referenced entity IDs exist (or are in the batch being created)
 * 2. Relationship types are valid (e.g., decisions can't enable milestones)
 *
 * @param type - The entity type being created/updated
 * @param data - The entity data containing relationships
 * @param deps - Dependencies for entity lookup
 * @param batchIds - Optional map of IDs being created in the same batch (id -> type)
 */
export function validateRelationships(
  type: EntityType,
  data: Record<string, unknown>,
  deps: { entityExists: (id: EntityId) => boolean; getEntityType: (id: EntityId) => EntityType | null },
  batchIds?: Map<EntityId, EntityType>
): RelationshipValidationError[] {
  const errors: RelationshipValidationError[] = [];

  // Helper to check if an ID exists (in cache or batch)
  const idExists = (id: EntityId): boolean => {
    return deps.entityExists(id) || (batchIds?.has(id) ?? false);
  };

  // Helper to get entity type (from cache or batch)
  const getType = (id: EntityId): EntityType | null => {
    const cachedType = deps.getEntityType(id);
    if (cachedType) return cachedType;
    return batchIds?.get(id) ?? null;
  };

  // Validate parent reference
  const parent = data.parent as EntityId | undefined;
  if (parent) {
    if (!idExists(parent)) {
      errors.push({
        field: 'parent',
        message: `Parent entity '${parent}' does not exist`,
        invalidId: parent,
      });
    } else {
      // Validate parent type
      const parentType = getType(parent);
      if (type === 'story' && parentType && parentType !== 'milestone') {
        errors.push({
          field: 'parent',
          message: `Story parent must be a milestone, got '${parentType}'`,
          invalidId: parent,
        });
      }
      if (type === 'task' && parentType && parentType !== 'story') {
        errors.push({
          field: 'parent',
          message: `Task parent must be a story, got '${parentType}'`,
          invalidId: parent,
        });
      }
    }
  }

  // Validate depends_on references
  const dependsOn = data.depends_on as EntityId[] | undefined;
  if (dependsOn && dependsOn.length > 0) {
    const validTypes = DEPENDS_ON_VALID_TYPES[type];
    for (const depId of dependsOn) {
      if (!idExists(depId)) {
        errors.push({
          field: 'depends_on',
          message: `Dependency '${depId}' does not exist`,
          invalidId: depId,
        });
      } else {
        const depType = getType(depId);
        if (depType && !validTypes.includes(depType)) {
          errors.push({
            field: 'depends_on',
            message: `${type} cannot depend on ${depType} '${depId}'. Valid types: ${validTypes.join(', ')}`,
            invalidId: depId,
          });
        }
      }
    }
  }

  // Validate implements references (for stories and milestones)
  const implementsField = data.implements as EntityId[] | undefined;
  if (implementsField && implementsField.length > 0) {
    for (const implId of implementsField) {
      if (!idExists(implId)) {
        errors.push({
          field: 'implements',
          message: `Document '${implId}' does not exist`,
          invalidId: implId,
        });
      } else {
        const implType = getType(implId);
        if (implType && implType !== 'document') {
          errors.push({
            field: 'implements',
            message: `Can only implement documents, got ${implType} '${implId}'`,
            invalidId: implId,
          });
        }
      }
    }
  }

  // Validate blocks references (for decisions)
  if (type === 'decision') {
    const blocks = data.blocks as EntityId[] | undefined;
    if (blocks && blocks.length > 0) {
      for (const blockedId of blocks) {
        if (!idExists(blockedId)) {
          errors.push({
            field: 'blocks',
            message: `Entity '${blockedId}' does not exist`,
            invalidId: blockedId,
          });
        } else {
          const blockedType = getType(blockedId);
          if (blockedType && !DECISION_BLOCKS_VALID_TYPES.includes(blockedType)) {
            errors.push({
              field: 'blocks',
              message: `Decision cannot block ${blockedType} '${blockedId}'. Valid types: ${DECISION_BLOCKS_VALID_TYPES.join(', ')}`,
              invalidId: blockedId,
            });
          }
        }
      }
    }
  }

  // Validate implemented_by references (for documents)
  if (type === 'document') {
    const implementedBy = data.implemented_by as EntityId[] | undefined;
    if (implementedBy && implementedBy.length > 0) {
      for (const implById of implementedBy) {
        if (!idExists(implById)) {
          errors.push({
            field: 'implemented_by',
            message: `Entity '${implById}' does not exist`,
            invalidId: implById,
          });
        } else {
          const implByType = getType(implById);
          if (implByType && !DOCUMENT_IMPLEMENTED_BY_VALID_TYPES.includes(implByType)) {
            errors.push({
              field: 'implemented_by',
              message: `Document cannot be implemented by ${implByType} '${implById}'. Valid types: ${DOCUMENT_IMPLEMENTED_BY_VALID_TYPES.join(', ')}`,
              invalidId: implById,
            });
          }
        }
      }
    }
  }

  // Validate supersedes reference (for decisions)
  if (type === 'decision') {
    const supersedes = data.supersedes as EntityId | undefined;
    if (supersedes) {
      if (!idExists(supersedes)) {
        errors.push({
          field: 'supersedes',
          message: `Decision '${supersedes}' does not exist`,
          invalidId: supersedes,
        });
      } else {
        const supersedesType = getType(supersedes);
        if (supersedesType && supersedesType !== 'decision') {
          errors.push({
            field: 'supersedes',
            message: `Can only supersede decisions, got ${supersedesType} '${supersedes}'`,
            invalidId: supersedes,
          });
        }
      }
    }
  }

  return errors;
}

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Create a new entity with optional dependencies and relationships.
 */
export async function createEntity(
  input: CreateEntityInput,
  deps: EntityManagementDependencies
): Promise<CreateEntityOutput> {
  const { type, data, options } = input;

  // Validate relationships before creating
  const validationErrors = validateRelationships(type, data, deps);
  if (validationErrors.length > 0) {
    const errorMessages = validationErrors.map(e => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Invalid relationships: ${errorMessages}`);
  }

  // Generate new ID
  const id = await deps.getNextId(type);

  // Build base entity
  const now = deps.getCurrentTimestamp();
  const baseEntity = {
    id,
    type,
    title: data.title,
    workstream: data.workstream,
    created_at: now,
    updated_at: now,
    archived: false,
    canvas_source: options?.canvas_source,
  };

  // Build type-specific entity
  let entity: Entity;
  switch (type) {
    case 'milestone':
      entity = buildMilestone(baseEntity, data);
      break;
    case 'story':
      entity = buildStory(baseEntity, data);
      break;
    case 'task':
      entity = buildTask(baseEntity, data);
      break;
    case 'decision':
      entity = buildDecision(baseEntity, data);
      break;
    case 'document':
      entity = buildDocument(baseEntity, data);
      break;
    default:
      throw new Error(`Unknown entity type: ${type}`);
  }

  // Write entity to file
  await deps.writeEntity(entity);

  // Add to canvas if requested
  let canvasNodeAdded = false;
  if (options?.add_to_canvas !== false && deps.addToCanvas && options?.canvas_source) {
    canvasNodeAdded = await deps.addToCanvas(entity, options.canvas_source);
  }

  // Convert to full representation
  const entityFull = await deps.toEntityFull(entity);

  return {
    id,
    entity: entityFull,
    dependencies_created: data.depends_on?.length ?? 0,
    canvas_node_added: canvasNodeAdded,
  };
}

// =============================================================================
// Entity Builders
// =============================================================================

function buildMilestone(
  base: Record<string, unknown>,
  data: Record<string, unknown>
): Milestone {
  const entity = {
    ...base,
    type: 'milestone',
    status: (data.status as string) || 'Not Started',
    priority: data.priority as string,
    target_date: data.target_date as string,
    owner: data.owner as string,
    depends_on: (data.depends_on as MilestoneId[]) || [],
  } as Milestone;

  // Auto-generate cssclasses if not provided
  entity.cssclasses = (data.cssclasses as string[]) || generateCssClasses(entity);
  return entity;
}

function buildStory(
  base: Record<string, unknown>,
  data: Record<string, unknown>
): Story {
  const entity = {
    ...base,
    type: 'story',
    status: (data.status as string) || 'Not Started',
    parent: data.parent as MilestoneId,
    effort: data.effort as string,
    priority: data.priority as string,
    depends_on: (data.depends_on as EntityId[]) || [],
    implements: (data.implements as DocumentId[]) || [],
    acceptance_criteria: (data.acceptance_criteria as string[]) || [],
    tasks: (data.tasks as Story['tasks']) || [],
  } as Story;

  // Auto-generate cssclasses if not provided
  entity.cssclasses = (data.cssclasses as string[]) || generateCssClasses(entity);
  return entity;
}

function buildTask(
  base: Record<string, unknown>,
  data: Record<string, unknown>
): Task {
  const entity = {
    ...base,
    type: 'task',
    status: (data.status as string) || 'Not Started',
    parent: data.parent as StoryId,
    goal: (data.goal as string) || '',
    estimate_hrs: data.estimate_hrs as number,
    actual_hrs: data.actual_hrs as number,
    assignee: data.assignee as string,
    description: data.description as string,
    technical_notes: data.technical_notes as string,
    notes: data.notes as string,
  } as unknown as Task;

  // Auto-generate cssclasses if not provided
  entity.cssclasses = (data.cssclasses as string[]) || generateCssClasses(entity);
  return entity;
}

function buildDecision(
  base: Record<string, unknown>,
  data: Record<string, unknown>
): Decision {
  const entity = {
    ...base,
    type: 'decision',
    status: (data.status as string) || 'Pending',
    decided_by: data.decided_by as string,
    decided_on: data.decided_on as string,
    supersedes: data.supersedes as DecisionId,
    blocks: (data.blocks as EntityId[]) || [],
    depends_on: (data.depends_on as DecisionId[]) || [],
  } as unknown as Decision;

  // Auto-generate cssclasses if not provided
  entity.cssclasses = (data.cssclasses as string[]) || generateCssClasses(entity);
  return entity;
}

function buildDocument(
  base: Record<string, unknown>,
  data: Record<string, unknown>
): Document {
  const entity = {
    ...base,
    type: 'document',
    doc_type: (data.doc_type as string) || 'spec',
    status: (data.status as string) || 'Draft',
    version: data.version as string,
    owner: data.owner as string,
    implementation_context: data.implementation_context as string,
    implemented_by: (data.implemented_by as StoryId[]) || [],
    previous_version: (data.previous_version as DocumentId[]) || [],
    content: data.content as string,
  } as unknown as Document;

  // Auto-generate cssclasses if not provided
  entity.cssclasses = (data.cssclasses as string[]) || generateCssClasses(entity);
  return entity;
}

// =============================================================================
// Update Entity (Enhanced - consolidates status, archive, restore operations)
// =============================================================================

/**
 * Update entity fields and/or modify relationships.
 * Enhanced to support:
 * - Status updates with validation and cascade (replaces update_entity_status)
 * - Archive operations (replaces archive_entity, archive_milestone)
 * - Restore operations (replaces restore_from_archive)
 */
export async function updateEntity(
  input: UpdateEntityInput,
  deps: EntityManagementDependencies
): Promise<UpdateEntityOutput> {
  const {
    id,
    data,
    add_dependencies,
    remove_dependencies,
    add_to,
    remove_from,
    status,
    status_note,
    cascade,
    archived,
    archive_options,
    restore_options,
  } = input;

  // Get existing entity
  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  // Initialize result
  const result: UpdateEntityOutput = {
    id,
    entity: null as unknown as EntityFull, // Will be set at the end
    dependencies_added: 0,
    dependencies_removed: 0,
  };

  // Handle archive operation (takes precedence)
  if (archived === true) {
    const archiveResult = await handleArchiveOperation(entity, archive_options, deps);
    result.archive_result = archiveResult;
    // After archiving, get the updated entity
    const archivedEntity = await deps.getEntity(id);
    if (archivedEntity) {
      result.entity = await deps.toEntityFull(archivedEntity);
    }
    return result;
  }

  // Handle restore operation
  if (archived === false && entity.archived) {
    const restoreResult = await handleRestoreOperation(entity, restore_options, deps);
    result.restore_result = restoreResult;
    // After restoring, get the updated entity
    const restoredEntity = await deps.getEntity(id);
    if (restoredEntity) {
      result.entity = await deps.toEntityFull(restoredEntity);
    }
    return result;
  }

  // Apply field updates
  const updatedEntity = { ...entity };
  if (data) {
    Object.assign(updatedEntity, data);
  }

  // Handle status update with validation and cascade
  if (status && status !== entity.status) {
    const statusResult = await handleStatusUpdate(entity, status, status_note, cascade, deps);
    result.status_changed = statusResult;
    updatedEntity.status = status as typeof updatedEntity.status;
  }

  // Handle dependency changes
  if ('depends_on' in updatedEntity) {
    const currentDeps = (updatedEntity as { depends_on: EntityId[] }).depends_on || [];

    if (add_dependencies) {
      const newDeps = [...new Set([...currentDeps, ...add_dependencies])];
      (updatedEntity as { depends_on: EntityId[] }).depends_on = newDeps;
      result.dependencies_added = newDeps.length - currentDeps.length;
    }

    if (remove_dependencies) {
      const filtered = currentDeps.filter((d) => !remove_dependencies.includes(d));
      (updatedEntity as { depends_on: EntityId[] }).depends_on = filtered;
      result.dependencies_removed = currentDeps.length - filtered.length;
    }
  }

  // Handle relationship additions (implements, blocks)
  if (add_to) {
    if (add_to.implements && 'implements' in updatedEntity) {
      const current = (updatedEntity as Story).implements || [];
      (updatedEntity as Story).implements = [...new Set([...current, ...add_to.implements as DocumentId[]])];
    }
    if (add_to.blocks && 'blocks' in updatedEntity) {
      const current = (updatedEntity as Decision).blocks || [];
      (updatedEntity as Decision).blocks = [...new Set([...current, ...add_to.blocks])];
    }
  }

  // Handle relationship removals
  if (remove_from) {
    if (remove_from.implements && 'implements' in updatedEntity) {
      const current = (updatedEntity as Story).implements || [];
      (updatedEntity as Story).implements = current.filter(
        (i) => !remove_from.implements!.includes(i)
      );
    }
    if (remove_from.blocks && 'blocks' in updatedEntity) {
      const current = (updatedEntity as Decision).blocks || [];
      (updatedEntity as Decision).blocks = current.filter(
        (e: EntityId) => !remove_from.blocks!.includes(e)
      );
    }
  }

  // Update timestamp
  updatedEntity.updated_at = deps.getCurrentTimestamp();

  // Write updated entity
  await deps.writeEntity(updatedEntity);

  // Convert to full representation
  result.entity = await deps.toEntityFull(updatedEntity);

  return result;
}

// =============================================================================
// Helper: Handle Status Update
// =============================================================================

async function handleStatusUpdate(
  entity: Entity,
  newStatus: EntityStatus,
  note: string | undefined,
  cascade: boolean | undefined,
  deps: EntityManagementDependencies
): Promise<{ old_status: EntityStatus; new_status: EntityStatus; cascaded_updates: EntityId[] }> {
  const oldStatus = entity.status;

  // Validate transition
  const validation = deps.validateStatusTransition(entity, newStatus);
  if (!validation.valid) {
    throw new Error(`Invalid status transition: ${validation.reason}`);
  }

  // Compute cascade effects if requested
  let cascadedUpdates: EntityId[] = [];
  if (cascade) {
    cascadedUpdates = await deps.computeCascadeEffects(entity, newStatus);
  }

  return {
    old_status: oldStatus,
    new_status: newStatus,
    cascaded_updates: cascadedUpdates,
  };
}

// =============================================================================
// Helper: Handle Archive Operation
// =============================================================================

async function handleArchiveOperation(
  entity: Entity,
  options: UpdateEntityInput['archive_options'],
  deps: EntityManagementDependencies
): Promise<{ archived: boolean; archive_path?: string; archived_children?: EntityId[] }> {
  const { force, cascade: archiveCascade, archive_folder, remove_from_canvas, canvas_source } = options || {};

  // For milestones with cascade, archive all children
  if (entity.type === 'milestone' && archiveCascade) {
    const archivedChildren: EntityId[] = [];

    // Compute archive path
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const archivePath = archive_folder || `archive/${now.getFullYear()}-Q${quarter}`;

    // Get all children (stories)
    const stories = await deps.getChildren(entity.id);
    for (const story of stories) {
      // Get tasks for each story
      const tasks = await deps.getChildren(story.id);
      for (const task of tasks) {
        await deps.moveToArchive(task.id, archivePath);
        archivedChildren.push(task.id);
        if (remove_from_canvas && deps.removeFromCanvas && canvas_source) {
          await deps.removeFromCanvas(task.id, canvas_source);
        }
      }
      await deps.moveToArchive(story.id, archivePath);
      archivedChildren.push(story.id);
      if (remove_from_canvas && deps.removeFromCanvas && canvas_source) {
        await deps.removeFromCanvas(story.id, canvas_source);
      }
    }

    // Archive the milestone itself
    const finalPath = await deps.moveToArchive(entity.id, archivePath);
    if (remove_from_canvas && deps.removeFromCanvas && canvas_source) {
      await deps.removeFromCanvas(entity.id, canvas_source);
    }

    return {
      archived: true,
      archive_path: finalPath,
      archived_children: archivedChildren,
    };
  }

  // For non-cascade archive, check for children
  if (!force) {
    const children = await deps.getChildren(entity.id);
    if (children.length > 0) {
      throw new Error(
        `Entity has ${children.length} children. Use archive_options.force=true to archive anyway, or archive_options.cascade=true to archive children.`
      );
    }
  }

  // Move to archive
  const finalPath = await deps.moveToArchive(entity.id, archive_folder);

  // Remove from canvas if requested
  if (remove_from_canvas && deps.removeFromCanvas && canvas_source) {
    await deps.removeFromCanvas(entity.id, canvas_source);
  }

  return {
    archived: true,
    archive_path: finalPath,
  };
}

// =============================================================================
// Helper: Handle Restore Operation
// =============================================================================

async function handleRestoreOperation(
  entity: Entity,
  options: UpdateEntityInput['restore_options'],
  deps: EntityManagementDependencies
): Promise<{ restored: boolean; restored_children?: EntityId[] }> {
  const { restore_children, add_to_canvas, canvas_source } = options || {};

  // Restore the entity
  await deps.restoreFromArchive(entity.id);

  // Add to canvas if requested
  if (add_to_canvas && deps.addToCanvas && canvas_source) {
    const restoredEntity = await deps.getEntity(entity.id);
    if (restoredEntity) {
      await deps.addToCanvas(restoredEntity, canvas_source);
    }
  }

  // Restore children if requested
  const restoredChildren: EntityId[] = [];
  if (restore_children) {
    const children = await deps.getChildren(entity.id);
    for (const child of children) {
      await deps.restoreFromArchive(child.id);
      restoredChildren.push(child.id);

      if (add_to_canvas && deps.addToCanvas && canvas_source) {
        await deps.addToCanvas(child, canvas_source);
      }

      // Also restore grandchildren (tasks under stories)
      const grandchildren = await deps.getChildren(child.id);
      for (const grandchild of grandchildren) {
        await deps.restoreFromArchive(grandchild.id);
        restoredChildren.push(grandchild.id);

        if (add_to_canvas && deps.addToCanvas && canvas_source) {
          await deps.addToCanvas(grandchild, canvas_source);
        }
      }
    }
  }

  return {
    restored: true,
    restored_children: restoredChildren.length > 0 ? restoredChildren : undefined,
  };
}


// =============================================================================
// Update Entity Status (DEPRECATED - use updateEntity with status field)
// =============================================================================

/**
 * @deprecated Use updateEntity({ id, status, status_note, cascade }) instead.
 * Dedicated status update with optional note and cascade.
 */
export async function updateEntityStatus(
  input: UpdateEntityStatusInput,
  deps: EntityManagementDependencies
): Promise<UpdateEntityStatusOutput> {
  const { id, status, note, cascade } = input;

  // Get existing entity
  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  const oldStatus = entity.status;

  // Validate transition
  const validation = deps.validateStatusTransition(entity, status);
  if (!validation.valid) {
    throw new Error(`Invalid status transition: ${validation.reason}`);
  }

  // Update entity - cast to Entity to handle status type variance
  const updatedEntity = {
    ...entity,
    status,
    updated_at: deps.getCurrentTimestamp(),
  } as Entity;

  // Add note to content if provided
  if (note) {
    // Note: In a real implementation, this would append to the entity's notes section
    // For now, we just update the entity
  }

  // Write updated entity
  await deps.writeEntity(updatedEntity);

  // Compute cascade effects if requested
  let cascadedUpdates: EntityId[] = [];
  if (cascade) {
    cascadedUpdates = await deps.computeCascadeEffects(updatedEntity, status);
  }

  return {
    id,
    old_status: oldStatus,
    new_status: status,
    cascaded_updates: cascadedUpdates,
  };
}

// =============================================================================
// Archive Entity (DEPRECATED - use updateEntity with archived: true)
// =============================================================================

/**
 * @deprecated Use updateEntity({ id, archived: true, archive_options }) instead.
 * Archive a single entity.
 */
export async function archiveEntity(
  input: ArchiveEntityInput,
  deps: EntityManagementDependencies
): Promise<ArchiveEntityOutput> {
  const { id, force, remove_from_canvas, canvas_source } = input;

  // Get existing entity
  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  // Check for children if not forcing
  if (!force) {
    const children = await deps.getChildren(id);
    if (children.length > 0) {
      throw new Error(
        `Entity has ${children.length} children. Use force=true to archive anyway.`
      );
    }
  }

  // Move to archive (runtime handles path computation based on config)
  const finalPath = await deps.moveToArchive(id);

  // Remove from canvas if requested
  if (remove_from_canvas && deps.removeFromCanvas && canvas_source) {
    await deps.removeFromCanvas(id, canvas_source);
  }

  return {
    id,
    archived: true,
    archive_path: finalPath,
  };
}

// =============================================================================
// Archive Milestone (DEPRECATED - use updateEntity with archived: true, archive_options.cascade: true)
// =============================================================================

/**
 * @deprecated Use updateEntity({ id, archived: true, archive_options: { cascade: true } }) instead.
 * Archive a milestone and all its children.
 */
export async function archiveMilestone(
  input: ArchiveMilestoneInput,
  deps: EntityManagementDependencies
): Promise<ArchiveMilestoneOutput> {
  const { milestone_id, archive_folder, remove_from_canvas, canvas_source } = input;

  // Get milestone
  const milestone = await deps.getEntity(milestone_id);
  if (!milestone) {
    throw new Error(`Milestone not found: ${milestone_id}`);
  }
  if (milestone.type !== 'milestone') {
    throw new Error(`Entity ${milestone_id} is not a milestone`);
  }

  // Compute archive path
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const archivePath = archive_folder || `archive/${now.getFullYear()}-Q${quarter}`;

  // Collect all entities to archive
  const archivedMilestones: EntityId[] = [milestone_id];
  const archivedStories: EntityId[] = [];
  const archivedTasks: EntityId[] = [];

  // Get all children (stories)
  const stories = await deps.getChildren(milestone_id);
  for (const story of stories) {
    archivedStories.push(story.id);

    // Get tasks for each story
    const tasks = await deps.getChildren(story.id);
    for (const task of tasks) {
      archivedTasks.push(task.id);
    }
  }

  // Archive all entities and remove from canvas
  const allIds = [...archivedTasks, ...archivedStories, ...archivedMilestones];
  for (const id of allIds) {
    await deps.moveToArchive(id, archivePath);

    // Remove from canvas if requested
    if (remove_from_canvas && deps.removeFromCanvas && canvas_source) {
      await deps.removeFromCanvas(id, canvas_source);
    }
  }

  return {
    milestone_id,
    archived_entities: {
      milestones: archivedMilestones,
      stories: archivedStories,
      tasks: archivedTasks,
    },
    total_archived: archivedMilestones.length + archivedStories.length + archivedTasks.length,
    archive_path: archivePath,
  };
}

// =============================================================================
// Restore From Archive (DEPRECATED - use updateEntity with archived: false)
// =============================================================================

/**
 * @deprecated Use updateEntity({ id, archived: false, restore_options }) instead.
 * Restore an archived entity.
 */
export async function restoreFromArchive(
  input: RestoreFromArchiveInput,
  deps: EntityManagementDependencies
): Promise<RestoreFromArchiveOutput> {
  const { id, restore_children, add_to_canvas, canvas_source } = input;

  // Restore the entity
  await deps.restoreFromArchive(id);

  // Add to canvas if requested
  if (add_to_canvas && deps.addToCanvas && canvas_source) {
    const entity = await deps.getEntity(id);
    if (entity) {
      await deps.addToCanvas(entity, canvas_source);
    }
  }

  // Restore children if requested
  const restoredChildren: EntityId[] = [];
  if (restore_children) {
    const children = await deps.getChildren(id);
    for (const child of children) {
      await deps.restoreFromArchive(child.id);
      restoredChildren.push(child.id);

      // Add child to canvas if requested
      if (add_to_canvas && deps.addToCanvas && canvas_source) {
        await deps.addToCanvas(child, canvas_source);
      }

      // Also restore grandchildren (tasks under stories)
      const grandchildren = await deps.getChildren(child.id);
      for (const grandchild of grandchildren) {
        await deps.restoreFromArchive(grandchild.id);
        restoredChildren.push(grandchild.id);

        // Add grandchild to canvas if requested
        if (add_to_canvas && deps.addToCanvas && canvas_source) {
          await deps.addToCanvas(grandchild, canvas_source);
        }
      }
    }
  }

  return {
    id,
    restored: true,
    restored_children: restoredChildren,
  };
}
