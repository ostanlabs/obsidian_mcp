/**
 * V2 Cascade Manager
 *
 * Handles cascade effects when entity status changes.
 * Propagates status changes up (to parents) and down (to children).
 */

import {
  Entity,
  EntityId,
  EntityType,
  EntityStatus,
} from '../../models/v2-types.js';

// =============================================================================
// Cascade Types
// =============================================================================

export interface CascadeRule {
  trigger_type: EntityType;
  trigger_status: EntityStatus;
  target_relation: 'parent' | 'children';
  target_type?: EntityType;
  action: CascadeAction;
  condition?: string;
}

export type CascadeAction =
  | 'set_in_progress'
  | 'check_completion'
  | 'notify_ready_for_archive'
  | 'recompute_progress'
  | 'check_blocked';

export interface CascadeResult {
  source_id: EntityId;
  affected_entities: EntityId[];
  actions_taken: string[];
}

// =============================================================================
// Cascade Rules
// =============================================================================

const CASCADE_RULES: CascadeRule[] = [
  // Task started → Story in progress
  {
    trigger_type: 'task',
    trigger_status: 'In Progress',
    target_relation: 'parent',
    target_type: 'story',
    action: 'set_in_progress',
    condition: 'parent_not_started',
  },
  // Task completed → Check story completion
  {
    trigger_type: 'task',
    trigger_status: 'Completed',
    target_relation: 'parent',
    target_type: 'story',
    action: 'check_completion',
  },
  // Story started → Milestone in progress
  {
    trigger_type: 'story',
    trigger_status: 'In Progress',
    target_relation: 'parent',
    target_type: 'milestone',
    action: 'set_in_progress',
    condition: 'parent_not_started',
  },
  // Story completed → Check milestone completion
  {
    trigger_type: 'story',
    trigger_status: 'Completed',
    target_relation: 'parent',
    target_type: 'milestone',
    action: 'check_completion',
  },
  // Milestone completed → Notify ready for archive
  {
    trigger_type: 'milestone',
    trigger_status: 'Completed',
    target_relation: 'children',
    target_type: 'story',
    action: 'notify_ready_for_archive',
  },
  // Any status change → Recompute progress
  {
    trigger_type: 'task',
    trigger_status: 'Completed',
    target_relation: 'parent',
    action: 'recompute_progress',
  },
  {
    trigger_type: 'story',
    trigger_status: 'Completed',
    target_relation: 'parent',
    action: 'recompute_progress',
  },
];

// =============================================================================
// Cascade Manager Class
// =============================================================================

/**
 * Manages cascade effects when entity status changes.
 */
export class CascadeManager {
  // Callbacks for external dependencies
  private getEntity: (id: EntityId) => Entity | undefined = () => undefined;
  private getParent: (id: EntityId) => Entity | undefined = () => undefined;
  private getChildren: (id: EntityId, type?: EntityType) => Entity[] = () => [];
  private updateEntity: (entity: Entity) => Promise<void> = async () => {};

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setEntityCallback(fn: (id: EntityId) => Entity | undefined): void {
    this.getEntity = fn;
  }

  setParentCallback(fn: (id: EntityId) => Entity | undefined): void {
    this.getParent = fn;
  }

  setChildrenCallback(fn: (id: EntityId, type?: EntityType) => Entity[]): void {
    this.getChildren = fn;
  }

  setUpdateCallback(fn: (entity: Entity) => Promise<void>): void {
    this.updateEntity = fn;
  }

  // ---------------------------------------------------------------------------
  // Cascade Execution
  // ---------------------------------------------------------------------------

  /** Handle status change and apply cascade effects */
  async handleStatusChange(
    entity: Entity,
    oldStatus: EntityStatus,
    newStatus: EntityStatus
  ): Promise<CascadeResult> {
    const result: CascadeResult = {
      source_id: entity.id,
      affected_entities: [],
      actions_taken: [],
    };

    // Find applicable rules
    const rules = CASCADE_RULES.filter(
      r => r.trigger_type === entity.type && r.trigger_status === newStatus
    );

    for (const rule of rules) {
      const cascadeResult = await this.applyRule(entity, rule);
      result.affected_entities.push(...cascadeResult.affected);
      result.actions_taken.push(...cascadeResult.actions);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Rule Application
  // ---------------------------------------------------------------------------

  private async applyRule(
    entity: Entity,
    rule: CascadeRule
  ): Promise<{ affected: EntityId[]; actions: string[] }> {
    const affected: EntityId[] = [];
    const actions: string[] = [];

    // Get target entities
    const targets =
      rule.target_relation === 'parent'
        ? [this.getParent(entity.id)].filter((e): e is Entity => !!e)
        : this.getChildren(entity.id, rule.target_type);

    for (const target of targets) {
      // Check condition
      if (rule.condition && !this.checkCondition(target, rule.condition)) {
        continue;
      }

      // Apply action
      const actionResult = await this.applyAction(target, rule.action);
      if (actionResult.applied) {
        affected.push(target.id);
        actions.push(actionResult.description);
      }
    }

    return { affected, actions };
  }

  private checkCondition(entity: Entity, condition: string): boolean {
    switch (condition) {
      case 'parent_not_started':
        return entity.status === 'Not Started';
      case 'all_children_complete':
        const children = this.getChildren(entity.id);
        return children.every(c => c.status === 'Completed');
      default:
        return true;
    }
  }

  private async applyAction(
    entity: Entity,
    action: CascadeAction
  ): Promise<{ applied: boolean; description: string }> {
    switch (action) {
      case 'set_in_progress': {
        if (entity.status === 'Not Started') {
          (entity as any).status = 'In Progress';
          entity.updated_at = new Date().toISOString();
          await this.updateEntity(entity);
          return { applied: true, description: `${entity.id} set to In Progress` };
        }
        return { applied: false, description: '' };
      }

      case 'check_completion': {
        const children = this.getChildren(entity.id);
        const allComplete = children.every(c => c.status === 'Completed');
        if (allComplete && children.length > 0) {
          return {
            applied: true,
            description: `${entity.id} ready for completion (all children complete)`,
          };
        }
        return { applied: false, description: '' };
      }

      case 'notify_ready_for_archive': {
        return {
          applied: true,
          description: `${entity.id} ready for archive`,
        };
      }

      case 'recompute_progress': {
        const progress = this.computeProgress(entity);
        return {
          applied: true,
          description: `${entity.id} progress: ${progress}%`,
        };
      }

      case 'check_blocked': {
        return { applied: false, description: '' };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Progress Computation
  // ---------------------------------------------------------------------------

  /** Compute progress percentage for an entity */
  computeProgress(entity: Entity): number {
    const children = this.getChildren(entity.id);
    if (children.length === 0) return 0;

    const completed = children.filter(c => c.status === 'Completed').length;

    return Math.round((completed / children.length) * 100);
  }

  /** Compute task progress for a story */
  computeTaskProgress(storyId: EntityId): { total: number; completed: number; percentage: number } {
    const tasks = this.getChildren(storyId, 'task');
    const completed = tasks.filter(t => t.status === 'Completed').length;
    return {
      total: tasks.length,
      completed,
      percentage: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
    };
  }

  /** Compute story progress for a milestone */
  computeStoryProgress(milestoneId: EntityId): { total: number; completed: number; percentage: number } {
    const stories = this.getChildren(milestoneId, 'story');
    const completed = stories.filter(s => s.status === 'Completed').length;
    return {
      total: stories.length,
      completed,
      percentage: stories.length > 0 ? Math.round((completed / stories.length) * 100) : 0,
    };
  }
}
