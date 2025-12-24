/**
 * V2 Progress Computer
 *
 * Computes progress metrics for entities based on their children's status.
 */

import {
  Entity,
  EntityId,
  EntityType,
  Milestone,
  Story,
  Task,
} from '../../models/v2-types.js';

// =============================================================================
// Progress Types
// =============================================================================

export interface ProgressMetrics {
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  blocked: number;
  percentage: number;
}

export interface EntityProgress {
  entity_id: EntityId;
  entity_type: EntityType;
  direct_progress: ProgressMetrics;
  nested_progress?: ProgressMetrics;
}

// =============================================================================
// Progress Computer Class
// =============================================================================

/**
 * Computes progress metrics for entities.
 */
export class ProgressComputer {
  // Callbacks for external dependencies
  private getEntity: (id: EntityId) => Entity | undefined = () => undefined;
  private getChildren: (id: EntityId, type?: EntityType) => Entity[] = () => [];

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setEntityCallback(fn: (id: EntityId) => Entity | undefined): void {
    this.getEntity = fn;
  }

  setChildrenCallback(fn: (id: EntityId, type?: EntityType) => Entity[]): void {
    this.getChildren = fn;
  }

  // ---------------------------------------------------------------------------
  // Progress Computation
  // ---------------------------------------------------------------------------

  /** Compute progress for any entity */
  computeProgress(entityId: EntityId): EntityProgress | undefined {
    const entity = this.getEntity(entityId);
    if (!entity) return undefined;

    switch (entity.type) {
      case 'milestone':
        return this.computeMilestoneProgress(entityId);
      case 'story':
        return this.computeStoryProgress(entityId);
      default:
        return {
          entity_id: entityId,
          entity_type: entity.type,
          direct_progress: this.emptyMetrics(),
        };
    }
  }

  /** Compute progress for a milestone (stories and nested tasks) */
  computeMilestoneProgress(milestoneId: EntityId): EntityProgress {
    const stories = this.getChildren(milestoneId, 'story');
    const directProgress = this.computeMetrics(stories);

    // Compute nested task progress across all stories
    let totalTasks = 0;
    let completedTasks = 0;
    let inProgressTasks = 0;
    let notStartedTasks = 0;
    let blockedTasks = 0;

    for (const story of stories) {
      const tasks = this.getChildren(story.id, 'task');
      totalTasks += tasks.length;
      for (const task of tasks) {
        switch (task.status) {
          case 'Completed':
            completedTasks++;
            break;
          case 'In Progress':
            inProgressTasks++;
            break;
          case 'Not Started':
            notStartedTasks++;
            break;
          case 'Blocked':
            blockedTasks++;
            break;
        }
      }
    }

    const nestedProgress: ProgressMetrics = {
      total: totalTasks,
      completed: completedTasks,
      in_progress: inProgressTasks,
      not_started: notStartedTasks,
      blocked: blockedTasks,
      percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };

    return {
      entity_id: milestoneId,
      entity_type: 'milestone',
      direct_progress: directProgress,
      nested_progress: nestedProgress,
    };
  }

  /** Compute progress for a story (tasks) */
  computeStoryProgress(storyId: EntityId): EntityProgress {
    const tasks = this.getChildren(storyId, 'task');
    const directProgress = this.computeTaskMetrics(tasks);

    return {
      entity_id: storyId,
      entity_type: 'story',
      direct_progress: directProgress,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /** Compute metrics for a list of entities (stories) */
  private computeMetrics(entities: Entity[]): ProgressMetrics {
    const metrics: ProgressMetrics = {
      total: entities.length,
      completed: 0,
      in_progress: 0,
      not_started: 0,
      blocked: 0,
      percentage: 0,
    };

    for (const entity of entities) {
      switch (entity.status) {
        case 'Completed':
          metrics.completed++;
          break;
        case 'In Progress':
          metrics.in_progress++;
          break;
        case 'Not Started':
          metrics.not_started++;
          break;
        case 'Blocked':
          metrics.blocked++;
          break;
      }
    }

    metrics.percentage = metrics.total > 0
      ? Math.round((metrics.completed / metrics.total) * 100)
      : 0;

    return metrics;
  }

  /** Compute metrics for a list of tasks */
  private computeTaskMetrics(tasks: Entity[]): ProgressMetrics {
    const metrics: ProgressMetrics = {
      total: tasks.length,
      completed: 0,
      in_progress: 0,
      not_started: 0,
      blocked: 0,
      percentage: 0,
    };

    for (const task of tasks) {
      switch (task.status) {
        case 'Completed':
          metrics.completed++;
          break;
        case 'In Progress':
          metrics.in_progress++;
          break;
        case 'Not Started':
          metrics.not_started++;
          break;
        case 'Blocked':
          metrics.blocked++;
          break;
      }
    }

    metrics.percentage = metrics.total > 0
      ? Math.round((metrics.completed / metrics.total) * 100)
      : 0;

    return metrics;
  }

  /** Return empty metrics */
  private emptyMetrics(): ProgressMetrics {
    return {
      total: 0,
      completed: 0,
      in_progress: 0,
      not_started: 0,
      blocked: 0,
      percentage: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /** Check if an entity is complete based on its type */
  isComplete(entity: Entity): boolean {
    switch (entity.type) {
      case 'milestone':
      case 'story':
      case 'task':
        return entity.status === 'Completed';
      case 'decision':
        return entity.status === 'Decided' || entity.status === 'Superseded';
      case 'document':
        return entity.status === 'Approved' || entity.status === 'Superseded';
    }
  }

  /** Get completion percentage as a formatted string */
  formatProgress(progress: ProgressMetrics): string {
    return `${progress.completed}/${progress.total} (${progress.percentage}%)`;
  }
}

