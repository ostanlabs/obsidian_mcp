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
export * from './cleanup-tools.js';
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
  {
    name: 'rebuild_index',
    description: `Rebuild the in-memory entity index from scratch by re-scanning all vault files.

USE FOR: Fixing index inconsistencies, recovering from corrupted state, forcing a fresh scan.
NOT FOR: Normal operations (the index auto-updates via file watchers).

WHEN TO USE:
- Index seems out of sync with actual files
- After manual file operations outside the MCP server
- After recovering from errors
- When search results seem stale or incorrect

RETURNS:
- entities_before: Number of entities in index before rebuild
- entities_after: Number of entities in index after rebuild
- duration_ms: Time taken to rebuild in milliseconds`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  } as Tool,
];

// Entity tool definitions (non-prefixed)
export const entityToolDefinitions: Tool[] = [
  // ==========================================================================
  // V2 Unified Entity Tool
  // ==========================================================================
  {
    name: 'entity',
    description: `Unified tool for entity operations: create, get, or update.

ACTIONS:
- create: Create a new entity (milestone, story, task, decision, document, feature)
- get: Retrieve an entity with optional field selection and content modes
- update: Modify an entity's fields, status, relationships, or archive/restore

FLAT SCHEMA: Entity fields are at the top level (no nested 'data' object).

EXAMPLES:
- Create: { action: "create", type: "task", title: "Implement auth", workstream: "backend", parent: "S-001" }
- Get: { action: "get", id: "T-001", fields: ["content", "dependencies"] }
- Get with semantic: { action: "get", id: "DOC-001", content_mode: "semantic", query: "authentication" }
- Update: { action: "update", id: "T-001", status: "Complete" }
- Archive: { action: "update", id: "T-001", archived: true }

REQUIRED RELATIONSHIPS (for create):
- story: MUST have 'parent' (MilestoneId)
- task: MUST have 'parent' (StoryId)
- decision: MUST have at least one of 'affects' or 'blocks'`,
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'get', 'update'], description: 'Action to perform' },
        // For create (required)
        type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'], description: 'Entity type (required for create)' },
        // For get/update (required)
        id: { type: 'string', description: 'Entity ID (required for get/update)' },
        // Entity fields (flat)
        title: { type: 'string', description: 'Entity title' },
        workstream: { type: 'string', description: 'Workstream identifier' },
        parent: { type: 'string', description: 'Parent entity ID (required for story/task)' },
        depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs of entities this depends on' },
        blocks: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this entity blocks' },
        implements: { type: 'array', items: { type: 'string' }, description: 'Document/Feature IDs this implements' },
        enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this enables' },
        affects: { type: 'array', items: { type: 'string' }, description: 'Entity IDs affected (for decisions)' },
        status: { type: 'string', description: 'Entity status' },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'Priority level' },
        target_date: { type: 'string', description: 'Target date (ISO format)' },
        owner: { type: 'string', description: 'Owner/assignee' },
        outcome: { type: 'string', description: 'Expected outcome (story)' },
        notes: { type: 'string', description: 'Notes' },
        goal: { type: 'string', description: 'Task goal' },
        description: { type: 'string', description: 'Description' },
        technical_notes: { type: 'string', description: 'Technical notes (task)' },
        acceptance_criteria: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria (story)' },
        context: { type: 'string', description: 'Context (decision)' },
        decision: { type: 'string', description: 'Decision text (decision)' },
        rationale: { type: 'string', description: 'Rationale (decision)' },
        doc_type: { type: 'string', description: 'Document type' },
        version: { type: 'string', description: 'Version' },
        content: { type: 'string', description: 'Content (document/feature)' },
        user_story: { type: 'string', description: 'User story (feature)' },
        tier: { type: 'string', enum: ['OSS', 'Premium'], description: 'Feature tier' },
        phase: { type: 'string', enum: ['MVP', 'V1', 'V2', 'Future'], description: 'Feature phase' },
        estimated_hrs: { type: 'number', description: 'Estimated hours' },
        actual_hrs: { type: 'number', description: 'Actual hours' },
        // Relationship modifications (for update)
        add_dependencies: { type: 'array', items: { type: 'string' }, description: 'Add to depends_on' },
        remove_dependencies: { type: 'array', items: { type: 'string' }, description: 'Remove from depends_on' },
        add_to: { type: 'object', properties: { implements: { type: 'array', items: { type: 'string' } }, affects: { type: 'array', items: { type: 'string' } } }, description: 'Add to array fields' },
        remove_from: { type: 'object', properties: { implements: { type: 'array', items: { type: 'string' } }, affects: { type: 'array', items: { type: 'string' } } }, description: 'Remove from array fields' },
        // Archive/restore (for update)
        archived: { type: 'boolean', description: 'Set to true to archive, false to restore' },
        cascade: { type: 'boolean', description: 'Cascade archive/status to children' },
        force: { type: 'boolean', description: 'Force archive even with children' },
        // For get
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to include (for get)' },
        content_mode: { type: 'string', enum: ['none', 'full', 'semantic'], description: 'Content mode: none (default), full, or semantic' },
        query: { type: 'string', description: 'Query for semantic content (required when content_mode=semantic)' },
        // Response control
        return_full: { type: 'boolean', description: 'Return full entity (default: false)' },
        return_fields: { type: 'array', items: { type: 'string' }, description: 'Specific fields to return' },
        // Canvas options
        canvas_source: { type: 'string', description: 'Canvas file path' },
        add_to_canvas: { type: 'boolean', description: 'Add to canvas' },
      },
      required: ['action'],
    },
  },
  // V2 Unified entities tool (bulk operations)
  {
    name: 'entities',
    description: `Unified bulk operations tool. Fetch multiple entities or perform batch operations.

ACTIONS:
- get: Fetch multiple entities by IDs (more efficient than multiple entity calls)
- batch: Perform multiple create/update/archive operations in a single call

USE FOR:
- Fetching 2+ entities at once
- Batch status updates across multiple items
- Creating related entities together
- Any operation touching multiple entities

EXAMPLES:
- { action: "get", ids: ["M-001", "S-001", "T-001"] }
- { action: "batch", ops: [...], options: { dry_run: true } }`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'batch'],
          description: 'Action to perform',
        },
        // For 'get' action
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entity IDs to fetch (for get action)',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include in response (default: all)',
        },
        content_mode: {
          type: 'string',
          enum: ['none', 'full', 'semantic'],
          description: 'Content mode: none (default), full, or semantic',
        },
        query: {
          type: 'string',
          description: 'Query for semantic content extraction',
        },
        // For 'batch' action
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              client_id: { type: 'string', description: 'Client-provided ID for idempotency' },
              op: { type: 'string', enum: ['create', 'update', 'archive'], description: 'Operation type' },
              type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'], description: 'Entity type (for create)' },
              id: { type: 'string', description: 'Entity ID (for update/archive)' },
              payload: { type: 'object', description: 'Operation payload' },
            },
            required: ['client_id', 'op', 'payload'],
          },
          description: 'Operations to perform (for batch action)',
        },
        options: {
          type: 'object',
          properties: {
            atomic: { type: 'boolean', description: 'Rollback all on any failure' },
            add_to_canvas: { type: 'boolean', description: 'Add created entities to canvas' },
            canvas_source: { type: 'string', description: 'Canvas file path' },
            include_entities: { type: 'boolean', description: 'Include full entity data in results' },
            dry_run: { type: 'boolean', description: 'Preview changes without executing' },
            batch_size: { type: 'number', description: 'Batch size for chunking large operations' },
          },
          description: 'Options for batch action',
        },
      },
      required: ['action'],
    },
  },
  // Category 3: Project Understanding
  {
    name: 'get_project_overview',
    description: `Get high-level project status summary across workstreams.

USE FOR: Dashboard views, overall progress checks, workstream summaries.
NOT FOR: Searching entities (use search_entities), feature coverage (use get_feature_coverage).

INCLUDES: Validation summary (by default) showing relationship rule violations. Set include_validation: false to exclude.
For full validation details, use validate_project tool.

PAGINATION: Default max_items is 20 (conservative for smaller contexts). Agents with larger context windows can increase max_items up to 200.

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
        // Validation
        include_validation: { type: 'boolean', description: 'Include validation summary in response. Default: true. Set false to reduce response size.' },
        // Pagination
        max_items: { type: 'number', description: 'Maximum items per group (default: 20, max: 200). Increase for larger context windows.' },
        max_response_size: { type: 'number', description: 'Optional hard cap on response size in bytes.' },
        continuation_token: { type: 'string', description: 'Token from previous response to get next page.' },
      },
    },
  },
  {
    name: 'analyze_project_state',
    description: `Deep analysis of project state identifying blockers and suggesting actions.

USE FOR: Finding blockers, getting actionable recommendations, understanding what's stuck.
NOT FOR: Simple status checks (use get_project_overview), listing entities (use search_entities).

FIELDS PARAMETER: Use 'fields' to request only specific sections and reduce response size.
Available fields: health, blockers, critical_path, pending_decisions, incomplete_specs, stale_items, suggested_actions, stats

PAGINATION: Default max_items is 20 (conservative for smaller contexts). Agents with larger context windows can increase max_items up to 200.

EXAMPLES:
- "What's blocking progress?" → { fields: ["critical_path", "stats"] }
- "What actions should I take?" → { fields: ["suggested_actions"] }
- "Quick health check" → { fields: ["health", "stats"] }
- "Full analysis" → {} (no fields = all fields)`,
    inputSchema: {
      type: 'object',
      properties: {
        workstream: { type: 'string', description: 'Filter by workstream (optional)' },
        focus: { type: 'string', enum: ['blockers', 'actions', 'both'] },
        depth: { type: 'string', enum: ['summary', 'detailed'] },
        fields: {
          type: 'array',
          items: { type: 'string', enum: ['health', 'blockers', 'critical_path', 'pending_decisions', 'incomplete_specs', 'stale_items', 'suggested_actions', 'stats'] },
          description: 'Fields to include in response. If not specified, returns all fields. Use to reduce response size.',
        },
        // Pagination
        max_items: { type: 'number', description: 'Maximum blockers to return (default: 20, max: 200). Increase for larger context windows.' },
        max_response_size: { type: 'number', description: 'Optional hard cap on response size in bytes.' },
        continuation_token: { type: 'string', description: 'Token from previous response to get next page.' },
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
  {
    name: 'validate_project',
    description: `Validate project entities against relationship rules.

USE FOR: Finding missing relationships, ensuring entities are properly connected.
NOT FOR: General status checks (use get_project_overview).

NOTE: get_project_overview includes a validation summary by default. Use this tool for full details.

RULES CHECKED:
- DOC_REQUIRES_IMPLEMENTATION: Documents should have implementing stories/tasks
- DEC_REQUIRES_DOCUMENT: Decisions should block at least one document
- FEATURE_REQUIRES_COVERAGE: Features should have implementation or documentation coverage

EXAMPLES:
- "Are there any orphaned documents?" → {}
- "Validate backend workstream" → { workstream: "backend" }
- "Check only decisions" → { entity_types: ["decision"] }`,
    inputSchema: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific rule IDs. If not specified, checks all enabled rules.',
        },
        workstream: { type: 'string', description: 'Filter by workstream' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'] },
          description: 'Filter to specific entity types',
        },
        include_archived: { type: 'boolean', description: 'Include archived entities. Default: false.' },
        severity_filter: {
          type: 'string',
          enum: ['all', 'error', 'warning'],
          description: 'Filter violations by severity. Default: all.',
        },
      },
    },
  },

  // Category 4: Search & Navigation
  {
    name: 'search_entities',
    description: `Search, list, or navigate structured project entities in the user's Obsidian vault.

ENTITIES vs WORKSPACES: This tool searches project entities (milestones, stories, tasks, decisions, documents, features).
To read FULL CONTENT of an entity, use the 'entities' tool with action="get" and content_mode="full", NOT read_docs.
The read_docs tool is for workspace documents, not for entities returned by search_entities.

USE FOR: Finding entities by text, listing by type/status, traversing relationships.
NOT FOR: Coverage analysis (use get_feature_coverage), project overview (use get_project_overview).

FOUR MODES:
1. SEMANTIC SEARCH: query="authentication", semantic=true - Hybrid vector + keyword search (best for natural language queries)
2. SEARCH: query="authentication" - Full-text BM25 search (keyword matching)
3. NAVIGATE: from_id="M-001", direction="down" - Traverse hierarchy
4. LIST: filters={type:["task"], status:["Blocked"]} - List matching entities

WORKFLOW: search_entities → entities(action="get", ids=[...], content_mode="full") to get full content

EXCLUDED BY DEFAULT: Archived milestones/stories/tasks and superseded decisions/documents are excluded. Features are always included. Use filters.archived=true to include archived, or filters.include_superseded=true for superseded.

PAGINATION: Default max_items is 20 (conservative for smaller contexts). Agents with larger context windows can increase max_items up to 200.

EXAMPLES:
- "Find entities about authentication" → query: "authentication", semantic: true
- "List all blocked tasks" → filters: {type: ["task"], status: ["Blocked"]}
- "Get children of milestone M-001" → from_id: "M-001", direction: "down"
- "Find orphaned stories" → filters: {type: ["story"], orphaned: true}`,
    inputSchema: {
      type: 'object',
      properties: {
        // Search mode
        query: { type: 'string', description: 'Search query (search mode)' },
        semantic: { type: 'boolean', description: 'Use semantic (hybrid vector + keyword) search instead of BM25. Better for natural language queries. Default: false' },
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
            archived: { type: 'boolean', description: 'Include archived milestones/stories/tasks. Default: false (excluded).' },
            include_superseded: { type: 'boolean', description: 'Include superseded decisions/documents. Default: false (excluded).' },
            orphaned: { type: 'boolean', description: 'Find orphaned entities. Stories/tasks: missing parent. Decisions: empty affects. Documents/features: empty implemented_by.' },
            valid: { type: 'boolean', description: 'Filter by validation status. Decisions have rules: max 1 doc, 3 stories/tasks/features (same milestone), 2 milestones; no cross-workstream. Other entities always valid.' },
          },
        },
        // Pagination (new)
        max_items: { type: 'number', description: 'Maximum results to return (default: 20, max: 200). Increase for larger context windows.' },
        max_response_size: { type: 'number', description: 'Optional hard cap on response size in bytes.' },
        continuation_token: { type: 'string', description: 'Token from previous response to get next page.' },
        // Legacy pagination (deprecated, use max_items/continuation_token instead)
        limit: { type: 'number', description: 'DEPRECATED: Use max_items instead. Max results to return.' },
        offset: { type: 'number', description: 'DEPRECATED: Use continuation_token instead. Number of results to skip.' },
        // Incremental sync
        since: { type: 'string', description: 'ISO timestamp. Only return entities updated after this time. Use with etag/latest_update for incremental sync.' },
        // Response control
        include_content: { type: 'boolean' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include in response. Default: [id, type, title, status, workstream]. Available: id, type, title, status, workstream, last_updated, parent, priority, phase, tier',
        },
      },
    },
  },
  // Category 5: Decision & Document Management
  {
    name: 'manage_documents',
    description: `Manage documents and decisions: history, versioning, freshness checks.

USE FOR: Decision history, document versioning, checking if docs are stale.
NOT FOR: Creating documents (use entity with action: "create"), updating content (use entity with action: "update").

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
NOT FOR: Getting entity data (use entity with action: "get"), searching (use search_entities).

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

  // Category 8: Cleanup Operations
  {
    name: 'cleanup_completed',
    description: `Archive completed stories/tasks under completed milestones.
Also archives orphaned completed stories/tasks (those without a valid parent).
Milestones, decisions, and documents are NOT archived.

USE FOR: Archiving completed work, cleaning up the canvas, end-of-milestone housekeeping.
NOT FOR: Archiving individual entities (use entity with action: "update" and archived: true).

FLOW:
1. Find completed milestones (all or specific one)
2. For each completed milestone, find all stories and tasks
3. If any are Blocked, return them for confirmation (fail-safe)
4. Mark non-completed stories/tasks as Completed
5. Re-link any decisions/documents from stories/tasks to the milestone
6. Archive stories/tasks (NOT milestones)
7. Remove archived items from default canvas
8. Return summary with counts of completed, archived, and re-linked items

BLOCKED ITEMS: If stories/tasks are Blocked, the tool returns requires_confirmation with the list.
Call again with confirmed_blockers containing the IDs to proceed.

RE-LINKING: When archiving a story/task that has decisions (affects), documents (implemented_by),
or features (implemented_by) linked to it, those links are updated to point to the milestone instead,
preventing orphaned references.

ORPHANED ENTITIES: When processing all milestones (no milestone_id), also archives completed
stories/tasks that have no parent or whose parent doesn't exist. If archiving these would leave
decisions/documents/features without any references (orphaned), returns requires_confirmation
with would_orphan info. Call again with include_orphaned: true to proceed anyway.

EXAMPLES:
- "Clean up all completed milestones" → {}
- "Preview cleanup" → dry_run: true
- "Clean up milestone M-001" → milestone_id: "M-001"
- "Confirm blocked items resolved" → confirmed_blockers: ["T-005", "S-003"]
- "Proceed with orphaning" → include_orphaned: true`,
    inputSchema: {
      type: 'object',
      properties: {
        milestone_id: {
          type: 'string',
          description: 'Optional milestone ID to clean up. If not provided, processes all completed milestones.',
        },
        confirmed_blockers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of blocked entity IDs that user confirms are resolved. Required if previous call returned requires_confirmation.',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, preview what would be archived without making changes. Default: false',
        },
        include_orphaned: {
          type: 'boolean',
          description: 'If true, proceed with archiving even if it would orphan decisions/documents/features. Required if previous call returned requires_confirmation with would_orphan. Default: false',
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
