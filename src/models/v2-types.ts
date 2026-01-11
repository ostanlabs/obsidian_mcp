/**
 * V2 Entity Types and Interfaces
 *
 * This file defines the hierarchical entity system for the Obsidian MCP Server V2.
 * Entity types: Milestone, Story, Task, Decision, Document
 *
 * @version 2.0
 */

// =============================================================================
// Branded Types for Entity IDs
// =============================================================================

/** Brand for type-safe entity IDs */
declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

/** Milestone ID (M-xxx) */
export type MilestoneId = Brand<string, 'MilestoneId'>;

/** Story ID (S-xxx) */
export type StoryId = Brand<string, 'StoryId'>;

/** Task ID (T-xxx) */
export type TaskId = Brand<string, 'TaskId'>;

/** Decision ID (DEC-xxx) */
export type DecisionId = Brand<string, 'DecisionId'>;

/** Document ID (DOC-xxx) */
export type DocumentId = Brand<string, 'DocumentId'>;

/** Union of all entity ID types */
export type EntityId = MilestoneId | StoryId | TaskId | DecisionId | DocumentId;

// =============================================================================
// Entity Types
// =============================================================================

/** All entity types in the V2 system */
export type EntityType = 'milestone' | 'story' | 'task' | 'decision' | 'document';

/** Valid entity type values */
export const ENTITY_TYPES: readonly EntityType[] = ['milestone', 'story', 'task', 'decision', 'document'] as const;

/** Type guard for EntityType */
export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && ENTITY_TYPES.includes(value as EntityType);
}

// =============================================================================
// Status Types by Entity
// =============================================================================

/** Milestone status values */
export type MilestoneStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';

/** Story status values */
export type StoryStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';

/** Task status values */
export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';

/** Decision status values */
export type DecisionStatus = 'Pending' | 'Decided' | 'Superseded';

/** Document status values */
export type DocumentStatus = 'Draft' | 'Review' | 'Approved' | 'Superseded';

/** Union of all status types */
export type EntityStatus = MilestoneStatus | StoryStatus | TaskStatus | DecisionStatus | DocumentStatus;

// =============================================================================
// Common Types
// =============================================================================

/** Priority levels */
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

/** Effort/workstream types */
export type Effort = 'Engineering' | 'Business' | 'Infra' | 'Research' | 'Design' | 'Marketing';

/** Document types */
export type DocumentType = 'spec' | 'adr' | 'vision' | 'guide' | 'research';

/** ISO 8601 datetime string */
export type ISODateTime = string;

/** Vault-relative path */
export type VaultPath = string;

/** Canvas file path */
export type CanvasPath = string;

// =============================================================================
// ID Validation Patterns
// =============================================================================

/** Regex patterns for validating entity IDs */
export const ID_PATTERNS = {
  milestone: /^M-(\d{3,})$/,
  story: /^S-(\d{3,})$/,
  task: /^T-(\d{3,})$/,
  decision: /^DEC-(\d{3,})$/,
  document: /^DOC-(\d{3,})$/,
} as const;

/** ID prefixes by entity type */
export const ID_PREFIXES = {
  milestone: 'M',
  story: 'S',
  task: 'T',
  decision: 'DEC',
  document: 'DOC',
} as const;

// =============================================================================
// Type Guards
// =============================================================================

/** Check if a string is a valid Milestone ID */
export function isMilestoneId(id: string): id is MilestoneId {
  return ID_PATTERNS.milestone.test(id);
}

/** Check if a string is a valid Story ID */
export function isStoryId(id: string): id is StoryId {
  return ID_PATTERNS.story.test(id);
}

/** Check if a string is a valid Task ID */
export function isTaskId(id: string): id is TaskId {
  return ID_PATTERNS.task.test(id);
}

/** Check if a string is a valid Decision ID */
export function isDecisionId(id: string): id is DecisionId {
  return ID_PATTERNS.decision.test(id);
}

/** Check if a string is a valid Document ID */
export function isDocumentId(id: string): id is DocumentId {
  return ID_PATTERNS.document.test(id);
}

/** Check if a string is any valid Entity ID */
export function isEntityId(id: string): id is EntityId {
  return isMilestoneId(id) || isStoryId(id) || isTaskId(id) || isDecisionId(id) || isDocumentId(id);
}

/** Get entity type from ID */
export function getEntityTypeFromId(id: string): EntityType | null {
  if (isMilestoneId(id)) return 'milestone';
  if (isStoryId(id)) return 'story';
  if (isTaskId(id)) return 'task';
  if (isDecisionId(id)) return 'decision';
  if (isDocumentId(id)) return 'document';
  return null;
}

/** Parse numeric part from entity ID */
export function parseIdNumber(id: string): number {
  const match = id.match(/\d+$/);
  return match ? parseInt(match[0], 10) : 0;
}

// =============================================================================
// Entity Base Interface
// =============================================================================

/**
 * Base interface for all entity types.
 * Contains common fields shared across Milestones, Stories, Tasks, Decisions, and Documents.
 */
export interface EntityBase {
  /** Unique identifier (M-xxx, S-xxx, T-xxx, DEC-xxx, DOC-xxx) */
  id: EntityId;

  /** Entity type discriminator */
  type: EntityType;

  /** Display title */
  title: string;

  /** Workstream this entity belongs to */
  workstream: string;

  /** Current status (type-specific values) */
  status: EntityStatus;

  /** Whether entity is archived */
  archived: boolean;

  /** Creation timestamp (ISO 8601) */
  created_at: ISODateTime;

  /** Last update timestamp (ISO 8601) */
  updated_at: ISODateTime;

  /** Source canvas file path */
  canvas_source: CanvasPath;

  /** CSS classes for styling */
  cssclasses: string[];

  /** Path to entity file in vault */
  vault_path: VaultPath;
}

// =============================================================================
// Milestone Interface
// =============================================================================

/**
 * Milestone entity - high-level goal with target date.
 * Contains Stories as children.
 */
export interface Milestone extends EntityBase {
  type: 'milestone';
  id: MilestoneId;
  status: MilestoneStatus;

  /** Target completion date */
  target_date?: ISODateTime;

  /** Owner/responsible person */
  owner?: string;

  /** Priority level */
  priority: Priority;

  /** IDs of milestones or decisions this depends on */
  depends_on: (MilestoneId | DecisionId)[];

  /** Document IDs this milestone implements or is guided by */
  implements?: DocumentId[];

  /** Objective description (markdown content) */
  objective?: string;

  /** Success criteria checklist */
  success_criteria?: string[];
}

// =============================================================================
// Story Interface
// =============================================================================

/** Inline task within a story */
export interface InlineTask {
  /** Task number within story (1-based) */
  number: number;

  /** Task name/title */
  name: string;

  /** Goal/outcome of the task */
  goal: string;

  /** Current status */
  status: TaskStatus;

  /** Estimated hours */
  estimate_hrs?: number;

  /** Description/notes */
  description?: string;
}

/**
 * Story entity - deliverable unit of work.
 * Contains inline Tasks or references standalone Tasks.
 */
export interface Story extends EntityBase {
  type: 'story';
  id: StoryId;
  status: StoryStatus;

  /** Effort type */
  effort: Effort;

  /** Priority level */
  priority: Priority;

  /** Parent milestone ID */
  parent?: MilestoneId;

  /** IDs of entities this depends on (stories, decisions) */
  depends_on: EntityId[];

  /** Document IDs this story implements */
  implements?: DocumentId[];

  /** Outcome description */
  outcome?: string;

  /** Acceptance criteria */
  acceptance_criteria?: string[];

  /** Inline tasks (embedded in story file) */
  tasks?: InlineTask[];

  /** Notes section */
  notes?: string;
}

// =============================================================================
// Task Interface (Standalone)
// =============================================================================

/**
 * Standalone Task entity - atomic work item.
 * Can exist independently or be linked to a Story.
 */
export interface Task extends EntityBase {
  type: 'task';
  id: TaskId;
  status: TaskStatus;

  /** Parent story ID */
  parent?: StoryId;

  /** IDs of decisions this task depends on */
  depends_on?: DecisionId[];

  /** Goal/outcome of the task */
  goal: string;

  /** Estimated hours */
  estimate_hrs?: number;

  /** Actual hours spent */
  actual_hrs?: number;

  /** Assigned person */
  assignee?: string;

  /** Description */
  description?: string;

  /** Technical notes */
  technical_notes?: string;

  /** Notes section */
  notes?: string;
}



// =============================================================================
// Decision Interface
// =============================================================================

/**
 * Decision entity - architectural or design decision.
 * Can be linked to Documents and Stories.
 */
export interface Decision extends EntityBase {
  type: 'decision';
  id: DecisionId;
  status: DecisionStatus;

  /** Context/background for the decision */
  context?: string;

  /** The actual decision made */
  decision?: string;

  /** Rationale for the decision */
  rationale?: string;

  /** Alternatives considered */
  alternatives?: string[];

  /** Person who made the decision */
  decided_by?: string;

  /** Date decision was made */
  decided_on?: ISODateTime;

  /** Previous decision this supersedes */
  supersedes?: DecisionId;

  /** Entities this decision enables */
  enables?: EntityId[];
}

// =============================================================================
// Document Interface
// =============================================================================

/**
 * Document entity - specification, ADR, guide, or research document.
 * Can be implemented by Stories.
 */
export interface Document extends EntityBase {
  type: 'document';
  id: DocumentId;
  status: DocumentStatus;

  /** Type of document */
  doc_type: DocumentType;

  /** Version string */
  version?: string;

  /** Document owner */
  owner?: string;

  /** Decisions this document depends on */
  depends_on?: DecisionId[];

  /** Implementation context/notes */
  implementation_context?: string;

  /** Stories or Milestones that implement this document */
  implemented_by?: (StoryId | MilestoneId)[];

  /** Previous versions of this document */
  previous_versions?: DocumentId[];

  /** Document content (markdown) */
  content?: string;
}

// =============================================================================
// Union Types for Full Entities
// =============================================================================

/** Union of all full entity types */
export type Entity = Milestone | Story | Task | Decision | Document;

// =============================================================================
// EntityMetadata Interface (Lightweight for Index)
// =============================================================================

/**
 * Lightweight metadata for entity indexing.
 * Used in the primary index for O(1) lookups.
 */
export interface EntityMetadata {
  /** Entity ID */
  id: EntityId;

  /** Entity type */
  type: EntityType;

  /** Display title */
  title: string;

  /** Workstream */
  workstream: string;

  /** Current status */
  status: EntityStatus;

  /** Whether archived */
  archived: boolean;

  /** Whether currently in progress */
  in_progress: boolean;

  /** Parent entity ID (if any) */
  parent_id?: EntityId;

  /** Number of child entities */
  children_count: number;

  /** Priority (if applicable) */
  priority?: Priority;

  /** Effort type (if applicable) */
  effort?: Effort;

  /** Canvas source path */
  canvas_source: CanvasPath;

  /** Vault path to entity file */
  vault_path: VaultPath;

  /** Last update timestamp */
  updated_at: ISODateTime;

  /** File modification time (for cache invalidation) */
  file_mtime: number;
}


// =============================================================================
// Error Types
// =============================================================================

/** Base MCP error class */
export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

/** Entity not found error */
export class NotFoundError extends MCPError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

/** Validation error */
export class ValidationError extends MCPError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

/** Conflict error (e.g., duplicate ID) */
export class ConflictError extends MCPError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

/** Invalid state transition error */
export class StateTransitionError extends MCPError {
  constructor(message: string) {
    super(message, 'INVALID_STATE_TRANSITION', 400);
  }
}

/** File operation error */
export class FileOperationError extends MCPError {
  constructor(
    message: string,
    public operation: string,
    public path: string
  ) {
    super(message, 'FILE_OPERATION_ERROR', 500);
    this.name = 'FileOperationError';
  }
}

// =============================================================================
// Configuration Types
// =============================================================================

/** Workspace configuration */
export interface WorkspaceConfig {
  path: string;
  description: string;
}

/** V2 Configuration */
export interface V2Config {
  /** Path to Obsidian vault */
  vaultPath: string;

  /** Folder for active entities */
  entitiesFolder: string;

  /** Folder for archived entities */
  archiveFolder: string;

  /** Folder for canvas files */
  canvasFolder: string;

  /** Default canvas file */
  defaultCanvas: string;

  /** Workspace configurations */
  workspaces: Record<string, WorkspaceConfig>;
}

// =============================================================================
// Canvas Types
// =============================================================================

/** Canvas node types */
export interface CanvasNode {
  id: string;
  type: 'file' | 'text' | 'link' | 'group';
  file?: string;
  text?: string;
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  /** Label for group nodes */
  label?: string;
  styleAttributes?: {
    textAlign?: 'left' | 'center' | 'right';
  };
}

/** Canvas edge types */
export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

/** Canvas file structure */
export interface CanvasFile {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// =============================================================================
// Operation Result Types
// =============================================================================

/** Result of a create operation */
export interface CreateResult<T extends Entity> {
  success: true;
  entity: T;
  message: string;
}

/** Result of an update operation */
export interface UpdateResult<T extends Entity> {
  success: true;
  entity: T;
  changes: string[];
  message: string;
}

/** Result of a delete/archive operation */
export interface ArchiveResult {
  success: true;
  id: EntityId;
  archived_path: VaultPath;
  message: string;
}

/** Error result */
export interface ErrorResult {
  success: false;
  error: string;
  code: string;
}

/** Union of all operation results */
export type OperationResult<T extends Entity> =
  | CreateResult<T>
  | UpdateResult<T>
  | ArchiveResult
  | ErrorResult;
