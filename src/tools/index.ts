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
export * from './canvas-layout-tools.js';
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
    description: 'Update entity fields and/or modify relationships.',
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
      },
      required: ['id'],
    },
  },
  {
    name: 'update_entity_status',
    description: 'Update entity status with optional note and cascade.',
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
  {
    name: 'archive_entity',
    description: 'Archive a single entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to archive' },
        force: { type: 'boolean', description: 'Force archive even if entity has children' },
      },
      required: ['id'],
    },
  },
  {
    name: 'archive_milestone',
    description: 'Archive a milestone and all its children (stories, tasks).',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'string', description: 'Milestone ID to archive' },
        archive_folder: { type: 'string', description: 'Custom archive folder path' },
      },
      required: ['milestone_id'],
    },
  },
  {
    name: 'restore_from_archive',
    description: 'Restore an archived entity.',
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
  {
    name: 'batch_operations',
    description: 'Create multiple entities with dependencies in a single operation.',
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
  {
    name: 'batch_update_status',
    description: 'Update status of multiple entities with optional cascading.',
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
  {
    name: 'batch_archive',
    description: 'Archive multiple entities (milestones with children, or individual entities).',
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
    description: 'Get high-level project status across all workstreams.',
    inputSchema: {
      type: 'object',
      properties: {
        include_completed: { type: 'boolean', description: 'Include completed items' },
        include_archived: { type: 'boolean', description: 'Include archived items' },
        canvas_source: { type: 'string', description: 'Filter by canvas source' },
      },
    },
  },
  {
    name: 'get_workstream_status',
    description: 'Get detailed status for a specific workstream.',
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
    description: 'Full-text search across entities with filters.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        filters: {
          type: 'object',
          properties: {
            type: { type: 'array', items: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document'] } },
            status: { type: 'array', items: { type: 'string' } },
            workstream: { type: 'array', items: { type: 'string' } },
            archived: { type: 'boolean' },
          },
        },
        limit: { type: 'number', description: 'Max results to return' },
        include_content: { type: 'boolean' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_entity_summary',
    description: 'Get a quick overview of an entity.',
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
    description: 'Get complete entity with all relationships.',
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
    description: 'Traverse entity relationships in a given direction.',
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
    name: 'create_decision',
    description: 'Create a new decision record.',
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
      'Get decision history for a topic or workstream. By default includes archived decisions (most decisions are archived after being decided). Set include_archived=false to only see non-archived decisions.',
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
    description: 'Update a document based on a decision, creating a new version.',
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
    description: 'Get version history for a document.',
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
    description: 'Check if a document is up-to-date with related decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string' },
      },
      required: ['document_id'],
    },
  },

  // Category 6: Implementation Handoff
  {
    name: 'get_ready_for_implementation',
    description: 'Find stories and specs that are ready for implementation.',
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
    description: 'Generate a complete implementation package for a spec.',
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
    description: 'Validate that a spec is complete and ready for implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_id: { type: 'string' },
      },
      required: ['spec_id'],
    },
  },

  // Category 7: Canvas Layout
  {
    name: 'auto_layout_canvas',
    description: 'Auto-layout canvas nodes using dependency-driven horizontal flow with workstream lanes. Repositions nodes based on edge dependencies (X axis) and groups them by workstream (Y axis).',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_source: { type: 'string', description: 'Path to canvas file (optional, uses default)' },
        options: {
          type: 'object',
          properties: {
            stage_spacing: { type: 'number', description: 'Horizontal spacing between dependency stages (default: 400)' },
            item_spacing: { type: 'number', description: 'Vertical spacing between items in same lane (default: 120)' },
            lane_padding: { type: 'number', description: 'Padding between workstream lanes (default: 50)' },
            preserve_workstreams: { type: 'array', items: { type: 'string' }, description: 'Workstreams to preserve existing positions for' },
          },
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
