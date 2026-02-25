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

// MSRL imports
import { MsrlEngine } from '@ostanlabs/md-retriever';
import type { MsrlEngine as MsrlEngineType } from '@ostanlabs/md-retriever';
import {
  msrlToolDefinitions,
  handleSearchDocs,
  handleMsrlStatus,
} from './tools/msrl-tools.js';
import type { SearchDocsInput } from './tools/msrl-tools.js';

// Tool definitions and handlers
import {
  allToolDefinitions,
  handleReadDocs,
  handleUpdateDoc,
  handleListWorkspaces,
  handleListFiles,
  handleManageWorkspaces,
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
  getFeatureCoverage,
  getSchema,
} from './tools/project-understanding-tools.js';
import {
  searchEntities,
  getEntity,
  getEntities,
} from './tools/search-navigation-tools.js';
import { manageDocuments } from './tools/decision-document-tools.js';
import { cleanupCompleted } from './tools/cleanup-tools.js';

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
  // EXCLUDE_ARCHIVED_BY_DEFAULT defaults to true - set to "false" to include archived entities
  const excludeArchivedEnv = process.env.EXCLUDE_ARCHIVED_BY_DEFAULT;
  const excludeArchivedByDefault = excludeArchivedEnv !== 'false';

  return {
    vaultPath: config.vaultPath,
    entitiesFolder: '',  // Entities are directly in vaultPath subfolders
    archiveFolder: 'archive',
    canvasFolder: '',
    defaultCanvas: config.defaultCanvas,
    workspaces: {},
    excludeArchivedByDefault,
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

// MSRL engine instance (initialized on startup)
let msrlEngine: MsrlEngineType | null = null;

/**
 * Initialize MSRL engine on startup (eager initialization).
 * This indexes the vault so the first search is fast.
 */
async function initializeMsrl(): Promise<void> {
  try {
    console.error('Initializing MSRL semantic search engine...');
    const startTime = Date.now();

    msrlEngine = await MsrlEngine.create({
      vaultRoot: config.vaultPath,
      // Use default config for other settings
    });

    const status = msrlEngine.getStatus();
    const elapsed = Date.now() - startTime;
    console.error(
      `MSRL initialized in ${elapsed}ms: ${status.stats.docs} docs, ${status.stats.leaves} chunks indexed`
    );
  } catch (error) {
    console.error('Failed to initialize MSRL:', error);
    // Don't fail startup - MSRL tools will return errors if engine is null
  }
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
  } catch (_error) {
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
    tools: [...allToolDefinitions, getResourcesIndexDefinition, ...msrlToolDefinitions],
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

      case 'manage_workspaces':
        result = await handleManageWorkspaces(config, args as any);
        // Re-index resources after workspace changes
        await indexAllResources();
        break;

      case 'rebuild_index': {
        const runtime = await getOrCreateV2Runtime();
        result = await runtime.rebuildIndex();
        break;
      }

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
      case 'get_feature_coverage': {
        const runtime = await getOrCreateV2Runtime();
        result = await getFeatureCoverage(args as any, runtime.getFeatureCoverageDeps());
        break;
      }

      // Search & Navigation
      case 'search_entities': {
        const runtime = await getOrCreateV2Runtime();
        const deps = runtime.getSearchNavigationDeps();

        // Inject semantic search if MSRL is available
        if (msrlEngine) {
          deps.semanticSearch = async (query, options) => {
            const queryResult = await msrlEngine!.query({
              query,
              topK: options?.topK,
              filters: options?.docUriPrefix ? { docUriPrefix: options.docUriPrefix } : undefined,
            });
            return queryResult.results.map((r) => ({
              docUri: r.docUri,
              headingPath: r.headingPath,
              excerpt: r.excerpt,
              score: r.score,
            }));
          };
        }

        result = await searchEntities(args as any, deps);
        break;
      }
      case 'get_entity': {
        const runtime = await getOrCreateV2Runtime();
        result = await getEntity(args as any, runtime.getSearchNavigationDeps());
        break;
      }
      case 'get_entities': {
        const runtime = await getOrCreateV2Runtime();
        result = await getEntities(args as any, runtime.getSearchNavigationDeps());
        break;
      }

      // Decision & Document Management
      case 'manage_documents': {
        const runtime = await getOrCreateV2Runtime();
        result = await manageDocuments(args as any, runtime.getDecisionDocumentDeps());
        break;
      }

      // Maintenance Tools
      case 'reconcile_relationships': {
        const runtime = await getOrCreateV2Runtime();
        const dryRun = (args as any).dry_run === true;
        result = await runtime.reconcileImplementsRelationships({ dry_run: dryRun });
        break;
      }

      // Schema Introspection
      case 'get_schema': {
        result = getSchema(args as any);
        break;
      }

      // Cleanup Operations
      case 'cleanup_completed': {
        const runtime = await getOrCreateV2Runtime();
        result = await cleanupCompleted(args as any, runtime.getCleanupDeps());
        break;
      }

      // MSRL Semantic Search Tools
      case 'search_docs': {
        if (!msrlEngine) {
          throw new MCPError('MSRL engine not initialized', 'NOT_INDEXED', 503);
        }
        result = await handleSearchDocs(msrlEngine, args as unknown as SearchDocsInput);
        break;
      }
      case 'msrl_status': {
        if (!msrlEngine) {
          result = {
            state: 'error',
            snapshot_id: null,
            snapshot_timestamp: null,
            stats: { docs: 0, nodes: 0, leaves: 0, shards: 0 },
            watcher: { enabled: false, debounce_ms: 0 },
            error: 'MSRL engine not initialized',
          };
        } else {
          result = handleMsrlStatus(msrlEngine);
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

  // Initialize MSRL semantic search engine (eager initialization)
  await initializeMsrl();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Obsidian Accomplishments MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

