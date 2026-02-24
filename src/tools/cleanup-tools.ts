/**
 * Cleanup Tools
 *
 * Category 8: Cleanup Operations
 * - cleanup_completed: Archive completed milestones and their stories/tasks
 */

import type {
  Entity,
  EntityId,
  EntityType,
  Milestone,
  Story,
  Task,
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

// =============================================================================
// Cleanup Completed Tool
// =============================================================================

/**
 * Clean up completed milestones by:
 * 1. Marking their stories/tasks as completed (unless blocked)
 * 2. Archiving all completed milestones, stories, tasks
 * 3. Removing archived items from the default canvas
 */
export async function cleanupCompleted(
  input: CleanupCompletedInput,
  deps: CleanupDependencies
): Promise<CleanupCompletedOutput> {
  const { milestone_id, confirmed_blockers = [], dry_run = false } = input;

  // Step 1: Find completed milestones
  const allEntities = await deps.getAllEntities({
    includeCompleted: true,
    includeArchived: false,
    types: ['milestone'],
  });

  let completedMilestones = allEntities.filter(
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

  if (completedMilestones.length === 0) {
    return {
      summary: {
        completed: { milestones: 0, stories: 0, tasks: 0 },
        archived: { milestones: 0, stories: 0, tasks: 0 },
        removed_from_canvas: 0,
        dry_run,
      },
    };
  }

  // Step 2: Collect all stories and tasks under completed milestones
  const blockedItems: BlockedItem[] = [];
  const entitiesToComplete: Entity[] = [];
  const entitiesToArchive: Entity[] = [];

  for (const milestone of completedMilestones) {
    entitiesToArchive.push(milestone);

    const stories = await deps.getChildren(milestone.id);
    for (const story of stories) {
      if (story.type !== 'story') continue;
      const storyEntity = story as Story;

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
      entitiesToArchive.push(storyEntity);

      // Get tasks under this story
      const tasks = await deps.getChildren(storyEntity.id);
      for (const task of tasks) {
        if (task.type !== 'task') continue;
        const taskEntity = task as Task;

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
        entitiesToArchive.push(taskEntity);
      }
    }
  }

  // Step 3: If there are blocked items not in confirmed_blockers, return for confirmation
  if (blockedItems.length > 0) {
    return {
      requires_confirmation: {
        blocked_items: blockedItems,
        message: `Found ${blockedItems.length} blocked item(s) under completed milestone(s). Please confirm these blockers are resolved by calling again with confirmed_blockers containing their IDs.`,
      },
    };
  }

  // Step 4: If dry_run, return what would happen
  if (dry_run) {
    const summary: CleanupSummary = {
      completed: {
        milestones: 0,
        stories: entitiesToComplete.filter(e => e.type === 'story').length,
        tasks: entitiesToComplete.filter(e => e.type === 'task').length,
      },
      archived: {
        milestones: entitiesToArchive.filter(e => e.type === 'milestone').length,
        stories: entitiesToArchive.filter(e => e.type === 'story').length,
        tasks: entitiesToArchive.filter(e => e.type === 'task').length,
      },
      removed_from_canvas: entitiesToArchive.length,
      dry_run: true,
    };
    return { summary };
  }

  // Step 5: Execute the cleanup
  const timestamp = deps.getCurrentTimestamp();
  const defaultCanvas = deps.getDefaultCanvasPath();
  let removedFromCanvas = 0;

  // Complete entities that need completion
  for (const entity of entitiesToComplete) {
    entity.status = 'Completed' as any;
    entity.updated_at = timestamp as any;
    await deps.writeEntity(entity);
  }

  // Archive all entities (tasks first, then stories, then milestones)
  const sortedForArchive = [
    ...entitiesToArchive.filter(e => e.type === 'task'),
    ...entitiesToArchive.filter(e => e.type === 'story'),
    ...entitiesToArchive.filter(e => e.type === 'milestone'),
  ];

  for (const entity of sortedForArchive) {
    await deps.moveToArchive(entity.id);
    const removed = await deps.removeFromCanvas(entity.id, defaultCanvas);
    if (removed) removedFromCanvas++;
  }

  // Build summary
  const summary: CleanupSummary = {
    completed: {
      milestones: 0,
      stories: entitiesToComplete.filter(e => e.type === 'story').length,
      tasks: entitiesToComplete.filter(e => e.type === 'task').length,
    },
    archived: {
      milestones: entitiesToArchive.filter(e => e.type === 'milestone').length,
      stories: entitiesToArchive.filter(e => e.type === 'story').length,
      tasks: entitiesToArchive.filter(e => e.type === 'task').length,
    },
    removed_from_canvas: removedFromCanvas,
    dry_run: false,
  };

  return { summary };
}
