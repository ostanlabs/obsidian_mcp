/**
 * V2 MCP Tool Type Definitions
 *
 * Input/output types for all V2 MCP tools.
 */

import {
  Entity,
  EntityId,
  EntityType,
  EntityStatus,
  Priority,
  Effort,
  DocumentType,
} from '../models/v2-types.js';

// Re-export types needed by tool implementations
export type { EntityStatus, Priority, Effort };

/** Workstream identifier (string alias for clarity) */
export type Workstream = string;

// =============================================================================
// Common Types
// =============================================================================

export interface EntitySummary {
  id: EntityId;
  type: EntityType;
  title: string;
  status: EntityStatus;
  workstream: Workstream;
  parent?: { id: EntityId; title: string };
  children_count?: number;
  last_updated: string;
}

export interface EntityFull extends EntitySummary {
  content: string;
  effort?: Effort;
  priority?: Priority;
  dependencies?: {
    blocks: EntityId[];
    blocked_by: EntityId[];
  };
  task_progress?: {
    total: number;
    completed: number;
  };
  acceptance_criteria?: string[];
  tasks?: TaskInfo[];
  children?: EntitySummary[];
  dependency_details?: {
    blocks: EntitySummary[];
    blocked_by: EntitySummary[];
  };
  implementation_context?: {
    required: EntitySummary[];
    reference: EntitySummary[];
    assumes: string[];
  };
}

export interface TaskInfo {
  title: string;
  goal: string;
  status: string;
  estimate_hrs?: number;
  actual_hrs?: number;
}

// =============================================================================
// Category 1: Entity Management
// =============================================================================

// create_entity
export interface CreateEntityInput {
  type: EntityType;
  data: {
    title: string;
    workstream: Workstream;
    parent?: EntityId;
    depends_on?: EntityId[];
    implements?: EntityId[];
    enables?: EntityId[];
    [key: string]: unknown;
  };
  options?: {
    canvas_source?: string;
    add_to_canvas?: boolean;
  };
}

export interface CreateEntityOutput {
  id: EntityId;
  entity: EntityFull;
  dependencies_created: number;
  canvas_node_added: boolean;
}

// update_entity
export interface UpdateEntityInput {
  id: EntityId;
  data?: Record<string, unknown>;
  add_dependencies?: EntityId[];
  remove_dependencies?: EntityId[];
  add_to?: {
    implements?: EntityId[];
    enables?: EntityId[];
  };
  remove_from?: {
    implements?: EntityId[];
    enables?: EntityId[];
  };
}

export interface UpdateEntityOutput {
  id: EntityId;
  entity: EntityFull;
  dependencies_added: number;
  dependencies_removed: number;
}

// update_entity_status
export interface UpdateEntityStatusInput {
  id: EntityId;
  status: EntityStatus;
  note?: string;
  cascade?: boolean;
}

export interface UpdateEntityStatusOutput {
  id: EntityId;
  old_status: EntityStatus;
  new_status: EntityStatus;
  cascaded_updates: EntityId[];
}

// archive_entity
export interface ArchiveEntityInput {
  id: EntityId;
  force?: boolean;
  remove_from_canvas?: boolean;
  canvas_source?: string;
}

export interface ArchiveEntityOutput {
  id: EntityId;
  archived: boolean;
  archive_path: string;
}

// archive_milestone
export interface ArchiveMilestoneInput {
  milestone_id: EntityId;
  archive_folder?: string;
  remove_from_canvas?: boolean;
  canvas_source?: string;
}

export interface ArchiveMilestoneOutput {
  milestone_id: EntityId;
  archived_entities: {
    milestones: EntityId[];
    stories: EntityId[];
    tasks: EntityId[];
  };
  total_archived: number;
  archive_path: string;
}

// restore_from_archive
export interface RestoreFromArchiveInput {
  id: EntityId;
  restore_children?: boolean;
  add_to_canvas?: boolean;
  canvas_source?: string;
}

export interface RestoreFromArchiveOutput {
  id: EntityId;
  restored: boolean;
  restored_children: EntityId[];
}

// =============================================================================
// Category 2: Batch Operations
// =============================================================================

// batch_operations
export interface BatchOperationsInput {
  entities: Array<{
    type: EntityType;
    data: {
      title: string;
      parent?: string;
      depends_on?: string[];
      implements?: string[];
      enables?: string[];
      [key: string]: unknown;
    };
  }>;
  dependencies?: Array<{
    from: string;
    to: string;
    type: 'blocks' | 'implements' | 'enables';
  }>;
  options?: {
    atomic?: boolean;
    add_to_canvas?: boolean;
    canvas_source?: string;
  };
}

export interface BatchOperationsOutput {
  created: Array<{
    ref: string;
    id: EntityId;
    type: EntityType;
  }>;
  dependencies_created: number;
  canvas_nodes_added: number;
}

// batch_update_status
export interface BatchUpdateStatusInput {
  updates: Array<{
    id: EntityId;
    status: EntityStatus;
    note?: string;
  }>;
  options?: {
    auto_cascade?: boolean;
  };
}

export interface BatchUpdateStatusOutput {
  updated: EntityId[];
  cascaded: EntityId[];
  failed: Array<{ id: EntityId; error: string }>;
}

// batch_archive
export interface BatchArchiveInput {
  milestone_ids?: EntityId[];
  entity_ids?: EntityId[];
  options?: {
    archive_folder?: string;
    remove_from_canvas?: boolean;
    canvas_source?: string;
  };
}

export interface BatchArchiveOutput {
  archived: {
    milestones: EntityId[];
    stories: EntityId[];
    tasks: EntityId[];
    decisions: EntityId[];
    documents: EntityId[];
  };
  total_archived: number;
  archive_path: string;
}

// =============================================================================
// Category 3: Project Understanding
// =============================================================================

// get_project_overview
export interface GetProjectOverviewInput {
  include_completed?: boolean;
  include_archived?: boolean;
  canvas_source?: string;
}

export interface GetProjectOverviewOutput {
  summary: {
    milestones: { total: number; completed: number; in_progress: number; blocked: number };
    stories: { total: number; completed: number; in_progress: number; blocked: number };
    tasks: { total: number; completed: number; in_progress: number; blocked: number };
    decisions: { total: number; pending: number; decided: number };
    documents: { total: number; draft: number; approved: number };
  };
  workstreams: Record<string, {
    health: 'healthy' | 'at_risk' | 'blocked';
    progress_percent: number;
    blocked_count: number;
  }>;
  pending_decisions: number;
  ready_for_implementation: number;
}

// get_workstream_status
export interface GetWorkstreamStatusInput {
  workstream: Workstream;
  include_completed?: boolean;
  group_by?: 'status' | 'type' | 'priority';
}

export interface GetWorkstreamStatusOutput {
  workstream: Workstream;
  summary: {
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    blocked_count: number;
    cross_workstream_dependencies: number;
  };
  groups: Array<{
    group_key: string;
    entities: EntitySummary[];
  }>;
  blocking_other_workstreams: EntitySummary[];
  blocked_by_other_workstreams: EntitySummary[];
}

// analyze_project_state
export interface AnalyzeProjectStateInput {
  workstream?: Workstream;
  focus?: 'blockers' | 'actions' | 'both';
  depth?: 'summary' | 'detailed';
}

export interface AnalyzeProjectStateOutput {
  health: {
    overall: 'healthy' | 'at_risk' | 'blocked';
    workstreams: Record<string, {
      status: string;
      progress: number;
      blocker_count: number;
    }>;
  };
  blockers: {
    critical_path: Array<{
      blocker: EntitySummary;
      impact: {
        directly_blocks: EntityId[];
        cascade_blocks: EntityId[];
        total_blocked: number;
        workstreams_affected: Workstream[];
      };
      suggested_resolution: string;
      days_blocked: number;
    }>;
    by_type: {
      pending_decisions: EntitySummary[];
      incomplete_specs: EntitySummary[];
      external_dependencies: EntitySummary[];
    };
    stale_items: EntitySummary[];
  };
  suggested_actions: Array<{
    priority: number;
    action: string;
    reason: string;
    effort: 'low' | 'medium' | 'high';
    owner_hint: string;
  }>;
  stats: {
    decisions_pending: number;
    specs_ready: number;
    items_blocked: number;
    items_completed_this_week: number;
  };
}


// =============================================================================
// Category 4: Search & Navigation
// =============================================================================

// search_entities
export interface SearchEntitiesInput {
  query: string;
  filters?: {
    type?: EntityType[];
    status?: EntityStatus[];
    workstream?: Workstream[];
    effort?: Effort[];
    archived?: boolean;
  };
  limit?: number;
  include_content?: boolean;
}

export interface SearchEntitiesOutput {
  results: Array<{
    id: EntityId;
    type: EntityType;
    title: string;
    status: EntityStatus;
    workstream: Workstream;
    relevance_score: number;
    snippet: string;
    parent?: EntityId;
    path: string;
  }>;
  total_matches: number;
}

// get_entity_summary
export interface GetEntitySummaryInput {
  id: EntityId;
}

export interface GetEntitySummaryOutput extends EntitySummary {
  effort?: Effort;
  priority?: Priority;
  dependencies: {
    blocks: EntityId[];
    blocked_by: EntityId[];
  };
  task_progress?: {
    total: number;
    completed: number;
  };
}

// get_entity_full
export interface GetEntityFullInput {
  id: EntityId;
  include_children?: boolean;
  include_dependencies?: boolean;
  depth?: number;
}

export interface GetEntityFullOutput extends EntityFull {}

// navigate_hierarchy
export interface NavigateHierarchyInput {
  from_id: EntityId;
  direction: 'up' | 'down' | 'siblings' | 'dependencies';
  depth?: number;
  include_content?: boolean;
}

export interface NavigateHierarchyOutput {
  origin: EntitySummary;
  results: EntitySummary[];
  path_description: string;
}

// =============================================================================
// Category 5: Decision & Document Management
// =============================================================================

// create_decision
export interface CreateDecisionInput {
  title: string;
  context: string;
  decision: string;
  rationale: string;
  workstream: Workstream;
  decided_by: string;
  enables?: EntityId[];
  supersedes?: EntityId;
  affects_documents?: EntityId[];
  add_to_canvas?: boolean;
  canvas_source?: string;
}

export interface CreateDecisionOutput {
  id: EntityId;
  decision: EntityFull;
  enabled_count: number;
  stale_documents: EntityId[];
}

// get_decision_history
export interface GetDecisionHistoryInput {
  topic?: string;
  workstream?: Workstream;
  include_superseded?: boolean;
  include_archived?: boolean;
}

export interface GetDecisionHistoryOutput {
  decisions: Array<{
    id: EntityId;
    title: string;
    status: string;
    decided_on: string;
    enables: EntityId[];
    superseded_by?: EntityId;
  }>;
  decision_chains: Array<{
    current: EntityId;
    history: EntityId[];
  }>;
}

// supersede_document
export interface SupersedeDocumentInput {
  document_id: EntityId;
  decision_id: EntityId;
  new_content: string;
  change_summary: string;
}

export interface SupersedeDocumentOutput {
  document_id: EntityId;
  new_version: number;
  decision_id: EntityId;
  previous_version_ref: string;
}

// get_document_history
export interface GetDocumentHistoryInput {
  document_id: EntityId;
}

export interface GetDocumentHistoryOutput {
  document_id: EntityId;
  current_version: number;
  history: Array<{
    version: number;
    date: string;
    supersedes_decision?: EntityId;
    change_summary: string;
    git_ref?: string;
  }>;
}

// check_document_freshness
export interface CheckDocumentFreshnessInput {
  document_id: EntityId;
}

export interface CheckDocumentFreshnessOutput {
  document_id: EntityId;
  is_fresh: boolean;
  stale_reasons: Array<{
    type: 'newer_decision' | 'referenced_doc_changed' | 'todo_items';
    detail: string;
    entity_id?: EntityId;
  }>;
  suggested_updates: string[];
}


// =============================================================================
// Category 6: Implementation Handoff
// =============================================================================

// get_ready_for_implementation
export interface GetReadyForImplementationInput {
  workstream?: Workstream;
  priority?: Priority[];
}

export interface GetReadyForImplementationOutput {
  ready: Array<{
    id: EntityId;
    title: string;
    type: EntityType;
    readiness_score: number;
    checklist: {
      all_decisions_made: boolean;
      no_blocking_dependencies: boolean;
      acceptance_criteria_defined: boolean;
      no_open_todos: boolean;
      status_approved: boolean;
    };
    implementation_estimate: string;
    suggested_start: string;
  }>;
  almost_ready: Array<{
    id: EntityId;
    title: string;
    readiness_score: number;
    blockers: Array<{
      type: string;
      id?: EntityId;
      detail: string;
    }>;
    what_to_resolve: string;
  }>;
  not_ready_count: number;
}

// generate_implementation_package
export interface GenerateImplementationPackageInput {
  spec_id: EntityId;
}

export interface GenerateImplementationPackageOutput {
  primary_spec: {
    id: EntityId;
    title: string;
    content: string;
  };
  required_context: Array<{
    id: EntityId;
    title: string;
    content: string;
    relevance: string;
  }>;
  reference_links: Array<{
    id: EntityId;
    title: string;
    summary: string;
    path: string;
  }>;
  related_systems: string[];
  decisions: Array<{
    id: EntityId;
    title: string;
    decision: string;
    rationale: string;
  }>;
  acceptance_criteria: string[];
  constraints: string[];
  open_items: Array<{
    type: 'pending_decision' | 'assumption' | 'risk';
    detail: string;
  }>;
}

// validate_spec_completeness
export interface ValidateSpecCompletenessInput {
  spec_id: EntityId;
}

export interface ValidateSpecCompletenessOutput {
  spec_id: EntityId;
  is_complete: boolean;
  score: number;
  checks: {
    has_acceptance_criteria: boolean;
    all_todos_resolved: boolean;
    dependencies_met: boolean;
    decisions_made: boolean;
    status_approved: boolean;
    implementation_context_defined: boolean;
  };
  issues: Array<{
    severity: 'error' | 'warning';
    check: string;
    detail: string;
    suggestion: string;
  }>;
}

// =============================================================================
// Category 8: Canvas Layout
// =============================================================================

// auto_layout_canvas
export interface AutoLayoutCanvasInput {
  canvas_source?: string;
  options?: {
    /** Horizontal spacing between dependency stages (default: 400) */
    stage_spacing?: number;
    /** Vertical spacing between items in same lane (default: 120) */
    item_spacing?: number;
    /** Padding around lanes (default: 50) */
    lane_padding?: number;
    /** Preserve existing positions for specific workstreams */
    preserve_workstreams?: string[];
  };
}

export interface AutoLayoutCanvasOutput {
  success: boolean;
  nodes_repositioned: number;
  workstreams_found: string[];
  errors: string[];
}
