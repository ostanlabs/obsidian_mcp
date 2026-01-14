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
  FeatureCoverageItem,
  GetSchemaInput,
  GetSchemaOutput,
  EntitySchema,
  SchemaFieldDefinition,
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

// =============================================================================
// Get Feature Coverage
// =============================================================================

import type {
  GetFeatureCoverageInput,
  GetFeatureCoverageOutput,
} from './tool-types.js';

import type {
  Feature,
  FeatureId,
  Milestone,
  Story,
  Document,
  MilestoneId,
  StoryId,
  DocumentId,
} from '../models/v2-types.js';

/**
 * Dependencies for feature coverage tool.
 */
export interface FeatureCoverageDependencies {
  /** Get all features */
  getAllFeatures: (options?: {
    tier?: string;
    phase?: string;
    includeDeferred?: boolean;
  }) => Promise<Feature[]>;

  /** Get entity by ID */
  getEntity: (id: EntityId) => Promise<Entity | null>;

  /** Get all documents */
  getAllDocuments: (options?: { workstream?: string }) => Promise<Document[]>;
}

/**
 * Get feature coverage analysis showing implementation, documentation, and testing status.
 */
export async function getFeatureCoverage(
  input: GetFeatureCoverageInput,
  deps: FeatureCoverageDependencies
): Promise<GetFeatureCoverageOutput> {
  const { phase, tier, include_tests, summary_only, feature_ids, fields } = input;

  // Get all features with optional filtering
  let features = await deps.getAllFeatures({
    tier,
    phase,
    includeDeferred: true, // Include deferred to show full picture
  });

  // Filter to specific feature IDs if provided
  if (feature_ids && feature_ids.length > 0) {
    const featureIdSet = new Set(feature_ids);
    features = features.filter(f => featureIdSet.has(f.id));
  }

  // Get all documents for documentation coverage
  const allDocs = await deps.getAllDocuments();
  const docsByFeature = new Map<FeatureId, DocumentId[]>();

  // Build map of documents that document each feature
  for (const doc of allDocs) {
    if (doc.documents && doc.documents.length > 0) {
      for (const featureId of doc.documents) {
        if (!docsByFeature.has(featureId)) {
          docsByFeature.set(featureId, []);
        }
        docsByFeature.get(featureId)!.push(doc.id as DocumentId);
      }
    }
  }

  // Process each feature
  const coverageItems: FeatureCoverageItem[] = [];
  const missingImplementation: EntityId[] = [];
  const missingDocs: EntityId[] = [];
  const missingTests: EntityId[] = [];

  let implementedCount = 0;
  let documentedCount = 0;
  let testedCount = 0;

  for (const feature of features) {
    // Get implementing entities
    const implementedBy = feature.implemented_by || [];
    const milestones: EntityId[] = [];
    const stories: EntityId[] = [];

    for (const implId of implementedBy) {
      const entity = await deps.getEntity(implId);
      if (entity?.type === 'milestone') {
        milestones.push(implId);
      } else if (entity?.type === 'story') {
        stories.push(implId);
      }
    }

    // Calculate implementation progress
    let progressPercent = 0;
    if (implementedBy.length > 0) {
      let completedCount = 0;
      for (const implId of implementedBy) {
        const entity = await deps.getEntity(implId);
        if (entity && (entity.status === 'Completed' || entity.status === 'Complete')) {
          completedCount++;
        }
      }
      progressPercent = Math.round((completedCount / implementedBy.length) * 100);
    }

    // Get documentation
    const documentingDocs = docsByFeature.get(feature.id as FeatureId) || [];
    const specs: EntityId[] = [];
    const guides: EntityId[] = [];

    for (const docId of documentingDocs) {
      const doc = await deps.getEntity(docId);
      if (doc && doc.type === 'document') {
        const docEntity = doc as Document;
        // Specs: spec, adr, vision, research
        if (docEntity.doc_type === 'spec' || docEntity.doc_type === 'adr' ||
            docEntity.doc_type === 'vision' || docEntity.doc_type === 'research') {
          specs.push(docId);
        } else if (docEntity.doc_type === 'guide') {
          // Guides: guide
          guides.push(docId);
        }
      }
    }

    // Determine documentation coverage
    let docCoverage: 'full' | 'partial' | 'none' = 'none';
    if (specs.length > 0 && guides.length > 0) {
      docCoverage = 'full';
    } else if (specs.length > 0 || guides.length > 0) {
      docCoverage = 'partial';
    }

    // Track gaps
    const hasImplementation = implementedBy.length > 0;
    const hasDocs = documentingDocs.length > 0;

    if (!hasImplementation && feature.status !== 'Deferred') {
      missingImplementation.push(feature.id);
    } else if (hasImplementation) {
      implementedCount++;
    }

    if (!hasDocs && feature.status !== 'Deferred') {
      missingDocs.push(feature.id);
    } else if (hasDocs) {
      documentedCount++;
    }

    // Build coverage item
    const coverageItem: FeatureCoverageItem = {
      id: feature.id,
      title: feature.title,
      tier: feature.tier || 'OSS',
      phase: feature.phase || 'MVP',
      status: feature.status as 'Planned' | 'In Progress' | 'Complete' | 'Deferred',
      implementation: {
        milestones,
        stories,
        progress_percent: progressPercent,
      },
      documentation: {
        specs,
        guides,
        coverage: docCoverage,
      },
    };

    // Add testing info if requested
    if (include_tests) {
      // For now, we check if there are test references in the feature content
      // This could be enhanced to scan actual test files
      const hasTests = feature.test_refs && feature.test_refs.length > 0;
      coverageItem.testing = {
        test_refs: feature.test_refs || [],
        has_tests: hasTests || false,
      };

      if (!hasTests && feature.status !== 'Deferred') {
        missingTests.push(feature.id);
      } else if (hasTests) {
        testedCount++;
      }
    }

    coverageItems.push(coverageItem);
  }

  // Build summary
  const summary = {
    total: features.length,
    implemented: implementedCount,
    documented: documentedCount,
    tested: testedCount,
    gaps: {
      missing_implementation: missingImplementation,
      missing_docs: missingDocs,
      missing_tests: missingTests,
    },
  };

  // Return summary only if requested
  if (summary_only) {
    return { summary };
  }

  // Filter fields if specified
  let filteredItems = coverageItems;
  if (fields && fields.length > 0) {
    const fieldSet = new Set(fields);
    filteredItems = coverageItems.map(item => {
      const filtered: Partial<FeatureCoverageItem> = {};
      if (fieldSet.has('id')) filtered.id = item.id;
      if (fieldSet.has('title')) filtered.title = item.title;
      if (fieldSet.has('tier')) filtered.tier = item.tier;
      if (fieldSet.has('phase')) filtered.phase = item.phase;
      if (fieldSet.has('status')) filtered.status = item.status;
      if (fieldSet.has('implementation')) filtered.implementation = item.implementation;
      if (fieldSet.has('documentation')) filtered.documentation = item.documentation;
      if (fieldSet.has('testing') && item.testing) filtered.testing = item.testing;
      return filtered as FeatureCoverageItem;
    });
  }

  return {
    features: filteredItems,
    summary,
  };
}

// =============================================================================
// Get Schema
// =============================================================================

/** Schema definitions for all entity types */
const ENTITY_SCHEMAS: EntitySchema[] = [
  {
    type: 'milestone',
    id_pattern: 'M-XXX',
    fields: {
      id: { type: 'MilestoneId', required: true, description: 'Unique identifier (M-XXX format)' },
      title: { type: 'string', required: true, description: 'Milestone title' },
      status: { type: 'enum', required: true, values: ['Planned', 'In Progress', 'Complete', 'Blocked', 'Deferred'] },
      workstream: { type: 'string', required: true, description: 'Workstream this milestone belongs to' },
      priority: { type: 'enum', values: ['P0', 'P1', 'P2', 'P3'], description: 'Priority level' },
      objective: { type: 'string', description: 'Milestone objective/goal' },
      depends_on: { type: 'EntityId[]', relationship: { target_types: ['milestone', 'decision'], inverse: 'blocks' } },
      implements: { type: 'FeatureId[]', relationship: { target_types: ['feature'], inverse: 'implemented_by', auto_sync: true } },
    },
    statuses: ['Planned', 'In Progress', 'Complete', 'Blocked', 'Deferred'],
    status_transitions: {
      'Planned': ['In Progress', 'Blocked', 'Deferred'],
      'In Progress': ['Complete', 'Blocked', 'Deferred'],
      'Blocked': ['In Progress', 'Deferred'],
      'Complete': [],
      'Deferred': ['Planned'],
    },
  },
  {
    type: 'story',
    id_pattern: 'S-XXX',
    fields: {
      id: { type: 'StoryId', required: true, description: 'Unique identifier (S-XXX format)' },
      title: { type: 'string', required: true, description: 'Story title' },
      status: { type: 'enum', required: true, values: ['Planned', 'In Progress', 'Complete', 'Blocked', 'Deferred'] },
      workstream: { type: 'string', required: true, description: 'Workstream this story belongs to' },
      parent: { type: 'MilestoneId', required: true, relationship: { target_types: ['milestone'], inverse: 'children' } },
      priority: { type: 'enum', values: ['P0', 'P1', 'P2', 'P3'], description: 'Priority level' },
      effort: { type: 'enum', values: ['XS', 'S', 'M', 'L', 'XL'], description: 'Effort estimate' },
      outcome: { type: 'string', description: 'Expected outcome' },
      acceptance_criteria: { type: 'string[]', description: 'List of acceptance criteria' },
      depends_on: { type: 'EntityId[]', relationship: { target_types: ['story', 'decision', 'document'], inverse: 'blocks' } },
      implements: { type: 'FeatureId[]', relationship: { target_types: ['feature'], inverse: 'implemented_by', auto_sync: true } },
    },
    statuses: ['Planned', 'In Progress', 'Complete', 'Blocked', 'Deferred'],
  },
  {
    type: 'task',
    id_pattern: 'T-XXX',
    fields: {
      id: { type: 'TaskId', required: true, description: 'Unique identifier (T-XXX format)' },
      title: { type: 'string', required: true, description: 'Task title' },
      status: { type: 'enum', required: true, values: ['Pending', 'In Progress', 'Completed', 'Blocked', 'Deferred'] },
      workstream: { type: 'string', description: 'Workstream (inherited from parent story)' },
      parent: { type: 'StoryId', required: true, relationship: { target_types: ['story'], inverse: 'children' } },
      goal: { type: 'string', description: 'Task goal' },
      description: { type: 'string', description: 'Task description' },
      technical_notes: { type: 'string', description: 'Technical implementation notes' },
      depends_on: { type: 'EntityId[]', relationship: { target_types: ['task', 'decision'], inverse: 'blocks' } },
    },
    statuses: ['Pending', 'In Progress', 'Completed', 'Blocked', 'Deferred'],
  },
  {
    type: 'decision',
    id_pattern: 'DEC-XXX',
    fields: {
      id: { type: 'DecisionId', required: true, description: 'Unique identifier (DEC-XXX format)' },
      title: { type: 'string', required: true, description: 'Decision title' },
      status: { type: 'enum', required: true, values: ['Proposed', 'Accepted', 'Rejected', 'Superseded'] },
      workstream: { type: 'string', required: true, description: 'Workstream this decision affects' },
      context: { type: 'string', description: 'Context/background for the decision' },
      decision: { type: 'string', description: 'The actual decision made' },
      rationale: { type: 'string', description: 'Reasoning behind the decision' },
      affects: { type: 'FeatureId[]', relationship: { target_types: ['feature'], inverse: 'decided_by', auto_sync: true } },
      blocks: { type: 'EntityId[]', relationship: { target_types: ['document', 'story', 'task'], inverse: 'depends_on' } },
      supersedes: { type: 'DecisionId', relationship: { target_types: ['decision'], inverse: 'superseded_by' } },
    },
    statuses: ['Proposed', 'Accepted', 'Rejected', 'Superseded'],
  },
  {
    type: 'document',
    id_pattern: 'DOC-XXX',
    fields: {
      id: { type: 'DocumentId', required: true, description: 'Unique identifier (DOC-XXX format)' },
      title: { type: 'string', required: true, description: 'Document title' },
      status: { type: 'enum', required: true, values: ['Draft', 'Review', 'Published', 'Archived'] },
      workstream: { type: 'string', required: true, description: 'Workstream this document belongs to' },
      content: { type: 'string', description: 'Document content (markdown)' },
      documents: { type: 'FeatureId[]', relationship: { target_types: ['feature'], inverse: 'documented_by', auto_sync: true } },
      implemented_by: { type: 'EntityId[]', relationship: { target_types: ['story', 'task'], inverse: 'implements' } },
    },
    statuses: ['Draft', 'Review', 'Published', 'Archived'],
  },
  {
    type: 'feature',
    id_pattern: 'F-XXX',
    fields: {
      id: { type: 'FeatureId', required: true, description: 'Unique identifier (F-XXX format)' },
      title: { type: 'string', required: true, description: 'Feature title' },
      status: { type: 'enum', required: true, values: ['Planned', 'In Progress', 'Complete', 'Deferred'] },
      workstream: { type: 'string', description: 'Primary workstream' },
      user_story: { type: 'string', required: true, description: 'User story format: "As a... I want... so that..."' },
      tier: { type: 'enum', required: true, values: ['OSS', 'Premium'], default: 'OSS', description: 'Feature tier' },
      phase: { type: 'enum', required: true, values: ['MVP', '0', '1', '2', '3', '4', '5'], default: 'MVP', description: 'Implementation phase' },
      implemented_by: { type: '(MilestoneId|StoryId)[]', relationship: { target_types: ['milestone', 'story'], inverse: 'implements', auto_sync: true } },
      documented_by: { type: 'DocumentId[]', relationship: { target_types: ['document'], inverse: 'documents', auto_sync: true } },
      decided_by: { type: 'DecisionId[]', relationship: { target_types: ['decision'], inverse: 'affects', auto_sync: true } },
      test_refs: { type: 'string[]', description: 'Test file references' },
    },
    statuses: ['Planned', 'In Progress', 'Complete', 'Deferred'],
  },
];

/**
 * Get entity schema information.
 * Returns field definitions, valid values, and relationship info.
 */
export function getSchema(input: GetSchemaInput): GetSchemaOutput {
  const { entity_type, relationships_only } = input;

  let schemas = ENTITY_SCHEMAS;

  // Filter by entity type if specified
  if (entity_type) {
    schemas = schemas.filter(s => s.type === entity_type);
  }

  // Filter to relationships only if requested
  if (relationships_only) {
    schemas = schemas.map(schema => ({
      ...schema,
      fields: Object.fromEntries(
        Object.entries(schema.fields).filter(([_, def]) => def.relationship)
      ),
    }));
  }

  return { schemas };
}
