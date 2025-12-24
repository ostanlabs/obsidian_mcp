#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getConfig } from './utils/config.js';
import { MCPError } from './models/types.js';
import { getV2Runtime } from './services/v2/v2-runtime.js';
import type { V2Config } from './models/v2-types.js';

// Tool definitions and handlers
import {
  allToolDefinitions,
  handleReadDocs,
  handleUpdateDoc,
  handleListWorkspaces,
  handleListFiles,
} from './tools/index.js';

// Entity tool implementations
import {
  createEntity,
  updateEntity,
  updateEntityStatus,
  archiveEntity,
  archiveMilestone,
  restoreFromArchive,
} from './tools/entity-management-tools.js';
import {
  batchOperations,
  batchUpdateStatus,
  batchArchive,
} from './tools/batch-operations-tools.js';
import {
  getProjectOverview,
  getWorkstreamStatus,
  analyzeProjectState,
} from './tools/project-understanding-tools.js';
import {
  searchEntities,
  getEntitySummary,
  getEntityFull,
  navigateHierarchy,
} from './tools/search-navigation-tools.js';
import {
  createDecision,
  getDecisionHistory,
  supersedeDocument,
  getDocumentHistory,
  checkDocumentFreshness,
} from './tools/decision-document-tools.js';
import {
  getReadyForImplementation,
  generateImplementationPackage,
  validateSpecCompleteness,
} from './tools/implementation-handoff-tools.js';
import {
  autoLayoutCanvas,
} from './tools/canvas-layout-tools.js';

// Create server instance
const server = new Server(
  {
    name: 'obsidian-accomplishments',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Get configuration
let config: ReturnType<typeof getConfig>;
try {
  config = getConfig();
} catch (error) {
  console.error('Configuration error:', error);
  process.exit(1);
}

// Helper to create V2 config
function createV2Config(): V2Config {
  // VAULT_PATH points directly to the project folder containing milestones/, stories/, etc.
  return {
    vaultPath: config.vaultPath,
    entitiesFolder: '',  // Entities are directly in vaultPath subfolders
    archiveFolder: 'archive',
    canvasFolder: '',
    defaultCanvas: config.defaultCanvas,
    workspaces: {},
  };
}

// Cached V2 runtime
let v2RuntimePromise: ReturnType<typeof getV2Runtime> | null = null;
async function getOrCreateV2Runtime() {
  if (!v2RuntimePromise) {
    v2RuntimePromise = getV2Runtime(createV2Config());
  }
  return v2RuntimePromise;
}

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allToolDefinitions,
  };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      // Utility tools
      case 'read_docs':
        result = await handleReadDocs(config, args as any);
        break;

      case 'update_doc':
        result = await handleUpdateDoc(config, args as any);
        break;

      case 'list_workspaces':
        result = await handleListWorkspaces(config, args as any);
        break;

      case 'list_files':
        result = await handleListFiles(config, args as any);
        break;

      // Entity Management
      case 'create_entity': {
        const runtime = await getOrCreateV2Runtime();
        result = await createEntity(args as any, runtime.getEntityManagementDeps());
        break;
      }
      case 'update_entity': {
        const runtime = await getOrCreateV2Runtime();
        result = await updateEntity(args as any, runtime.getEntityManagementDeps());
        break;
      }
      case 'update_entity_status': {
        const runtime = await getOrCreateV2Runtime();
        result = await updateEntityStatus(args as any, runtime.getEntityManagementDeps());
        break;
      }
      case 'archive_entity': {
        const runtime = await getOrCreateV2Runtime();
        result = await archiveEntity(args as any, runtime.getEntityManagementDeps());
        break;
      }
      case 'archive_milestone': {
        const runtime = await getOrCreateV2Runtime();
        result = await archiveMilestone(args as any, runtime.getEntityManagementDeps());
        break;
      }
      case 'restore_from_archive': {
        const runtime = await getOrCreateV2Runtime();
        result = await restoreFromArchive(args as any, runtime.getEntityManagementDeps());
        break;
      }

      // Batch Operations
      case 'batch_operations': {
        const runtime = await getOrCreateV2Runtime();
        result = await batchOperations(args as any, runtime.getBatchOperationsDeps());
        break;
      }
      case 'batch_update_status': {
        const runtime = await getOrCreateV2Runtime();
        result = await batchUpdateStatus(args as any, runtime.getBatchOperationsDeps());
        break;
      }
      case 'batch_archive': {
        const runtime = await getOrCreateV2Runtime();
        result = await batchArchive(args as any, runtime.getBatchOperationsDeps());
        break;
      }

      // Project Understanding
      case 'get_project_overview': {
        const runtime = await getOrCreateV2Runtime();
        result = await getProjectOverview(args as any, runtime.getProjectUnderstandingDeps());
        break;
      }
      case 'get_workstream_status': {
        const runtime = await getOrCreateV2Runtime();
        result = await getWorkstreamStatus(args as any, runtime.getProjectUnderstandingDeps());
        break;
      }
      case 'analyze_project_state': {
        const runtime = await getOrCreateV2Runtime();
        result = await analyzeProjectState(args as any, runtime.getProjectUnderstandingDeps());
        break;
      }

      // Search & Navigation
      case 'search_entities': {
        const runtime = await getOrCreateV2Runtime();
        result = await searchEntities(args as any, runtime.getSearchNavigationDeps());
        break;
      }
      case 'get_entity_summary': {
        const runtime = await getOrCreateV2Runtime();
        result = await getEntitySummary(args as any, runtime.getSearchNavigationDeps());
        break;
      }
      case 'get_entity_full': {
        const runtime = await getOrCreateV2Runtime();
        result = await getEntityFull(args as any, runtime.getSearchNavigationDeps());
        break;
      }
      case 'navigate_hierarchy': {
        const runtime = await getOrCreateV2Runtime();
        result = await navigateHierarchy(args as any, runtime.getSearchNavigationDeps());
        break;
      }

      // Decision & Document Management
      case 'create_decision': {
        const runtime = await getOrCreateV2Runtime();
        result = await createDecision(args as any, runtime.getDecisionDocumentDeps());
        break;
      }
      case 'get_decision_history': {
        const runtime = await getOrCreateV2Runtime();
        result = await getDecisionHistory(args as any, runtime.getDecisionDocumentDeps());
        break;
      }
      case 'supersede_document': {
        const runtime = await getOrCreateV2Runtime();
        result = await supersedeDocument(args as any, runtime.getDecisionDocumentDeps());
        break;
      }
      case 'get_document_history': {
        const runtime = await getOrCreateV2Runtime();
        result = await getDocumentHistory(args as any, runtime.getDecisionDocumentDeps());
        break;
      }
      case 'check_document_freshness': {
        const runtime = await getOrCreateV2Runtime();
        result = await checkDocumentFreshness(args as any, runtime.getDecisionDocumentDeps());
        break;
      }

      // Implementation Handoff
      case 'get_ready_for_implementation': {
        const runtime = await getOrCreateV2Runtime();
        result = await getReadyForImplementation(args as any, runtime.getImplementationHandoffDeps());
        break;
      }
      case 'generate_implementation_package': {
        const runtime = await getOrCreateV2Runtime();
        result = await generateImplementationPackage(args as any, runtime.getImplementationHandoffDeps());
        break;
      }
      case 'validate_spec_completeness': {
        const runtime = await getOrCreateV2Runtime();
        result = await validateSpecCompleteness(args as any, runtime.getImplementationHandoffDeps());
        break;
      }

      // Canvas Layout
      case 'auto_layout_canvas': {
        const runtime = await getOrCreateV2Runtime();
        result = await autoLayoutCanvas(args as any, runtime.getCanvasLayoutDeps());
        break;
      }

      default:
        throw new MCPError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL', 400);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof MCPError ? error.code : 'INTERNAL_ERROR';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: true,
              code: errorCode,
              message: errorMessage,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Obsidian Accomplishments MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

