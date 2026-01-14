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

// Utility tool definitions (cast to Tool[] to handle type literal compatibility)
export const utilityToolDefinitions: Tool[] = [
  readDocsDefinition as Tool,
  updateDocDefinition as Tool,
  listWorkspacesDefinition as Tool,
  listFilesDefinition as Tool,
];

// Entity tool definitions (non-prefixed)
export const entityToolDefinitions: Tool[] = [
  // Category 1: Entity Management
  {
    name: 'create_entity',
    description: 'Create a new entity (milestone, story, task, decision, document, or feature) with optional dependencies and relationships.',
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
    description: 'Update entity fields, status, relationships, or archive/restore. All bidirectional relationships auto-sync: parent↔children, depends_on↔blocks, implements↔implemented_by, supersedes↔superseded_by, previous_version↔next_version.',
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
    description: 'Unified batch operation for create, update, and archive. Supports client_id for idempotency and cross-referencing within the batch. All bidirectional relationships auto-sync.',
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
          },
        },
      },
      required: ['ops'],
    },
  },

  // Category 3: Project Understanding
  {
    name: 'get_project_overview',
    description: 'Get high-level project status across all workstreams. Enhanced to support workstream filtering and grouping (consolidates get_workstream_status).',
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
    description: 'Deep analysis of project state with blockers and suggested actions.',
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
    description: 'Get feature coverage analysis showing implementation, documentation, and testing status for features.',
    inputSchema: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['MVP', '0', '1', '2', '3', '4', '5'], description: 'Filter by implementation phase' },
        tier: { type: 'string', enum: ['OSS', 'Premium'], description: 'Filter by feature tier' },
        include_tests: { type: 'boolean', description: 'Include test coverage analysis' },
      },
    },
  },

  // Category 4: Search & Navigation
  {
    name: 'search_entities',
    description: 'Search, list, or navigate entities. Three modes: (1) SEARCH: provide query for full-text search, (2) NAVIGATE: provide from_id+direction to traverse hierarchy, (3) LIST: provide only filters (or nothing) to list all matching entities. Filters apply to all modes.',
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
        include_content: { type: 'boolean' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include in response (for controlling response size)',
        },
      },
    },
  },
  {
    name: 'get_entity',
    description: 'Get entity with selective field retrieval. Control response size by specifying only needed fields. Default returns summary fields (id, type, title, status, workstream, last_updated).',
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
              'parent', 'children_count', 'content', 'effort', 'priority',
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

  // Category 5: Decision & Document Management
  {
    name: 'manage_documents',
    description: 'Consolidated tool for document and decision management. Use action to specify operation: get_decision_history, supersede_document, get_document_history, or check_freshness.',
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
    description: 'Reconcile all bidirectional relationships across entities. Syncs: parent↔children, depends_on↔blocks, implements↔implemented_by, supersedes↔superseded_by, previous_version↔next_version. Run this to fix inconsistent relationships in existing documents.',
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'If true, only report what would be changed without making changes', default: false },
      },
      required: [],
    },
  },
];

// All tool definitions combined
export const allToolDefinitions: Tool[] = [
  ...utilityToolDefinitions,
  ...entityToolDefinitions,
];
