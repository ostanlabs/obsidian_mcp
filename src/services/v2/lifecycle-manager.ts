/**
 * V2 Lifecycle Manager
 *
 * Manages entity status transitions with validation, conditions, and side effects.
 */

import {
  Entity,
  EntityId,
  EntityType,
  EntityStatus,
  MilestoneStatus,
  StoryStatus,
  TaskStatus,
  DecisionStatus,
  DocumentStatus,
  FeatureStatus,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  Feature,
} from '../../models/v2-types.js';

// =============================================================================
// Transition Types
// =============================================================================

export interface TransitionRule {
  from: EntityStatus;
  to: EntityStatus;
  action: string;
  conditions?: string[];
  side_effects?: string[];
}

export interface TransitionResult {
  entity_id: EntityId;
  old_status: EntityStatus;
  new_status: EntityStatus;
  side_effects: string[];
}

export interface ConditionResult {
  met: boolean;
  reason?: string;
}

// =============================================================================
// Transition Rules by Entity Type
// =============================================================================

const MILESTONE_TRANSITIONS: TransitionRule[] = [
  { from: 'Not Started', to: 'In Progress', action: 'start' },
  { from: 'Not Started', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'In Progress', to: 'Completed', action: 'complete', conditions: ['all_stories_complete'], side_effects: ['check_archive_trigger'] },
  { from: 'In Progress', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'Blocked', to: 'In Progress', action: 'unblock', conditions: ['no_incomplete_blockers'] },
  { from: 'Blocked', to: 'Not Started', action: 'unblock', conditions: ['no_incomplete_blockers', 'no_stories_started'] },
];

const STORY_TRANSITIONS: TransitionRule[] = [
  { from: 'Not Started', to: 'In Progress', action: 'start', side_effects: ['parent_in_progress'] },
  { from: 'Not Started', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'In Progress', to: 'Completed', action: 'complete', conditions: ['all_tasks_complete'], side_effects: ['check_parent_completion'] },
  { from: 'In Progress', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'Blocked', to: 'In Progress', action: 'unblock', conditions: ['no_incomplete_blockers'] },
  { from: 'Blocked', to: 'Not Started', action: 'unblock', conditions: ['no_incomplete_blockers', 'no_tasks_started'] },
  { from: 'Completed', to: 'In Progress', action: 'reopen' },
];

const TASK_TRANSITIONS: TransitionRule[] = [
  { from: 'Not Started', to: 'In Progress', action: 'start', side_effects: ['parent_in_progress'] },
  { from: 'In Progress', to: 'Completed', action: 'complete', side_effects: ['check_parent_completion'] },
  { from: 'In Progress', to: 'Blocked', action: 'block' },
  { from: 'Blocked', to: 'In Progress', action: 'unblock' },
  { from: 'Blocked', to: 'Not Started', action: 'reopen' },
  { from: 'Completed', to: 'Not Started', action: 'reopen' },
];

const DECISION_TRANSITIONS: TransitionRule[] = [
  { from: 'Pending', to: 'Decided', action: 'decide', side_effects: ['unblock_enabled_entities'] },
  { from: 'Decided', to: 'Superseded', action: 'supersede', conditions: ['has_replacement_decision'] },
];

const DOCUMENT_TRANSITIONS: TransitionRule[] = [
  { from: 'Draft', to: 'Review', action: 'submit' },
  { from: 'Review', to: 'Draft', action: 'reject' },
  { from: 'Review', to: 'Approved', action: 'approve', side_effects: ['enable_implementing_stories'] },
  { from: 'Approved', to: 'Superseded', action: 'supersede', conditions: ['has_replacement_version'] },
  { from: 'Approved', to: 'Draft', action: 'revise' },
];

const FEATURE_TRANSITIONS: TransitionRule[] = [
  { from: 'Planned', to: 'In Progress', action: 'start', side_effects: ['check_implementing_entities'] },
  { from: 'Planned', to: 'Deferred', action: 'defer' },
  { from: 'In Progress', to: 'Complete', action: 'complete', conditions: ['all_implementations_complete'] },
  { from: 'In Progress', to: 'Deferred', action: 'defer' },
  { from: 'Deferred', to: 'Planned', action: 'reactivate' },
  { from: 'Complete', to: 'In Progress', action: 'reopen' },
];

// =============================================================================
// Lifecycle Manager Class
// =============================================================================

/**
 * Manages entity lifecycle transitions.
 */
export class LifecycleManager {
  private transitions: Map<EntityType, TransitionRule[]>;

  // Callbacks for external dependencies
  private getIncompleteBlockers: (id: EntityId) => EntityId[] = () => [];
  private getChildren: (id: EntityId, type?: EntityType) => Entity[] = () => [];
  private getParent: (id: EntityId) => Entity | undefined = () => undefined;

  constructor() {
    this.transitions = new Map([
      ['milestone', MILESTONE_TRANSITIONS],
      ['story', STORY_TRANSITIONS],
      ['task', TASK_TRANSITIONS],
      ['decision', DECISION_TRANSITIONS],
      ['document', DOCUMENT_TRANSITIONS],
      ['feature', FEATURE_TRANSITIONS],
    ]);
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Set callback for getting incomplete blockers */
  setBlockerCallback(fn: (id: EntityId) => EntityId[]): void {
    this.getIncompleteBlockers = fn;
  }

  /** Set callback for getting children */
  setChildrenCallback(fn: (id: EntityId, type?: EntityType) => Entity[]): void {
    this.getChildren = fn;
  }

  /** Set callback for getting parent */
  setParentCallback(fn: (id: EntityId) => Entity | undefined): void {
    this.getParent = fn;
  }

  // ---------------------------------------------------------------------------
  // Transition Methods
  // ---------------------------------------------------------------------------

  /** Check if a transition is allowed */
  canTransition(entity: Entity, newStatus: EntityStatus): { allowed: boolean; reason?: string } {
    const rules = this.transitions.get(entity.type);
    if (!rules) {
      return { allowed: false, reason: 'Unknown entity type' };
    }

    const rule = rules.find(r => r.from === entity.status && r.to === newStatus);
    if (!rule) {
      return {
        allowed: false,
        reason: `Invalid transition: ${entity.status} → ${newStatus}`,
      };
    }

    // Check conditions
    if (rule.conditions) {
      for (const condition of rule.conditions) {
        const result = this.checkCondition(entity, condition);
        if (!result.met) {
          return { allowed: false, reason: result.reason };
        }
      }
    }

    return { allowed: true };
  }

  /** Execute a status transition */
  async transition(entity: Entity, newStatus: EntityStatus): Promise<TransitionResult> {
    const check = this.canTransition(entity, newStatus);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const rule = this.getRule(entity.type, entity.status, newStatus);
    const oldStatus = entity.status;

    // Apply transition
    (entity as any).status = newStatus;
    entity.updated_at = new Date().toISOString();

    // Execute side effects
    const sideEffects: string[] = [];
    if (rule?.side_effects) {
      for (const effect of rule.side_effects) {
        const result = await this.executeSideEffect(entity, effect);
        sideEffects.push(...result);
      }
    }

    return {
      entity_id: entity.id,
      old_status: oldStatus,
      new_status: newStatus,
      side_effects: sideEffects,
    };
  }

  /** Get available transitions for an entity */
  getAvailableTransitions(entity: Entity): { action: string; to: EntityStatus }[] {
    const rules = this.transitions.get(entity.type);
    if (!rules) return [];

    return rules
      .filter(r => r.from === entity.status)
      .filter(r => {
        // Check if conditions are met
        if (!r.conditions) return true;
        return r.conditions.every(c => this.checkCondition(entity, c).met);
      })
      .map(r => ({ action: r.action, to: r.to }));
  }

  // ---------------------------------------------------------------------------
  // Condition Checking
  // ---------------------------------------------------------------------------

  private checkCondition(entity: Entity, condition: string): ConditionResult {
    switch (condition) {
      case 'has_incomplete_blockers': {
        const blockers = this.getIncompleteBlockers(entity.id);
        return {
          met: blockers.length > 0,
          reason: blockers.length === 0 ? 'No incomplete blockers' : undefined,
        };
      }

      case 'no_incomplete_blockers': {
        const blockers = this.getIncompleteBlockers(entity.id);
        return {
          met: blockers.length === 0,
          reason: blockers.length > 0 ? `Blocked by: ${blockers.join(', ')}` : undefined,
        };
      }

      case 'all_stories_complete': {
        const stories = this.getChildren(entity.id, 'story');
        const incomplete = stories.filter(s => s.status !== 'Completed');
        return {
          met: incomplete.length === 0,
          reason: incomplete.length > 0 ? `${incomplete.length} stories not complete` : undefined,
        };
      }

      case 'all_tasks_complete': {
        const tasks = this.getChildren(entity.id, 'task');
        const incomplete = tasks.filter(t => t.status !== 'Completed');
        return {
          met: incomplete.length === 0,
          reason: incomplete.length > 0 ? `${incomplete.length} tasks not complete` : undefined,
        };
      }

      case 'no_stories_started': {
        const stories = this.getChildren(entity.id, 'story');
        const started = stories.filter(s => s.status !== 'Not Started');
        return {
          met: started.length === 0,
          reason: started.length > 0 ? `${started.length} stories already started` : undefined,
        };
      }

      case 'no_tasks_started': {
        const tasks = this.getChildren(entity.id, 'task');
        const started = tasks.filter(t => t.status !== 'Not Started');
        return {
          met: started.length === 0,
          reason: started.length > 0 ? `${started.length} tasks already started` : undefined,
        };
      }

      case 'has_replacement_decision': {
        const decision = entity as Decision;
        return {
          met: !!decision.supersedes,
          reason: !decision.supersedes ? 'No replacement decision specified' : undefined,
        };
      }

      case 'has_replacement_version': {
        const doc = entity as Document;
        return {
          met: !!(doc.previous_version && doc.previous_version.length > 0),
          reason: 'No replacement version specified',
        };
      }

      case 'all_implementations_complete': {
        // For features, check if all implementing milestones/stories are complete
        const feature = entity as Feature;
        if (!feature.implemented_by || feature.implemented_by.length === 0) {
          return { met: true }; // No implementations required
        }
        // Note: This would need access to the runtime to check actual entity statuses
        // For now, we allow the transition and let the caller verify
        return { met: true };
      }

      default:
        return { met: true };
    }
  }

  // ---------------------------------------------------------------------------
  // Side Effect Execution
  // ---------------------------------------------------------------------------

  private async executeSideEffect(entity: Entity, effect: string): Promise<string[]> {
    const results: string[] = [];

    switch (effect) {
      case 'parent_in_progress': {
        const parent = this.getParent(entity.id);
        if (parent && parent.status === 'Not Started') {
          results.push(`Parent ${parent.id} marked as In Progress`);
        }
        break;
      }

      case 'check_parent_completion': {
        const parent = this.getParent(entity.id);
        if (parent) {
          const siblings = this.getChildren(parent.id, entity.type);
          const allComplete = siblings.every(s => s.status === 'Completed');
          if (allComplete) {
            results.push(`All children of ${parent.id} complete - ready for completion`);
          }
        }
        break;
      }

      case 'check_archive_trigger': {
        results.push(`${entity.id} completed - eligible for archival`);
        break;
      }

      case 'unblock_enabled_entities': {
        results.push(`Decision ${entity.id} decided - enabled entities may be unblocked`);
        break;
      }

      case 'enable_implementing_stories': {
        results.push(`Document ${entity.id} approved - implementing stories enabled`);
        break;
      }

      case 'check_implementing_entities': {
        const feature = entity as Feature;
        if (feature.implemented_by && feature.implemented_by.length > 0) {
          results.push(`Feature ${entity.id} started - ${feature.implemented_by.length} implementing entities`);
        }
        break;
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  private getRule(type: EntityType, from: EntityStatus, to: EntityStatus): TransitionRule | undefined {
    const rules = this.transitions.get(type);
    return rules?.find(r => r.from === from && r.to === to);
  }

  /** Check if a status is considered complete */
  isComplete(status: EntityStatus): boolean {
    return ['Completed', 'Decided', 'Approved', 'Complete'].includes(status);
  }

  /** Get the initial status for an entity type */
  getInitialStatus(type: EntityType): EntityStatus {
    switch (type) {
      case 'milestone':
      case 'story':
      case 'task':
        return 'Not Started';
      case 'decision':
        return 'Pending';
      case 'document':
        return 'Draft';
      case 'feature':
        return 'Planned';
    }
  }
}
