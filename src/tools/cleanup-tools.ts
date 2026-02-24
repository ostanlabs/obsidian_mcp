/**
 * Cleanup Tools
 *
 * Category 8: Cleanup Operations
 * - cleanup_completed: Archive completed stories/tasks under completed milestones
 */

import type {
  Entity,
  EntityId,
  EntityType,
  Milestone,
  MilestoneId,
  Story,
  Task,
  Decision,
  Document,
  CanvasPath,
} from '../models/v2-types.js';

import type {
  CleanupCompletedInput,
  CleanupCompletedOutput,
  BlockedItem,
  CleanupSummary,
  EntityStatus,
} from './tool-types.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for cleanup tools.
 */
export interface CleanupDependencies {
  /** Get all entities with optional filters */
  getAllEntities: (options?: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    types?: EntityType[];
  }) => Promise<Entity[]>;

  /** Get entity by ID */
  getEntity: (id: EntityId) => Promise<Entity | null>;

  /** Get children of an entity */
  getChildren: (id: EntityId) => Promise<Entity[]>;

  /** Update entity status */
  updateEntityStatus: (id: EntityId, status: EntityStatus) => Promise<void>;

  /** Write entity to disk */
  writeEntity: (entity: Entity) => Promise<void>;

  /** Move entity to archive */
  moveToArchive: (id: EntityId, archivePath?: string) => Promise<string>;

  /** Remove node from canvas */
  removeFromCanvas: (id: EntityId, canvasPath: CanvasPath) => Promise<boolean>;

  /** Get default canvas path */
  getDefaultCanvasPath: () => CanvasPath;

  /** Get current timestamp */
  getCurrentTimestamp: () => string;
}

/** Info about an entity being archived and its milestone for re-linking */
interface ArchiveInfo {
  entity: Entity;
  milestoneId: MilestoneId;
}

// =============================================================================
// Cleanup Completed Tool
// =============================================================================

/**
 * Clean up completed stories/tasks under completed milestones:
 * 1. Find completed milestones and their stories/tasks
 * 2. Mark non-completed stories/tasks as completed (unless blocked)
 * 3. Re-link any decisions/documents from stories/tasks to the milestone
 * 4. Archive stories/tasks (NOT milestones)
 * 5. Remove archived items from the default canvas
 *
 * Milestones, decisions, and documents are NOT archived.
 */
export async function cleanupCompleted(
  input: CleanupCompletedInput,
  deps: CleanupDependencies
): Promise<CleanupCompletedOutput> {
  const { milestone_id, confirmed_blockers = [], dry_run = false } = input;

  // Step 1: Find completed milestones
  const allMilestones = await deps.getAllEntities({
    includeCompleted: true,
    includeArchived: false,
    types: ['milestone'],
  });

  let completedMilestones = allMilestones.filter(
    (e): e is Milestone => e.type === 'milestone' && e.status === 'Completed'
  );

  // If specific milestone_id provided, filter to just that one
  if (milestone_id) {
    completedMilestones = completedMilestones.filter(m => m.id === milestone_id);
    if (completedMilestones.length === 0) {
      const milestone = await deps.getEntity(milestone_id);
      if (!milestone) {
        throw new Error(`Milestone not found: ${milestone_id}`);
      }
      if (milestone.status !== 'Completed') {
        throw new Error(`Milestone ${milestone_id} is not completed (status: ${milestone.status})`);
      }
    }
  }

  // Step 2: Collect all stories and tasks under completed milestones
  // Track which milestone each entity belongs to for re-linking
  const blockedItems: BlockedItem[] = [];
  const entitiesToComplete: Entity[] = [];
  const entitiesToArchive: ArchiveInfo[] = [];
  const processedIds = new Set<EntityId>();

  for (const milestone of completedMilestones) {
    // Don't archive milestones - just track that we processed it
    processedIds.add(milestone.id);

    const stories = await deps.getChildren(milestone.id);
    for (const story of stories) {
      if (story.type !== 'story') continue;
      const storyEntity = story as Story;
      processedIds.add(storyEntity.id);

      // Check if story is blocked
      if (storyEntity.status === 'Blocked' && !confirmed_blockers.includes(storyEntity.id)) {
        blockedItems.push({
          id: storyEntity.id,
          type: 'story',
          title: storyEntity.title,
          parent_id: milestone.id,
          parent_title: milestone.title,
          blocked_by: storyEntity.depends_on?.join(', '),
        });
        continue;
      }

      // Mark for completion if not already completed
      if (storyEntity.status !== 'Completed') {
        entitiesToComplete.push(storyEntity);
      }
      entitiesToArchive.push({ entity: storyEntity, milestoneId: milestone.id });

      // Get tasks under this story
      const tasks = await deps.getChildren(storyEntity.id);
      for (const task of tasks) {
        if (task.type !== 'task') continue;
        const taskEntity = task as Task;
        processedIds.add(taskEntity.id);

        // Check if task is blocked
        if (taskEntity.status === 'Blocked' && !confirmed_blockers.includes(taskEntity.id)) {
          blockedItems.push({
            id: taskEntity.id,
            type: 'task',
            title: taskEntity.title,
            parent_id: storyEntity.id,
            parent_title: storyEntity.title,
            blocked_by: taskEntity.depends_on?.join(', '),
          });
          continue;
        }

        // Mark for completion if not already completed
        if (taskEntity.status !== 'Completed') {
          entitiesToComplete.push(taskEntity);
        }
        // Tasks inherit the milestone from their parent story
        entitiesToArchive.push({ entity: taskEntity, milestoneId: milestone.id });
      }
    }
  }

  // Step 3: Find orphaned completed stories and tasks (not under any milestone we processed)
  // Only do this if we're not targeting a specific milestone
  if (!milestone_id) {
    const allStoriesAndTasks = await deps.getAllEntities({
      includeCompleted: true,
      includeArchived: false,
      types: ['story', 'task'],
    });

    for (const entity of allStoriesAndTasks) {
      // Skip if already processed
      if (processedIds.has(entity.id)) continue;

      // Only archive if completed
      if (entity.status !== 'Completed') continue;

      // Check if orphaned (no parent or parent doesn't exist)
      const parentId = (entity as Story | Task).parent;
      const isOrphaned = !parentId || !(await deps.getEntity(parentId));

      if (isOrphaned) {
        // Orphaned entities have no milestone to re-link to
        entitiesToArchive.push({ entity, milestoneId: '' as MilestoneId });
        processedIds.add(entity.id);
      }
    }
  }

  // If no entities to archive, return empty summary
  if (entitiesToArchive.length === 0) {
    return {
      summary: {
        completed: { stories: 0, tasks: 0 },
        archived: { stories: 0, tasks: 0 },
        relinked: { decisions: 0, documents: 0 },
        removed_from_canvas: 0,
        dry_run,
      },
    };
  }

  // Step 4: If there are blocked items not in confirmed_blockers, return for confirmation
  if (blockedItems.length > 0) {
    return {
      requires_confirmation: {
        blocked_items: blockedItems,
        message: `Found ${blockedItems.length} blocked item(s) under completed milestone(s). Please confirm these blockers are resolved by calling again with confirmed_blockers containing their IDs.`,
      },
    };
  }

  // Step 5: Find decisions and documents that need re-linking
  // Get all decisions and documents to check their relationships
  const allDecisions = await deps.getAllEntities({
    includeCompleted: true,
    includeArchived: false,
    types: ['decision'],
  });
  const allDocuments = await deps.getAllEntities({
    includeCompleted: true,
    includeArchived: false,
    types: ['document'],
  });

  // Build a map of entity ID -> milestone ID for re-linking
  const entityToMilestone = new Map<EntityId, MilestoneId>();
  for (const info of entitiesToArchive) {
    if (info.milestoneId) {
      entityToMilestone.set(info.entity.id, info.milestoneId);
    }
  }

  // Find decisions that affect entities being archived
  const decisionsToRelink: { decision: Decision; newAffects: EntityId[] }[] = [];
  for (const entity of allDecisions) {
    const decision = entity as Decision;
    if (!decision.affects || decision.affects.length === 0) continue;

    const newAffects: EntityId[] = [];
    let needsUpdate = false;

    for (const affectedId of decision.affects) {
      const milestoneId = entityToMilestone.get(affectedId);
      if (milestoneId) {
        // This affected entity is being archived - re-link to milestone
        if (!newAffects.includes(milestoneId)) {
          newAffects.push(milestoneId);
        }
        needsUpdate = true;
      } else {
        // Keep the existing reference
        newAffects.push(affectedId);
      }
    }

    if (needsUpdate) {
      decisionsToRelink.push({ decision, newAffects });
    }
  }

  // Find documents that are implemented_by entities being archived
  const documentsToRelink: { document: Document; newImplementedBy: EntityId[] }[] = [];
  for (const entity of allDocuments) {
    const document = entity as Document;
    if (!document.implemented_by || document.implemented_by.length === 0) continue;

    const newImplementedBy: EntityId[] = [];
    let needsUpdate = false;

    for (const implementerId of document.implemented_by) {
      const milestoneId = entityToMilestone.get(implementerId);
      if (milestoneId) {
        // This implementer is being archived - re-link to milestone
        if (!newImplementedBy.includes(milestoneId)) {
          newImplementedBy.push(milestoneId);
        }
        needsUpdate = true;
      } else {
        // Keep the existing reference
        newImplementedBy.push(implementerId);
      }
    }

    if (needsUpdate) {
      documentsToRelink.push({ document, newImplementedBy });
    }
  }

  // Step 6: If dry_run, return what would happen
  if (dry_run) {
    const summary: CleanupSummary = {
      completed: {
        stories: entitiesToComplete.filter(e => e.type === 'story').length,
        tasks: entitiesToComplete.filter(e => e.type === 'task').length,
      },
      archived: {
        stories: entitiesToArchive.filter(i => i.entity.type === 'story').length,
        tasks: entitiesToArchive.filter(i => i.entity.type === 'task').length,
      },
      relinked: {
        decisions: decisionsToRelink.length,
        documents: documentsToRelink.length,
      },
      removed_from_canvas: entitiesToArchive.length,
      dry_run: true,
    };
    return { summary };
  }

  // Step 7: Execute the cleanup
  const timestamp = deps.getCurrentTimestamp();
  const defaultCanvas = deps.getDefaultCanvasPath();
  let removedFromCanvas = 0;

  // Complete entities that need completion
  for (const entity of entitiesToComplete) {
    entity.status = 'Completed' as any;
    entity.updated_at = timestamp as any;
    await deps.writeEntity(entity);
  }

  // Re-link decisions to milestones
  for (const { decision, newAffects } of decisionsToRelink) {
    decision.affects = newAffects;
    decision.updated_at = timestamp as any;
    await deps.writeEntity(decision);
  }

  // Re-link documents to milestones
  for (const { document, newImplementedBy } of documentsToRelink) {
    document.implemented_by = newImplementedBy as any;
    document.updated_at = timestamp as any;
    await deps.writeEntity(document);
  }

  // Archive stories/tasks (tasks first, then stories)
  const sortedForArchive = [
    ...entitiesToArchive.filter(i => i.entity.type === 'task'),
    ...entitiesToArchive.filter(i => i.entity.type === 'story'),
  ];

  for (const { entity } of sortedForArchive) {
    await deps.moveToArchive(entity.id);
    const removed = await deps.removeFromCanvas(entity.id, defaultCanvas);
    if (removed) removedFromCanvas++;
  }

  // Build summary
  const summary: CleanupSummary = {
    completed: {
      stories: entitiesToComplete.filter(e => e.type === 'story').length,
      tasks: entitiesToComplete.filter(e => e.type === 'task').length,
    },
    archived: {
      stories: entitiesToArchive.filter(i => i.entity.type === 'story').length,
      tasks: entitiesToArchive.filter(i => i.entity.type === 'task').length,
    },
    relinked: {
      decisions: decisionsToRelink.length,
      documents: documentsToRelink.length,
    },
    removed_from_canvas: removedFromCanvas,
    dry_run: false,
  };

  return { summary };
}
