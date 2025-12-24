/**
 * Project Understanding Tools
 *
 * Category 3: Project Understanding
 * - get_project_overview: High-level project status
 * - get_workstream_status: Workstream-specific status
 * - analyze_project_state: Deep analysis with blockers and suggestions
 */

import type {
  Entity,
  EntityId,
  EntityType,
} from '../models/v2-types.js';

import type {
  GetProjectOverviewInput,
  GetProjectOverviewOutput,
  GetWorkstreamStatusInput,
  GetWorkstreamStatusOutput,
  AnalyzeProjectStateInput,
  AnalyzeProjectStateOutput,
  EntitySummary,
  Workstream,
  EntityStatus,
} from './tool-types.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for project understanding tools.
 */
export interface ProjectUnderstandingDependencies {
  /** Get all entities, optionally filtered */
  getAllEntities: (options?: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    workstream?: Workstream;
    types?: EntityType[];
  }) => Promise<Entity[]>;

  /** Convert entity to summary */
  toEntitySummary: (entity: Entity) => EntitySummary;

  /** Get entities blocking a given entity */
  getBlockers: (id: EntityId) => Promise<Entity[]>;

  /** Get entities blocked by a given entity */
  getBlockedBy: (id: EntityId) => Promise<Entity[]>;

  /** Get entity update timestamp */
  getLastUpdated: (entity: Entity) => Date;
}

// =============================================================================
// Get Project Overview
// =============================================================================

/**
 * Get high-level project status across all workstreams.
 * Enhanced to support workstream filtering and grouping (consolidates get_workstream_status).
 */
export async function getProjectOverview(
  input: GetProjectOverviewInput,
  deps: ProjectUnderstandingDependencies
): Promise<GetProjectOverviewOutput> {
  const { include_completed, include_archived, workstream: filterWorkstream, group_by } = input;

  // Get all entities (optionally filtered by workstream)
  const entities = await deps.getAllEntities({
    includeCompleted: include_completed,
    includeArchived: include_archived,
    workstream: filterWorkstream,
  });

  // Initialize counters
  const summary = {
    milestones: { total: 0, completed: 0, in_progress: 0, blocked: 0 },
    stories: { total: 0, completed: 0, in_progress: 0, blocked: 0 },
    tasks: { total: 0, completed: 0, in_progress: 0, blocked: 0 },
    decisions: { total: 0, pending: 0, decided: 0 },
    documents: { total: 0, draft: 0, approved: 0 },
  };

  const workstreams: GetProjectOverviewOutput['workstreams'] = {};
  let pendingDecisions = 0;
  let readyForImplementation = 0;

  // Process entities
  for (const entity of entities) {
    // Update type-specific counters
    switch (entity.type) {
      case 'milestone':
        summary.milestones.total++;
        if (entity.status === 'Completed') summary.milestones.completed++;
        else if (entity.status === 'In Progress') summary.milestones.in_progress++;
        else if (entity.status === 'Blocked') summary.milestones.blocked++;
        break;
      case 'story':
        summary.stories.total++;
        if (entity.status === 'Completed') summary.stories.completed++;
        else if (entity.status === 'In Progress') summary.stories.in_progress++;
        else if (entity.status === 'Blocked') summary.stories.blocked++;
        break;
      case 'task':
        summary.tasks.total++;
        if (entity.status === 'Completed') summary.tasks.completed++;
        else if (entity.status === 'In Progress') summary.tasks.in_progress++;
        else if (entity.status === 'Blocked') summary.tasks.blocked++;
        break;
      case 'decision':
        summary.decisions.total++;
        if (entity.status === 'Pending') {
          summary.decisions.pending++;
          pendingDecisions++;
        } else if (entity.status === 'Decided') {
          summary.decisions.decided++;
        }
        break;
      case 'document':
        summary.documents.total++;
        if (entity.status === 'Draft') summary.documents.draft++;
        else if (entity.status === 'Approved') {
          summary.documents.approved++;
          readyForImplementation++;
        }
        break;
    }

    // Update workstream stats
    const ws = entity.workstream;
    if (!workstreams[ws]) {
      workstreams[ws] = { health: 'healthy', progress_percent: 0, blocked_count: 0 };
    }
    if (entity.status === 'Blocked') {
      workstreams[ws].blocked_count++;
    }
  }

  // Calculate workstream health and progress
  for (const ws of Object.keys(workstreams)) {
    const wsEntities = entities.filter((e) => e.workstream === ws);
    const completed = wsEntities.filter((e) =>
      e.status === 'Completed' || e.status === 'Decided' || e.status === 'Approved'
    ).length;
    workstreams[ws].progress_percent = wsEntities.length > 0
      ? Math.round((completed / wsEntities.length) * 100)
      : 0;
    workstreams[ws].health = workstreams[ws].blocked_count > 2
      ? 'blocked'
      : workstreams[ws].blocked_count > 0
        ? 'at_risk'
        : 'healthy';
  }

  const result: GetProjectOverviewOutput = {
    summary,
    workstreams,
    pending_decisions: pendingDecisions,
    ready_for_implementation: readyForImplementation,
  };

  // If workstream filter is specified, add detailed workstream info
  if (filterWorkstream) {
    result.workstream_detail = await buildWorkstreamDetail(
      filterWorkstream,
      entities,
      group_by || 'status',
      deps
    );
  }

  return result;
}

/**
 * Build detailed workstream information (extracted from getWorkstreamStatus).
 */
async function buildWorkstreamDetail(
  workstream: string,
  entities: Entity[],
  group_by: 'status' | 'type' | 'priority',
  deps: ProjectUnderstandingDependencies
): Promise<GetProjectOverviewOutput['workstream_detail']> {
  // Build summary
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let blockedCount = 0;
  let crossWorkstreamDeps = 0;

  for (const entity of entities) {
    // Count by status
    byStatus[entity.status] = (byStatus[entity.status] || 0) + 1;

    // Count by type
    byType[entity.type] = (byType[entity.type] || 0) + 1;

    // Count blocked
    if (entity.status === 'Blocked') {
      blockedCount++;
    }

    // Check for cross-workstream dependencies
    const blockers = await deps.getBlockers(entity.id);
    for (const blocker of blockers) {
      if (blocker.workstream !== workstream) {
        crossWorkstreamDeps++;
      }
    }
  }

  // Group entities
  const groupMap = new Map<string, EntitySummary[]>();
  for (const entity of entities) {
    let key: string;
    switch (group_by) {
      case 'type':
        key = entity.type;
        break;
      case 'priority':
        key = (entity as { priority?: string }).priority || 'none';
        break;
      default:
        key = entity.status;
    }
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(deps.toEntitySummary(entity));
  }

  const groups = Array.from(groupMap.entries()).map(([group_key, entities]) => ({
    group_key,
    entities,
  }));

  // Find cross-workstream blocking relationships
  const blockingOther: EntitySummary[] = [];
  const blockedByOther: EntitySummary[] = [];

  for (const entity of entities) {
    const blockedBy = await deps.getBlockedBy(entity.id);
    for (const blocked of blockedBy) {
      if (blocked.workstream !== workstream) {
        blockingOther.push(deps.toEntitySummary(entity));
        break;
      }
    }

    const blockers = await deps.getBlockers(entity.id);
    for (const blocker of blockers) {
      if (blocker.workstream !== workstream) {
        blockedByOther.push(deps.toEntitySummary(entity));
        break;
      }
    }
  }

  return {
    workstream,
    summary: {
      total: entities.length,
      by_status: byStatus,
      by_type: byType,
      blocked_count: blockedCount,
      cross_workstream_dependencies: crossWorkstreamDeps,
    },
    groups,
    blocking_other_workstreams: blockingOther,
    blocked_by_other_workstreams: blockedByOther,
  };
}

// =============================================================================
// Get Workstream Status (DEPRECATED)
// =============================================================================

/**
 * Get detailed status for a specific workstream.
 *
 * @deprecated Use `getProjectOverview` with `workstream` filter instead.
 * Example: `getProjectOverview({ workstream: 'auth', group_by: 'status' })`
 */
export async function getWorkstreamStatus(
  input: GetWorkstreamStatusInput,
  deps: ProjectUnderstandingDependencies
): Promise<GetWorkstreamStatusOutput> {
  const { workstream, include_completed, group_by = 'status' } = input;

  // Get entities for this workstream
  const entities = await deps.getAllEntities({
    workstream,
    includeCompleted: include_completed,
  });

  // Build summary
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let blockedCount = 0;
  let crossWorkstreamDeps = 0;

  for (const entity of entities) {
    // Count by status
    byStatus[entity.status] = (byStatus[entity.status] || 0) + 1;

    // Count by type
    byType[entity.type] = (byType[entity.type] || 0) + 1;

    // Count blocked
    if (entity.status === 'Blocked') {
      blockedCount++;
    }

    // Check for cross-workstream dependencies
    const blockers = await deps.getBlockers(entity.id);
    for (const blocker of blockers) {
      if (blocker.workstream !== workstream) {
        crossWorkstreamDeps++;
      }
    }
  }

  // Group entities
  const groupMap = new Map<string, EntitySummary[]>();
  for (const entity of entities) {
    let key: string;
    switch (group_by) {
      case 'type':
        key = entity.type;
        break;
      case 'priority':
        key = (entity as { priority?: string }).priority || 'none';
        break;
      default:
        key = entity.status;
    }
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(deps.toEntitySummary(entity));
  }

  const groups = Array.from(groupMap.entries()).map(([group_key, entities]) => ({
    group_key,
    entities,
  }));

  // Find cross-workstream blocking relationships
  const blockingOther: EntitySummary[] = [];
  const blockedByOther: EntitySummary[] = [];

  for (const entity of entities) {
    const blockedBy = await deps.getBlockedBy(entity.id);
    for (const blocked of blockedBy) {
      if (blocked.workstream !== workstream) {
        blockingOther.push(deps.toEntitySummary(entity));
        break;
      }
    }

    const blockers = await deps.getBlockers(entity.id);
    for (const blocker of blockers) {
      if (blocker.workstream !== workstream) {
        blockedByOther.push(deps.toEntitySummary(entity));
        break;
      }
    }
  }

  return {
    workstream,
    summary: {
      total: entities.length,
      by_status: byStatus,
      by_type: byType,
      blocked_count: blockedCount,
      cross_workstream_dependencies: crossWorkstreamDeps,
    },
    groups,
    blocking_other_workstreams: blockingOther,
    blocked_by_other_workstreams: blockedByOther,
  };
}


// =============================================================================
// Analyze Project State
// =============================================================================

/**
 * Deep analysis of project state with blockers and suggested actions.
 */
export async function analyzeProjectState(
  input: AnalyzeProjectStateInput,
  deps: ProjectUnderstandingDependencies
): Promise<AnalyzeProjectStateOutput> {
  const { workstream, focus = 'both', depth = 'summary' } = input;

  // Get all entities
  const entities = await deps.getAllEntities({
    workstream,
    includeCompleted: false,
  });

  // Calculate health per workstream
  const workstreamHealth: Record<string, { status: string; progress: number; blocker_count: number }> = {};
  const workstreamEntities = new Map<string, Entity[]>();

  for (const entity of entities) {
    const ws = entity.workstream;
    if (!workstreamEntities.has(ws)) {
      workstreamEntities.set(ws, []);
    }
    workstreamEntities.get(ws)!.push(entity);
  }

  for (const [ws, wsEntities] of workstreamEntities) {
    const completed = wsEntities.filter((e) =>
      e.status === 'Completed' || e.status === 'Decided' || e.status === 'Approved'
    ).length;
    const blocked = wsEntities.filter((e) => e.status === 'Blocked').length;
    const progress = wsEntities.length > 0 ? Math.round((completed / wsEntities.length) * 100) : 0;

    workstreamHealth[ws] = {
      status: blocked > 2 ? 'blocked' : blocked > 0 ? 'at_risk' : 'healthy',
      progress,
      blocker_count: blocked,
    };
  }

  // Determine overall health
  const blockedWorkstreams = Object.values(workstreamHealth).filter((w) => w.status === 'blocked').length;
  const atRiskWorkstreams = Object.values(workstreamHealth).filter((w) => w.status === 'at_risk').length;
  const overallHealth: 'healthy' | 'at_risk' | 'blocked' =
    blockedWorkstreams > 0 ? 'blocked' : atRiskWorkstreams > 0 ? 'at_risk' : 'healthy';

  // Find blockers
  const criticalPath: AnalyzeProjectStateOutput['blockers']['critical_path'] = [];
  const pendingDecisions: EntitySummary[] = [];
  const incompleteSpecs: EntitySummary[] = [];
  const externalDeps: EntitySummary[] = [];
  const staleItems: EntitySummary[] = [];

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const entity of entities) {
    // Check for pending decisions
    if (entity.type === 'decision' && entity.status === 'Pending') {
      pendingDecisions.push(deps.toEntitySummary(entity));
    }

    // Check for incomplete specs
    if (entity.type === 'document' && entity.status === 'Draft') {
      incompleteSpecs.push(deps.toEntitySummary(entity));
    }

    // Check for stale items (not updated in a week)
    const lastUpdated = deps.getLastUpdated(entity);
    if (lastUpdated < oneWeekAgo && entity.status !== 'Completed') {
      staleItems.push(deps.toEntitySummary(entity));
    }

    // Check for blocked items and their impact
    if (entity.status === 'Blocked') {
      const blockedBy = await deps.getBlockedBy(entity.id);
      const workstreamsAffected = new Set<string>();
      for (const blocked of blockedBy) {
        workstreamsAffected.add(blocked.workstream);
      }

      criticalPath.push({
        blocker: deps.toEntitySummary(entity),
        impact: {
          directly_blocks: blockedBy.map((e) => e.id),
          cascade_blocks: [], // Would need deeper analysis
          total_blocked: blockedBy.length,
          workstreams_affected: Array.from(workstreamsAffected),
        },
        suggested_resolution: `Resolve ${entity.type} "${entity.title}" to unblock ${blockedBy.length} items`,
        days_blocked: Math.floor((now.getTime() - deps.getLastUpdated(entity).getTime()) / (24 * 60 * 60 * 1000)),
      });
    }
  }

  // Generate suggested actions
  const suggestedActions: AnalyzeProjectStateOutput['suggested_actions'] = [];

  if (pendingDecisions.length > 0) {
    suggestedActions.push({
      priority: 1,
      action: `Resolve ${pendingDecisions.length} pending decision(s)`,
      reason: 'Pending decisions may be blocking implementation work',
      effort: pendingDecisions.length > 3 ? 'high' : 'medium',
      owner_hint: 'Project lead or decision makers',
    });
  }

  if (incompleteSpecs.length > 0) {
    suggestedActions.push({
      priority: 2,
      action: `Complete ${incompleteSpecs.length} draft document(s)`,
      reason: 'Draft documents need review before implementation',
      effort: 'medium',
      owner_hint: 'Document owners',
    });
  }

  if (staleItems.length > 0) {
    suggestedActions.push({
      priority: 3,
      action: `Review ${staleItems.length} stale item(s)`,
      reason: 'Items not updated in over a week may need attention',
      effort: 'low',
      owner_hint: 'Item assignees',
    });
  }

  // Calculate stats
  const completedThisWeek = entities.filter((e) => {
    const updated = deps.getLastUpdated(e);
    return updated >= oneWeekAgo && e.status === 'Completed';
  }).length;

  return {
    health: {
      overall: overallHealth,
      workstreams: workstreamHealth,
    },
    blockers: {
      critical_path: criticalPath,
      by_type: {
        pending_decisions: pendingDecisions,
        incomplete_specs: incompleteSpecs,
        external_dependencies: externalDeps,
      },
      stale_items: staleItems,
    },
    suggested_actions: suggestedActions,
    stats: {
      decisions_pending: pendingDecisions.length,
      specs_ready: entities.filter((e) => e.type === 'document' && e.status === 'Approved').length,
      items_blocked: criticalPath.length,
      items_completed_this_week: completedThisWeek,
    },
  };
}
