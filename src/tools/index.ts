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
export * from './implementation-handoff-tools.js';
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
    description: 'Create a new entity (milestone, story, task, decision, or document) with optional dependencies and relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document'], description: 'Entity type to create' },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Entity title' },
            workstream: { type: 'string', description: 'Workstream identifier' },
            parent: { type: 'string', description: 'Parent entity ID (optional)' },
            depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs of entities this depends on. Milestone: MilestoneId|DecisionId. Story: any EntityId. Task: DecisionId only.' },
            implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs this entity implements (for milestone, story)' },
            enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this decision enables (for decision only)' },
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
    description: 'Update entity fields, status, relationships, or archive/restore. Consolidates update_entity_status, archive_entity, archive_milestone, restore_from_archive.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to update' },
        data: { type: 'object', description: 'Fields to update' },
        add_dependencies: { type: 'array', items: { type: 'string' }, description: 'Dependencies to add. Milestone: MilestoneId|DecisionId. Story: any EntityId. Task: DecisionId only.' },
        remove_dependencies: { type: 'array', items: { type: 'string' }, description: 'Dependencies to remove' },
        add_to: {
          type: 'object',
          properties: {
            implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs to add to implements (for milestone, story)' },
            enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs to add to enables (for decision)' },
          },
          description: 'Add to array fields',
        },
        remove_from: {
          type: 'object',
          properties: {
            implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs to remove from implements' },
            enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs to remove from enables' },
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
  // DEPRECATED: Use update_entity with status field instead
  {
    name: 'update_entity_status',
    description: '[DEPRECATED: Use update_entity with status field] Update entity status with optional note and cascade.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID' },
        status: { type: 'string', description: 'New status' },
        note: { type: 'string', description: 'Optional note about the status change' },
        cascade: { type: 'boolean', description: 'Whether to cascade status changes to related entities' },
      },
      required: ['id', 'status'],
    },
  },
  // DEPRECATED: Use update_entity with archived: true instead
  {
    name: 'archive_entity',
    description: '[DEPRECATED: Use update_entity with archived: true] Archive a single entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to archive' },
        force: { type: 'boolean', description: 'Force archive even if entity has children' },
      },
      required: ['id'],
    },
  },
  // DEPRECATED: Use update_entity with archived: true, archive_options.cascade: true instead
  {
    name: 'archive_milestone',
    description: '[DEPRECATED: Use update_entity with archived: true, archive_options.cascade: true] Archive a milestone and all its children (stories, tasks).',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'string', description: 'Milestone ID to archive' },
        archive_folder: { type: 'string', description: 'Custom archive folder path' },
      },
      required: ['milestone_id'],
    },
  },
  // DEPRECATED: Use update_entity with archived: false instead
  {
    name: 'restore_from_archive',
    description: '[DEPRECATED: Use update_entity with archived: false] Restore an archived entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to restore' },
        restore_children: { type: 'boolean', description: 'Whether to restore children as well' },
      },
      required: ['id'],
    },
  },

  // Category 2: Batch Operations

  // NEW: Unified batch_update tool with client_id support
  {
    name: 'batch_update',
    description: 'Unified batch operation for create, update, and archive. Supports client_id for idempotency and cross-referencing within the batch.',
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
                  parent: { type: 'string', description: 'Parent ID or client_id (for create)' },
                  depends_on: { type: 'array', items: { type: 'string' }, description: 'Dependency IDs or client_ids' },
                  implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs this implements' },
                  enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this enables (for decisions)' },
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

  // DEPRECATED: Use batch_update instead
  {
    name: 'batch_operations',
    description: 'DEPRECATED: Use batch_update instead. Create multiple entities with dependencies in a single operation.',
    inputSchema: {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document'] },
              data: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  workstream: { type: 'string' },
                  depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs of entities this depends on' },
                  implements: { type: 'array', items: { type: 'string' }, description: 'Document IDs this entity implements (for milestone, story)' },
                  enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this decision enables (for decision only)' },
                },
              },
            },
            required: ['type', 'data'],
          },
          description: 'Entities to create',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              type: { type: 'string', enum: ['blocks', 'implements', 'enables'] },
            },
          },
          description: 'Dependencies between entities (use entity_N refs). Type: blocks (depends_on), implements (doc link), enables (decision enables)',
        },
        options: {
          type: 'object',
          properties: {
            atomic: { type: 'boolean', description: 'Rollback all on failure' },
            add_to_canvas: { type: 'boolean' },
            canvas_source: { type: 'string' },
          },
        },
      },
      required: ['entities'],
    },
  },
  // DEPRECATED: Use batch_update instead
  {
    name: 'batch_update_status',
    description: 'DEPRECATED: Use batch_update instead. Update status of multiple entities with optional cascading.',
    inputSchema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              note: { type: 'string' },
            },
            required: ['id', 'status'],
          },
        },
        options: {
          type: 'object',
          properties: {
            auto_cascade: { type: 'boolean' },
          },
        },
      },
      required: ['updates'],
    },
  },
  // DEPRECATED: Use batch_update instead
  {
    name: 'batch_archive',
    description: 'DEPRECATED: Use batch_update instead. Archive multiple entities (milestones with children, or individual entities).',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_ids: { type: 'array', items: { type: 'string' }, description: 'Milestone IDs to archive with children' },
        entity_ids: { type: 'array', items: { type: 'string' }, description: 'Individual entity IDs to archive' },
        options: {
          type: 'object',
          properties: {
            archive_folder: { type: 'string' },
            remove_from_canvas: { type: 'boolean' },
          },
        },
      },
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
    name: 'get_workstream_status',
    description: '[DEPRECATED - use get_project_overview with workstream filter] Get detailed status for a specific workstream.',
    inputSchema: {
      type: 'object',
      properties: {
        workstream: { type: 'string', description: 'Workstream identifier' },
        include_completed: { type: 'boolean' },
        group_by: { type: 'string', enum: ['status', 'type', 'priority'] },
      },
      required: ['workstream'],
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

  // Category 4: Search & Navigation
  {
    name: 'search_entities',
    description: 'Full-text search across entities with filters. Enhanced to support navigation mode (consolidates navigate_hierarchy). Use query for search mode, or from_id+direction for navigation mode.',
    inputSchema: {
      type: 'object',
      properties: {
        // Search mode
        query: { type: 'string', description: 'Search query (for search mode)' },
        // Navigation mode (from navigate_hierarchy)
        from_id: { type: 'string', description: 'Starting entity ID (for navigation mode)' },
        direction: { type: 'string', enum: ['up', 'down', 'siblings', 'dependencies'], description: 'Navigation direction (for navigation mode)' },
        depth: { type: 'number', description: 'How many levels to traverse (for navigation mode)' },
        // Filters (apply to both modes)
        filters: {
          type: 'object',
          properties: {
            type: { type: 'array', items: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document'] } },
            status: { type: 'array', items: { type: 'string' } },
            workstream: { type: 'array', items: { type: 'string' } },
            archived: { type: 'boolean' },
          },
        },
        // Response control
        limit: { type: 'number', description: 'Max results to return' },
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
  // Legacy tools (deprecated - use get_entity instead)
  {
    name: 'get_entity_summary',
    description: '[DEPRECATED: Use get_entity instead] Get a quick overview of an entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_entity_full',
    description: '[DEPRECATED: Use get_entity with fields parameter instead] Get complete entity with all relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID' },
        include_children: { type: 'boolean' },
        include_dependencies: { type: 'boolean' },
        depth: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'navigate_hierarchy',
    description: '[DEPRECATED: Use search_entities with from_id and direction instead] Traverse entity relationships in a given direction.',
    inputSchema: {
      type: 'object',
      properties: {
        from_id: { type: 'string', description: 'Starting entity ID' },
        direction: { type: 'string', enum: ['up', 'down', 'siblings', 'dependencies'] },
        depth: { type: 'number', description: 'How many levels to traverse' },
        include_content: { type: 'boolean' },
      },
      required: ['from_id', 'direction'],
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
  // Legacy tools (deprecated)
  {
    name: 'create_decision',
    description: '[DEPRECATED: Use create_entity with type: "decision" instead] Create a new decision record.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        context: { type: 'string', description: 'Background context for the decision' },
        decision: { type: 'string', description: 'The actual decision made' },
        rationale: { type: 'string', description: 'Why this decision was made' },
        workstream: { type: 'string' },
        decided_by: { type: 'string' },
        enables: { type: 'array', items: { type: 'string' }, description: 'Entity IDs this decision enables' },
        supersedes: { type: 'string', description: 'Previous decision ID this supersedes' },
        affects_documents: { type: 'array', items: { type: 'string' }, description: 'Document IDs affected by this decision' },
      },
      required: ['title', 'context', 'decision', 'rationale', 'workstream', 'decided_by'],
    },
  },
  {
    name: 'get_decision_history',
    description:
      '[DEPRECATED: Use manage_documents with action: "get_decision_history" instead] Get decision history for a topic or workstream.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Filter by topic keyword' },
        workstream: { type: 'string' },
        include_superseded: { type: 'boolean', description: 'Include superseded decisions (default: false)' },
        include_archived: {
          type: 'boolean',
          description: 'Include archived decisions (default: true - most decisions are archived after being decided)',
        },
      },
    },
  },
  {
    name: 'supersede_document',
    description: '[DEPRECATED: Use manage_documents with action: "supersede_document" instead] Update a document based on a decision.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string' },
        decision_id: { type: 'string' },
        new_content: { type: 'string' },
        change_summary: { type: 'string' },
      },
      required: ['document_id', 'decision_id', 'new_content', 'change_summary'],
    },
  },
  {
    name: 'get_document_history',
    description: '[DEPRECATED: Use manage_documents with action: "get_document_history" instead] Get version history for a document.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'check_document_freshness',
    description: '[DEPRECATED: Use manage_documents with action: "check_freshness" instead] Check if a document is up-to-date.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string' },
      },
      required: ['document_id'],
    },
  },

  // Category 6: Implementation Handoff (DEPRECATED - Low usage, will be removed)
  {
    name: 'get_ready_for_implementation',
    description: '[DEPRECATED - Low usage, will be removed] Find stories and specs that are ready for implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        workstream: { type: 'string' },
        priority: { type: 'array', items: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] } },
      },
    },
  },
  {
    name: 'generate_implementation_package',
    description: '[DEPRECATED - Low usage, will be removed] Generate a complete implementation package for a spec.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_id: { type: 'string', description: 'Spec or story ID' },
      },
      required: ['spec_id'],
    },
  },
  {
    name: 'validate_spec_completeness',
    description: '[DEPRECATED - Low usage, will be removed] Validate that a spec is complete and ready for implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_id: { type: 'string' },
      },
      required: ['spec_id'],
    },
  },
];

// All tool definitions combined
export const allToolDefinitions: Tool[] = [
  ...utilityToolDefinitions,
  ...entityToolDefinitions,
];
