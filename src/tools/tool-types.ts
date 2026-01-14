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
  // Document-specific: Features this document describes
  documents?: EntityId[];
  // Feature-specific: Documents that describe this feature
  documented_by?: EntityId[];
  // Feature-specific: Entities that implement this feature
  implemented_by?: EntityId[];
  // Feature-specific: Decisions that affect this feature
  decided_by?: EntityId[];
  // Feature-specific: Test file references
  test_refs?: string[];
  // Feature-specific fields
  user_story?: string;
  tier?: string;
  phase?: string;
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

// update_entity (enhanced - consolidates update_entity_status, archive_entity, restore_from_archive)
export interface UpdateEntityInput {
  id: EntityId;
  data?: Record<string, unknown>;
  add_dependencies?: EntityId[];
  remove_dependencies?: EntityId[];
  add_to?: {
    implements?: EntityId[];
    blocks?: EntityId[];
  };
  remove_from?: {
    implements?: EntityId[];
    blocks?: EntityId[];
  };
  // Enhanced: Status update with cascade (replaces update_entity_status)
  status?: EntityStatus;
  status_note?: string;
  cascade?: boolean;
  // Enhanced: Archive/restore support (replaces archive_entity, restore_from_archive)
  archived?: boolean;
  archive_options?: {
    force?: boolean;  // Archive even if entity has children
    cascade?: boolean;  // Archive children too (for milestones)
    archive_folder?: string;  // Custom archive folder
    remove_from_canvas?: boolean;
    canvas_source?: string;
  };
  restore_options?: {
    restore_children?: boolean;
    add_to_canvas?: boolean;
    canvas_source?: string;
  };
}

export interface UpdateEntityOutput {
  id: EntityId;
  entity: EntityFull;
  dependencies_added: number;
  dependencies_removed: number;
  // Enhanced: Status change info
  status_changed?: {
    old_status: EntityStatus;
    new_status: EntityStatus;
    cascaded_updates: EntityId[];
  };
  // Enhanced: Archive/restore info
  archive_result?: {
    archived: boolean;
    archive_path?: string;
    archived_children?: EntityId[];
  };
  restore_result?: {
    restored: boolean;
    restored_children?: EntityId[];
  };
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

/** Operation type for batch_update */
export type BatchOpType = 'create' | 'update' | 'archive';

/** Single operation in a batch_update call */
export interface BatchOp {
  /** Client-provided ID for idempotency and cross-reference within the batch */
  client_id: string;
  /** Operation type */
  op: BatchOpType;
  /** Entity type (required for create) */
  type?: EntityType;
  /** Entity ID (required for update/archive) */
  id?: EntityId;
  /** Payload for the operation */
  payload: {
    // For create: entity data
    title?: string;
    workstream?: string;
    parent?: string;  // Can be client_id or EntityId
    depends_on?: string[];  // Can be client_ids or EntityIds
    implements?: string[];
    enables?: string[];
    // For update: fields to update
    status?: EntityStatus;
    content?: string;
    priority?: Priority;
    effort?: Effort;
    // For archive
    archived?: boolean;
    cascade?: boolean;  // Archive children too
    [key: string]: unknown;
  };
}

/** Input for batch_update tool */
export interface BatchUpdateInput {
  /** Array of operations to perform */
  ops: BatchOp[];
  /** Options for the batch operation */
  options?: {
    /** If true, rollback all on any failure. Default: false */
    atomic?: boolean;
    /** Add created entities to canvas */
    add_to_canvas?: boolean;
    /** Canvas file path */
    canvas_source?: string;
  };
}

/** Result of a single operation in batch_update */
export interface BatchOpResult {
  /** Client-provided ID */
  client_id: string;
  /** Operation status */
  status: 'ok' | 'error';
  /** Entity ID (for successful creates/updates) */
  id?: EntityId;
  /** Error details (for failed operations) */
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}

/** Output for batch_update tool */
export interface BatchUpdateOutput {
  /** Results for each operation */
  results: BatchOpResult[];
  /** Summary of the batch operation */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

// =============================================================================
// Category 3: Project Understanding
// =============================================================================

// get_project_overview (enhanced - consolidates get_workstream_status)
export interface GetProjectOverviewInput {
  include_completed?: boolean;
  include_archived?: boolean;
  canvas_source?: string;
  // Enhanced: workstream filtering (from get_workstream_status)
  workstream?: Workstream;
  // Enhanced: grouping (from get_workstream_status)
  group_by?: 'status' | 'type' | 'priority';
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
  // Enhanced: workstream detail (when workstream filter is specified)
  workstream_detail?: {
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
  };
}

// get_workstream_status (DEPRECATED - use get_project_overview with workstream filter)
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

// search_entities (enhanced - consolidates navigate_hierarchy)
export interface SearchEntitiesInput {
  // Search mode
  query?: string;

  // Navigation mode (from navigate_hierarchy)
  from_id?: EntityId;
  direction?: 'up' | 'down' | 'siblings' | 'dependencies';
  depth?: number;

  // Filters (apply to both modes)
  filters?: {
    type?: EntityType[];
    status?: EntityStatus[];
    workstream?: Workstream[];
    effort?: Effort[];
    archived?: boolean;
  };

  // Response control
  limit?: number;
  include_content?: boolean;
  fields?: EntityField[];  // Control response size
}

export interface SearchEntitiesOutput {
  results: Array<{
    id: EntityId;
    type: EntityType;
    title: string;
    status: EntityStatus;
    workstream: Workstream;
    relevance_score?: number;  // Only for search mode
    snippet?: string;  // Only for search mode
    parent?: EntityId;
    path?: string;  // Only for search mode
  }>;
  total_matches: number;
  // Navigation mode fields
  origin?: EntitySummary;  // Only for navigation mode
  path_description?: string;  // Only for navigation mode
}

// get_entity (unified - replaces get_entity_summary and get_entity_full)
/**
 * Available fields for get_entity:
 * - id, type, title, status, workstream, last_updated (always included in summary)
 * - parent, children_count (basic hierarchy)
 * - content (full markdown content)
 * - effort, priority (planning fields)
 * - dependencies (blocks/blocked_by IDs)
 * - dependency_details (blocks/blocked_by with summaries)
 * - task_progress (for stories)
 * - acceptance_criteria (for stories/tasks)
 * - children (child entity summaries)
 * - implementation_context (for implementation handoff)
 */
export type EntityField =
  | 'id'
  | 'type'
  | 'title'
  | 'status'
  | 'workstream'
  | 'last_updated'
  | 'parent'
  | 'children_count'
  | 'content'
  | 'effort'
  | 'priority'
  | 'dependencies'
  | 'dependency_details'
  | 'task_progress'
  | 'acceptance_criteria'
  | 'children'
  | 'implementation_context';

export interface GetEntityInput {
  id: EntityId;
  /** Fields to include in response. If not specified, returns summary fields. */
  fields?: EntityField[];
}

export interface GetEntityOutput {
  id: EntityId;
  type: EntityType;
  title: string;
  status: EntityStatus;
  workstream: Workstream;
  last_updated: string;
  // Optional fields based on request
  parent?: { id: EntityId; title: string };
  children_count?: number;
  content?: string;
  effort?: Effort;
  priority?: Priority;
  dependencies?: {
    blocks: EntityId[];
    blocked_by: EntityId[];
  };
  dependency_details?: {
    blocks: EntitySummary[];
    blocked_by: EntitySummary[];
  };
  task_progress?: {
    total: number;
    completed: number;
  };
  acceptance_criteria?: string[];
  children?: EntitySummary[];
  implementation_context?: {
    required: EntitySummary[];
    reference: EntitySummary[];
    assumes: string[];
  };
}

// =============================================================================
// Category 5: Decision & Document Management
// =============================================================================

// manage_documents (consolidated tool - replaces individual decision/document tools)
export type ManageDocumentsAction = 'get_decision_history' | 'supersede_document' | 'get_document_history' | 'check_freshness';

export interface ManageDocumentsInput {
  action: ManageDocumentsAction;

  // For get_decision_history
  topic?: string;
  workstream?: Workstream;
  include_superseded?: boolean;
  include_archived?: boolean;

  // For supersede_document
  document_id?: EntityId;
  decision_id?: EntityId;
  new_content?: string;
  change_summary?: string;
}

export type ManageDocumentsOutput =
  | { action: 'get_decision_history' } & GetDecisionHistoryOutput
  | { action: 'supersede_document' } & SupersedeDocumentOutput
  | { action: 'get_document_history' } & GetDocumentHistoryOutput
  | { action: 'check_freshness' } & CheckDocumentFreshnessOutput;

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
    blocks: EntityId[];
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
// Category 6: Feature Coverage
// =============================================================================

// get_feature_coverage
export interface GetFeatureCoverageInput {
  phase?: 'MVP' | '0' | '1' | '2' | '3' | '4' | '5';
  tier?: 'OSS' | 'Premium';
  include_tests?: boolean;
}

export interface FeatureCoverageItem {
  id: EntityId;
  title: string;
  tier: 'OSS' | 'Premium';
  phase: 'MVP' | '0' | '1' | '2' | '3' | '4' | '5';
  status: 'Planned' | 'In Progress' | 'Complete' | 'Deferred';
  implementation: {
    milestones: EntityId[];
    stories: EntityId[];
    progress_percent: number;
  };
  documentation: {
    specs: EntityId[];
    guides: EntityId[];
    coverage: 'full' | 'partial' | 'none';
  };
  testing?: {
    test_refs: string[];
    has_tests: boolean;
  };
}

export interface GetFeatureCoverageOutput {
  features: FeatureCoverageItem[];
  summary: {
    total: number;
    implemented: number;
    documented: number;
    tested: number;
    gaps: {
      missing_implementation: EntityId[];
      missing_docs: EntityId[];
      missing_tests: EntityId[];
    };
  };
}
