#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';

import { getConfig, getAllWorkspaces, getWorkspacePath } from './utils/config.js';
import { listFilesRecursive, readFile } from './utils/file-utils.js';
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
} from './tools/entity-management-tools.js';
import { batchUpdate } from './tools/batch-operations-tools.js';
import {
  getProjectOverview,
  analyzeProjectState,
} from './tools/project-understanding-tools.js';
import {
  searchEntities,
  getEntity,
} from './tools/search-navigation-tools.js';
import { manageDocuments } from './tools/decision-document-tools.js';
import {
  getReadyForImplementation,
  generateImplementationPackage,
  validateSpecCompleteness,
} from './tools/implementation-handoff-tools.js';

// Create server instance
const server = new Server(
  {
    name: 'obsidian-accomplishments',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
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

// ============================================================================
// Resource Handlers
// ============================================================================

// Cache for indexed resources (populated on startup)
let resourceCache: Resource[] = [];

/**
 * Parse a resource URI to extract workspace and file path
 * URI format: obsidian://workspace-name/path/to/file.md
 */
function parseResourceUri(uri: string): { workspace: string; filePath: string } | null {
  const match = uri.match(/^obsidian:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { workspace: match[1], filePath: match[2] };
}

/**
 * Index all documents in all workspaces and populate the resource cache
 */
async function indexAllResources(): Promise<void> {
  const resources: Resource[] = [];
  const workspaces = getAllWorkspaces(config);

  for (const [workspaceName, wsConfig] of Object.entries(workspaces)) {
    try {
      const allFiles = await listFilesRecursive(wsConfig.path);
      const mdFiles = allFiles.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const uri = `obsidian://${workspaceName}/${file}`;
        const name = file.replace(/\.md$/, '').split('/').pop() || file;

        resources.push({
          uri,
          name,
          description: `${workspaceName}: ${file}`,
          mimeType: 'text/markdown',
        });
      }
    } catch (error) {
      console.error(`Failed to index workspace ${workspaceName}:`, error);
    }
  }

  resourceCache = resources;
  console.error(`Indexed ${resources.length} resources from ${Object.keys(workspaces).length} workspaces`);
}

// Register resources/list handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: resourceCache };
});

// Register resources/read handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  const parsed = parseResourceUri(uri);
  if (!parsed) {
    throw new MCPError(`Invalid resource URI: ${uri}`, 'INVALID_URI', 400);
  }

  const workspacePath = getWorkspacePath(config, parsed.workspace);
  if (!workspacePath) {
    throw new MCPError(`Workspace not found: ${parsed.workspace}`, 'NOT_FOUND', 404);
  }

  const absolutePath = `${workspacePath}/${parsed.filePath}`;

  try {
    const content = await readFile(absolutePath);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      ],
    };
  } catch (error) {
    throw new MCPError(`Failed to read resource: ${uri}`, 'READ_ERROR', 500);
  }
});

// ============================================================================
// Tool Handlers
// ============================================================================

// Define get_resources_index tool (needs access to resourceCache)
const getResourcesIndexDefinition = {
  name: 'get_resources_index',
  description: 'Get a list of all indexed resource URIs. Use this to discover available documents that can be read via MCP resources. Optionally filter by workspace.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      workspace: {
        type: 'string',
        description: 'Optional workspace name to filter resources. If not provided, returns resources from all workspaces.',
      },
    },
    required: [],
  },
};

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [...allToolDefinitions, getResourcesIndexDefinition],
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

      case 'get_resources_index': {
        const workspace = (args as { workspace?: string })?.workspace;
        let filteredResources = resourceCache;

        if (workspace) {
          // Filter by workspace - URI format is obsidian://workspace/path
          const prefix = `obsidian://${workspace}/`;
          filteredResources = resourceCache.filter(r => r.uri.startsWith(prefix));
        }

        result = {
          workspace: workspace || 'all',
          count: filteredResources.length,
          resources: filteredResources.map(r => r.uri),
        };
        break;
      }

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

      // Batch Operations
      case 'batch_update': {
        const runtime = await getOrCreateV2Runtime();
        result = await batchUpdate(args as any, runtime.getBatchOperationsDeps());
        break;
      }

      // Project Understanding
      case 'get_project_overview': {
        const runtime = await getOrCreateV2Runtime();
        result = await getProjectOverview(args as any, runtime.getProjectUnderstandingDeps());
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
      case 'get_entity': {
        const runtime = await getOrCreateV2Runtime();
        result = await getEntity(args as any, runtime.getSearchNavigationDeps());
        break;
      }

      // Decision & Document Management
      case 'manage_documents': {
        const runtime = await getOrCreateV2Runtime();
        result = await manageDocuments(args as any, runtime.getDecisionDocumentDeps());
        break;
      }

      // Implementation Handoff (DEPRECATED - Low usage, will be removed)
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

      // Maintenance Tools
      case 'reconcile_relationships': {
        const runtime = await getOrCreateV2Runtime();
        const dryRun = (args as any).dry_run === true;
        if (dryRun) {
          // For dry run, we need to scan without modifying
          // For now, just run the reconciliation and report
          // A true dry-run would require refactoring the method
          result = {
            message: 'Dry run not yet implemented. Run without dry_run to reconcile relationships.',
            hint: 'This will scan all entities and ensure bidirectional implements/implemented_by consistency.',
          };
        } else {
          result = await runtime.reconcileImplementsRelationships();
        }
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
  // Index all resources on startup
  await indexAllResources();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Obsidian Accomplishments MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

