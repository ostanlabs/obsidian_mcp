/**
 * Tools Index
 *
 * Exports all tool definitions and handlers.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// Utility Tool Exports
// =============================================================================

export {
  readDocsDefinition,
  handleReadDocs,
  type ReadDocsInput,
} from './read-docs.js';

export {
  updateDocDefinition,
  handleUpdateDoc,
  type UpdateDocInput,
} from './update-doc.js';

export {
  listWorkspacesDefinition,
  handleListWorkspaces,
  type ListWorkspacesInput,
} from './list-workspaces.js';

export {
  listFilesDefinition,
  handleListFiles,
  type ListFilesInput,
} from './list-files.js';

export {
  manageWorkspacesDefinition,
  handleManageWorkspaces,
  type ManageWorkspacesInput,
} from './manage-workspaces.js';

// =============================================================================
// Entity Tool Exports
// =============================================================================

export * from './entity-management-tools.js';
export * from './batch-operations-tools.js';
export * from './project-understanding-tools.js';
export * from './search-navigation-tools.js';
export * from './decision-document-tools.js';
export * from './tool-types.js';

// =============================================================================
// Tool Definitions for MCP Registration
// =============================================================================

import { readDocsDefinition } from './read-docs.js';
import { updateDocDefinition } from './update-doc.js';
import { listWorkspacesDefinition } from './list-workspaces.js';
import { listFilesDefinition } from './list-files.js';
import { manageWorkspacesDefinition } from './manage-workspaces.js';

// Utility tool definitions (cast to Tool[] to handle type literal compatibility)
export const utilityToolDefinitions: Tool[] = [
  readDocsDefinition as Tool,
  updateDocDefinition as Tool,
  listWorkspacesDefinition as Tool,
  listFilesDefinition as Tool,
  manageWorkspacesDefinition as Tool,
];

// Entity tool definitions (non-prefixed)
export const entityToolDefinitions: Tool[] = [
  // Category 1: Entity Management
  {
    name: 'create_entity',
    description: `Create a new entity (milestone, story, task, decision, document, or feature).

USE FOR: Creating new work items, decisions, or documentation.
NOT FOR: Bulk creation (use batch_update), updating existing entities (use update_entity).

EXAMPLES:
- "Create a new milestone for Q1 planning"
- "Add a task to implement authentication"
- "Record a decision about database choice"`,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'], description: 'Entity type to create' },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Entity title' },
            workstream: { type: 'string', description: 'Workstream identifier' },
            parent: { type: 'string', description: 'Parent entity ID. Story: MilestoneId. Task: StoryId. Auto-syncs children on parent.' },
            depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs of entities this depends on. Auto-syncs blocks on target. Milestone: MilestoneId|DecisionId. Story: any EntityId. Task: DecisionId only.' },
            blocks: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this entity blocks (auto-syncs depends_on on target)' },
            implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs this entity implements (milestone, story). Auto-syncs implemented_by on document.' },
            supersedes: { type: 'string', description: 'Decision ID this supersedes (decision only). Auto-syncs superseded_by on target.' },
            previous_version: { type: 'string', description: 'Document ID of previous version (document only). Auto-syncs next_version on target.' },
          },
          required: ['title', 'workstream'],
        },
        options: {
          type: 'object',
          properties: {
            canvas_source: { type: 'string', description: 'Canvas file path' },
            add_to_canvas: { type: 'boolean', description: 'Whether to add to canvas' },
          },
        },
      },
      required: ['type', 'data'],
    },
  },
  {
    name: 'update_entity',
    description: `Update a single entity's fields, status, relationships, or archive/restore it.

USE FOR: Modifying one entity, changing status, adding/removing relationships, archiving.
NOT FOR: Bulk updates (use batch_update), creating new entities (use create_entity).

FEATURES:
- Returns before/after diff in 'changes' array showing what changed
- All bidirectional relationships auto-sync (parent↔children, depends_on↔blocks, etc.)
- Can archive (archived: true) or restore (archived: false) in same call

EXAMPLES:
- "Update task T-001 status to Complete"
- "Add M-029 to F-010's implemented_by list"
- "Archive milestone M-005 and its children"`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to update' },
        data: { type: 'object', description: 'Fields to update. Relationship fields auto-sync their reverse.' },
        add_dependencies: { type: 'array', items: { type: 'string' }, description: 'Dependencies to add (auto-syncs blocks on target). Milestone: MilestoneId|DecisionId. Story: any EntityId. Task: DecisionId only.' },
        remove_dependencies: { type: 'array', items: { type: 'string' }, description: 'Dependencies to remove' },
        add_to: {
          type: 'object',
          properties: {
            implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs to add to implements (auto-syncs implemented_by on document)' },
            blocks: { type: 'array', items: { type: 'string' }, description: 'Entity IDs to add to blocks (auto-syncs depends_on on target)' },
          },
          description: 'Add to array fields',
        },
        remove_from: {
          type: 'object',
          properties: {
            implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs to remove from implements' },
            blocks: { type: 'array', items: { type: 'string' }, description: 'Entity IDs to remove from blocks' },
          },
          description: 'Remove from array fields',
        },
        // Enhanced: Status update (replaces update_entity_status)
        status: { type: 'string', description: 'New status (replaces update_entity_status)' },
        status_note: { type: 'string', description: 'Optional note about the status change' },
        cascade: { type: 'boolean', description: 'Whether to cascade status changes to related entities' },
        // Enhanced: Archive/restore (replaces archive_entity, archive_milestone, restore_from_archive)
        archived: { type: 'boolean', description: 'Set to true to archive, false to restore' },
        archive_options: {
          type: 'object',
          properties: {
            force: { type: 'boolean', description: 'Archive even if entity has children' },
            cascade: { type: 'boolean', description: 'Archive children too (for milestones)' },
            archive_folder: { type: 'string', description: 'Custom archive folder path' },
            remove_from_canvas: { type: 'boolean', description: 'Remove from canvas when archiving' },
            canvas_source: { type: 'string', description: 'Canvas file path' },
          },
          description: 'Options for archive operation',
        },
        restore_options: {
          type: 'object',
          properties: {
            restore_children: { type: 'boolean', description: 'Restore children as well' },
            add_to_canvas: { type: 'boolean', description: 'Add to canvas when restoring' },
            canvas_source: { type: 'string', description: 'Canvas file path' },
          },
          description: 'Options for restore operation',
        },
      },
      required: ['id'],
    },
  },
  // Category 2: Batch Operations

  // NEW: Unified batch_update tool with client_id support
  {
    name: 'batch_update',
    description: `Perform multiple create/update/archive operations in a single call.

USE FOR: Bulk operations, creating related entities together, batch status updates.
NOT FOR: Single entity changes (use update_entity for better diff output).

FEATURES:
- client_id for idempotency and cross-referencing within batch
- dry_run: true to preview changes without executing
- include_entities: true to get full entity data in response (avoids follow-up get_entity calls)
- Atomic mode: rollback all on any failure

EXAMPLES:
- "Create 5 features with their relationships in one call"
- "Update phase to '4' for features F-021 through F-029"
- "Preview what batch changes would do with dry_run: true"`,
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              client_id: { type: 'string', description: 'Client-provided ID for idempotency and cross-reference' },
              op: { type: 'string', enum: ['create', 'update', 'archive'], description: 'Operation type' },
              type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document'], description: 'Entity type (required for create)' },
              id: { type: 'string', description: 'Entity ID (required for update/archive)' },
              payload: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Entity title (for create)' },
                  workstream: { type: 'string', description: 'Workstream (for create)' },
                  parent: { type: 'string', description: 'Parent ID or client_id (auto-syncs children on parent)' },
                  depends_on: { type: 'array', items: { type: 'string' }, description: 'Dependency IDs or client_ids (auto-syncs blocks on target)' },
                  blocks: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this blocks (auto-syncs depends_on on target)' },
                  implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs this implements (auto-syncs implemented_by)' },
                  supersedes: { type: 'string', description: 'Decision ID this supersedes (auto-syncs superseded_by)' },
                  previous_version: { type: 'string', description: 'Document ID of previous version (auto-syncs next_version)' },
                  status: { type: 'string', description: 'New status (for update)' },
                  archived: { type: 'boolean', description: 'Archive flag (for archive)' },
                  cascade: { type: 'boolean', description: 'Archive children too (for archive)' },
                },
                description: 'Operation payload',
              },
            },
            required: ['client_id', 'op', 'payload'],
          },
          description: 'Array of operations to perform',
        },
        options: {
          type: 'object',
          properties: {
            atomic: { type: 'boolean', description: 'Rollback all on any failure (default: false)' },
            add_to_canvas: { type: 'boolean', description: 'Add created entities to canvas' },
            canvas_source: { type: 'string', description: 'Canvas file path' },
            include_entities: { type: 'boolean', description: 'Include full entity data in results (default: false). Eliminates need for follow-up get_entity calls.' },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description: 'Fields to include when include_entities is true. If not specified, returns all fields.',
            },
            dry_run: { type: 'boolean', description: 'Preview changes without executing them (default: false). Returns would_update array with predicted changes.' },
          },
        },
      },
      required: ['ops'],
    },
  },

  // Category 3: Project Understanding
  {
    name: 'get_project_overview',
    description: `Get high-level project status summary across workstreams.

USE FOR: Dashboard views, overall progress checks, workstream summaries.
NOT FOR: Searching entities (use search_entities), feature coverage (use get_feature_coverage).

EXAMPLES:
- "What's the overall project status?"
- "Show me the engineering workstream progress"
- "How many tasks are blocked across all workstreams?"`,
    inputSchema: {
      type: 'object',
      properties: {
        include_completed: { type: 'boolean', description: 'Include completed items' },
        include_archived: { type: 'boolean', description: 'Include archived items' },
        canvas_source: { type: 'string', description: 'Filter by canvas source' },
        // Enhanced: workstream filtering (from get_workstream_status)
        workstream: { type: 'string', description: 'Filter by specific workstream. When specified, returns detailed workstream info in workstream_detail field.' },
        // Enhanced: grouping (from get_workstream_status)
        group_by: { type: 'string', enum: ['status', 'type', 'priority'], description: 'Group entities by this field (only used when workstream is specified)' },
      },
    },
  },
  {
    name: 'analyze_project_state',
    description: `Deep analysis of project state identifying blockers and suggesting actions.

USE FOR: Finding blockers, getting actionable recommendations, understanding what's stuck.
NOT FOR: Simple status checks (use get_project_overview), listing entities (use search_entities).

EXAMPLES:
- "What's blocking progress in the engineering workstream?"
- "What actions should I take next?"
- "Give me a detailed blocker analysis"`,
    inputSchema: {
      type: 'object',
      properties: {
        workstream: { type: 'string', description: 'Filter by workstream (optional)' },
        focus: { type: 'string', enum: ['blockers', 'actions', 'both'] },
        depth: { type: 'string', enum: ['summary', 'detailed'] },
      },
    },
  },
  {
    name: 'get_feature_coverage',
    description: `Analyze feature implementation, documentation, and test coverage.

USE FOR: Coverage reports, gap analysis, roadmap planning, finding undocumented features.
NOT FOR: Text search (use search_entities), general entity queries (use search_entities).

EFFICIENCY TIPS:
- summary_only: true - Get counts without feature details (~90% smaller response)
- feature_ids: [...] - Filter to specific features
- fields: [...] - Return only needed fields per feature

EXAMPLES:
- "How many features have documentation?" → summary_only: true
- "What Phase 4 features are missing implementation?" → phase: "4"
- "Show coverage for F-001 and F-002 only" → feature_ids: ["F-001", "F-002"]`,
    inputSchema: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['MVP', '0', '1', '2', '3', '4', '5'], description: 'Filter by implementation phase' },
        tier: { type: 'string', enum: ['OSS', 'Premium'], description: 'Filter by feature tier' },
        include_tests: { type: 'boolean', description: 'Include test coverage analysis' },
        summary_only: { type: 'boolean', description: 'Return only summary without features array. Significantly reduces response size.' },
        feature_ids: { type: 'array', items: { type: 'string' }, description: 'Filter to specific feature IDs' },
        fields: {
          type: 'array',
          items: { type: 'string', enum: ['id', 'title', 'tier', 'phase', 'status', 'implementation', 'documentation', 'testing'] },
          description: 'Fields to include in each feature. If not specified, returns all fields.',
        },
      },
    },
  },

  // Category 4: Search & Navigation
  {
    name: 'search_entities',
    description: `Search, list, or navigate entities with filtering and pagination.

USE FOR: Finding entities by text, listing by type/status, traversing relationships.
NOT FOR: Coverage analysis (use get_feature_coverage), project overview (use get_project_overview).

THREE MODES:
1. SEARCH: query="authentication" - Full-text search
2. NAVIGATE: from_id="M-001", direction="down" - Traverse hierarchy
3. LIST: filters={type:["task"], status:["Blocked"]} - List matching entities

PAGINATION: Use limit + offset for large result sets.

EXAMPLES:
- "Find entities mentioning 'authentication'" → query: "authentication"
- "List all blocked tasks" → filters: {type: ["task"], status: ["Blocked"]}
- "Get children of milestone M-001" → from_id: "M-001", direction: "down"`,
    inputSchema: {
      type: 'object',
      properties: {
        // Search mode
        query: { type: 'string', description: 'Full-text search query (search mode)' },
        // Navigation mode (from navigate_hierarchy)
        from_id: { type: 'string', description: 'Starting entity ID (navigation mode)' },
        direction: { type: 'string', enum: ['up', 'down', 'siblings', 'dependencies'], description: 'Navigation direction (navigation mode)' },
        depth: { type: 'number', description: 'How many levels to traverse (navigation mode, default: 1)' },
        // Filters (apply to all modes)
        filters: {
          type: 'object',
          description: 'Filters apply to all modes. In list mode, can be used alone to get all entities matching criteria.',
          properties: {
            type: { type: 'array', items: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'] } },
            status: { type: 'array', items: { type: 'string' } },
            workstream: { type: 'array', items: { type: 'string' } },
            archived: { type: 'boolean', description: 'Include archived entities (default: false)' },
          },
        },
        // Response control
        limit: { type: 'number', description: 'Max results to return (default: 50)' },
        offset: { type: 'number', description: 'Number of results to skip for pagination (default: 0)' },
        include_content: { type: 'boolean' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include in response. Default: [id, type, title, status, workstream]. Available: id, type, title, status, workstream, last_updated, parent, priority, phase, tier',
        },
      },
    },
  },
  {
    name: 'get_entity',
    description: `Get a single entity by ID with selective field retrieval.

USE FOR: Fetching one entity's details, verifying an update, getting specific fields.
NOT FOR: Multiple entities (use get_entities), searching (use search_entities).

TIP: Specify fields to reduce response size. Default returns summary fields only.

EXAMPLES:
- "Get task T-001 details" → id: "T-001"
- "Get F-001's documentation status" → id: "F-001", fields: ["id", "documented_by"]`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID' },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'id', 'type', 'title', 'status', 'workstream', 'last_updated',
              'parent', 'children_count', 'content', 'priority',
              'dependencies', 'dependency_details', 'task_progress',
              'acceptance_criteria', 'children', 'implementation_context'
            ],
          },
          description: 'Fields to include in response. If not specified, returns summary fields.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_entities',
    description: `Get multiple entities in a single call (bulk fetch).

USE FOR: Fetching 2+ entities at once, verifying batch updates, efficient bulk retrieval.
NOT FOR: Single entity (use get_entity), searching (use search_entities).

EFFICIENCY: ~75% token savings vs multiple get_entity calls.

EXAMPLES:
- "Get features F-001 through F-005" → ids: ["F-001", "F-002", "F-003", "F-004", "F-005"]
- "Verify these entities exist" → ids: [...], fields: ["id", "title"]`,
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of entity IDs to retrieve',
        },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'id', 'type', 'title', 'status', 'workstream', 'last_updated',
              'parent', 'children_count', 'content', 'priority',
              'dependencies', 'dependency_details', 'task_progress',
              'acceptance_criteria', 'children', 'implementation_context',
              'documents', 'documented_by', 'implemented_by', 'decided_by',
              'test_refs', 'user_story', 'tier', 'phase'
            ],
          },
          description: 'Fields to include in response. If not specified, returns summary fields.',
        },
      },
      required: ['ids'],
    },
  },

  // Category 5: Decision & Document Management
  {
    name: 'manage_documents',
    description: `Manage documents and decisions: history, versioning, freshness checks.

USE FOR: Decision history, document versioning, checking if docs are stale.
NOT FOR: Creating documents (use create_entity), updating content (use update_entity).

ACTIONS:
- get_decision_history: List decisions, optionally filtered by topic/workstream
- supersede_document: Create new version of a document based on a decision
- get_document_history: Get version history of a document
- check_freshness: Check if document is stale based on related decisions

EXAMPLES:
- "What decisions have we made about authentication?" → action: "get_decision_history", topic: "authentication"
- "Is DOC-001 up to date?" → action: "check_freshness", document_id: "DOC-001"`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_decision_history', 'supersede_document', 'get_document_history', 'check_freshness'],
          description: 'The action to perform',
        },
        // For get_decision_history
        topic: { type: 'string', description: 'Filter by topic keyword (for get_decision_history)' },
        workstream: { type: 'string', description: 'Filter by workstream (for get_decision_history)' },
        include_superseded: { type: 'boolean', description: 'Include superseded decisions (for get_decision_history)' },
        include_archived: { type: 'boolean', description: 'Include archived decisions (for get_decision_history, default: true)' },
        // For supersede_document, get_document_history, check_freshness
        document_id: { type: 'string', description: 'Document ID (for supersede_document, get_document_history, check_freshness)' },
        decision_id: { type: 'string', description: 'Decision ID (for supersede_document)' },
        new_content: { type: 'string', description: 'New document content (for supersede_document)' },
        change_summary: { type: 'string', description: 'Summary of changes (for supersede_document)' },
      },
      required: ['action'],
    },
  },

  // Category 6: Maintenance Tools
  {
    name: 'reconcile_relationships',
    description: `Fix inconsistent bidirectional relationships across all entities.

USE FOR: Fixing broken relationships, ensuring consistency after manual edits.
NOT FOR: Regular operations (relationships auto-sync on create/update).

SYNCS: parent↔children, depends_on↔blocks, implements↔implemented_by, supersedes↔superseded_by, previous_version↔next_version, documents↔documented_by

FEATURES:
- dry_run: true to preview changes without executing
- Returns detailed changes array showing what was fixed
- Returns warnings for references to non-existent entities

EXAMPLES:
- "Check for broken relationships" → dry_run: true
- "Fix all relationship inconsistencies" → dry_run: false`,
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'If true, only report what would be changed without making changes', default: false },
      },
      required: [],
    },
  },

  // Category 7: Schema Introspection
  {
    name: 'get_schema',
    description: `Get entity schema information without reading source code.

USE FOR: Learning field names, valid values, relationship definitions.
NOT FOR: Getting entity data (use get_entity), searching (use search_entities).

RETURNS: Field definitions, types, valid enum values, relationship info, status transitions.

EXAMPLES:
- "What fields does a feature have?" → entity_type: "feature"
- "Get all entity schemas" → (no params, returns all)
- "What relationships exist?" → relationships_only: true`,
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'],
          description: 'Entity type to get schema for. If not specified, returns all schemas.',
        },
        relationships_only: {
          type: 'boolean',
          description: 'If true, only return relationship definitions (not all fields)',
        },
      },
    },
  },
];

// All tool definitions combined
export const allToolDefinitions: Tool[] = [
  ...utilityToolDefinitions,
  ...entityToolDefinitions,
];
