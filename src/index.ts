#!/usr/bin/env node

// Handle --version flag early, before any config loading
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const VERSION = packageJson.version;

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`obsidian-accomplishments-mcp v${VERSION}`);
  process.exit(0);
}

// Parse --semantic-search flag (default: false)
// Usage: --semantic-search or --semantic-search=true/false
const semanticSearchArg = process.argv.find(arg => arg.startsWith('--semantic-search'));
const SEMANTIC_SEARCH_ENABLED = semanticSearchArg
  ? (semanticSearchArg === '--semantic-search' || semanticSearchArg === '--semantic-search=true')
  : false;

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
import { handleEntity } from './tools/entity-management-tools.js';
import { handleEntities } from './tools/batch-operations-tools.js';
import {
  getProjectOverview,
  analyzeProjectState,
  getFeatureCoverage,
  getSchema,
} from './tools/project-understanding-tools.js';
import {
  searchEntities,
  getEntity,
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

// MSRL initialization state tracking
let msrlInitializationState: 'not_started' | 'downloading_model' | 'indexing' | 'ready' | 'failed' = 'not_started';
let msrlInitializationError: Error | null = null;

// MSRL indexing progress (updated during background initialization)
let msrlIndexProgress: {
  phase: string;
  filesProcessed: number;
  totalFiles: number;
  chunksProcessed: number;
  percent: number;
  currentFile?: string;
} | null = null;

/**
 * Wait for MSRL engine to be ready with timeout.
 * Returns the engine if ready, or throws an error with retry guidance.
 *
 * @param maxWaitMs Maximum time to wait (default: 45s to stay under typical 60s client timeout)
 * @param pollIntervalMs How often to check status (default: 500ms)
 */
async function waitForMsrlReady(maxWaitMs: number = 45000, pollIntervalMs: number = 500): Promise<MsrlEngineType> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    // Already ready
    if (msrlEngine && msrlInitializationState === 'ready') {
      return msrlEngine;
    }

    // Failed permanently
    if (msrlInitializationState === 'failed') {
      throw new MCPError(
        `Semantic search initialization failed: ${msrlInitializationError?.message || 'Unknown error'}. ` +
        'Try restarting the server or check the logs for details.',
        'INITIALIZATION_FAILED',
        503
      );
    }

    // Not started (shouldn't happen if SEMANTIC_SEARCH_ENABLED)
    if (msrlInitializationState === 'not_started') {
      throw new MCPError(
        'Semantic search is enabled but initialization has not started. This is unexpected.',
        'INITIALIZATION_ERROR',
        500
      );
    }

    // In progress (downloading_model or indexing) - wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout reached while still initializing - provide detailed progress info
  const progressInfo = msrlIndexProgress
    ? ` Progress: ${msrlIndexProgress.percent}% (${msrlIndexProgress.filesProcessed}/${msrlIndexProgress.totalFiles} files, ${msrlIndexProgress.chunksProcessed} chunks)`
    : '';
  throw new MCPError(
    `Semantic search is still initializing (${msrlInitializationState}).${progressInfo} ` +
    'This is a temporary condition - please retry in a few moments.',
    'INDEXING_IN_PROGRESS',
    503
  );
}

/**
 * Unified reindex function that rebuilds BOTH indexes:
 * 1. V2Runtime entity index (milestones, stories, tasks, etc.)
 * 2. MSRL semantic search index (vector embeddings)
 *
 * If either fails, returns verbose error with full stack trace.
 * Used on startup and for self-healing on index errors.
 */
async function rebuildAllIndexes(options: {
  crashOnError?: boolean;
  source: string;
}): Promise<{
  success: boolean;
  v2Runtime: { success: boolean; entities?: number; error?: string; stack?: string };
  msrl: { success: boolean; docs?: number; chunks?: number; error?: string; stack?: string };
}> {
  const result = {
    success: true,
    v2Runtime: { success: false } as { success: boolean; entities?: number; error?: string; stack?: string },
    msrl: { success: false } as { success: boolean; docs?: number; chunks?: number; error?: string; stack?: string },
  };

  console.error(`[rebuildAllIndexes] Starting unified reindex (source: ${options.source})...`);
  const startTime = Date.now();

  // 1. Rebuild V2Runtime entity index
  try {
    console.error('[rebuildAllIndexes] Rebuilding V2Runtime entity index...');
    const runtime = await getOrCreateV2Runtime();
    const v2Result = await runtime.rebuildIndex();
    result.v2Runtime = {
      success: true,
      entities: v2Result.entities_after ?? 0,
    };
    console.error(`[rebuildAllIndexes] V2Runtime: ${result.v2Runtime.entities} entities indexed`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    result.v2Runtime = {
      success: false,
      error: err.message,
      stack: err.stack,
    };
    result.success = false;
    console.error(`[rebuildAllIndexes] V2Runtime FAILED: ${err.message}`);
    console.error(err.stack);
  }

  // 2. Rebuild MSRL semantic index (only if semantic search is enabled)
  if (!SEMANTIC_SEARCH_ENABLED) {
    console.error('[rebuildAllIndexes] Semantic search disabled (--semantic-search not set), skipping MSRL');
    result.msrl = {
      success: true,
      docs: 0,
      chunks: 0,
    };
  } else {
    try {
      console.error('[rebuildAllIndexes] Rebuilding MSRL semantic index...');

      // Create engine if not exists
      // Engine will auto-download the ONNX model to ~/.msrl/models/bge-m3 if not present
      if (!msrlEngine) {
        console.error('[rebuildAllIndexes] MSRL engine not initialized, creating...');

        // Import the model path helper to log where models are stored
        const { getDefaultModelPath } = await import('@ostanlabs/md-retriever');
        const modelPath = getDefaultModelPath('bge-m3');
        console.error(`[rebuildAllIndexes] MSRL model location: ${modelPath}`);
        console.error('[rebuildAllIndexes] Model will be auto-downloaded if not present (~2.3 GB)');

        msrlEngine = await MsrlEngine.create({
          vaultRoot: config.vaultPath,
        });

        console.error(`[rebuildAllIndexes] MSRL engine initialized with model at: ${modelPath}`);
      }

      // Force reindex
      await msrlEngine.reindex({ wait: true, force: true });
      const status = msrlEngine.getStatus();

      if (status.state === 'error') {
        throw new Error(`MSRL reindex completed but state is 'error': ${JSON.stringify(status)}`);
      }

      if (status.stats.docs === 0) {
        throw new Error(`MSRL reindex completed but 0 docs indexed. Status: ${JSON.stringify(status)}`);
      }

      result.msrl = {
        success: true,
        docs: status.stats.docs,
        chunks: status.stats.leaves,
      };
      console.error(`[rebuildAllIndexes] MSRL: ${result.msrl.docs} docs, ${result.msrl.chunks} chunks indexed`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.msrl = {
        success: false,
        error: err.message,
        stack: err.stack,
      };
      result.success = false;
      console.error(`[rebuildAllIndexes] MSRL FAILED: ${err.message}`);
      console.error(err.stack);
    }
  }

  const elapsed = Date.now() - startTime;
  console.error(`[rebuildAllIndexes] Completed in ${elapsed}ms. Success: ${result.success}`);

  // Crash if requested and any index failed
  if (options.crashOnError && !result.success) {
    const errorMsg = [
      `FATAL: Index rebuild failed (source: ${options.source})`,
      `V2Runtime: ${result.v2Runtime.success ? 'OK' : `FAILED - ${result.v2Runtime.error}`}`,
      result.v2Runtime.stack ? `  Stack: ${result.v2Runtime.stack}` : '',
      `MSRL: ${result.msrl.success ? 'OK' : `FAILED - ${result.msrl.error}`}`,
      result.msrl.stack ? `  Stack: ${result.msrl.stack}` : '',
    ].filter(Boolean).join('\n');

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return result;
}

/**
 * Self-healing wrapper for operations that may fail due to index issues.
 * On NOT_INDEXED or similar errors, triggers full reindex of both indexes and retries.
 */
async function executeWithSelfHealing<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Check if this is an index-related error
    const isIndexError =
      err.message.includes('not indexed') ||
      err.message.includes('NOT_INDEXED') ||
      err.message.includes('reindex');

    if (isIndexError) {
      console.error(`[self-heal] ${operationName} failed with index error: ${err.message}`);
      console.error(`[self-heal] Triggering full reindex of both indexes...`);

      const reindexResult = await rebuildAllIndexes({
        crashOnError: false,
        source: `self-heal:${operationName}`
      });

      if (!reindexResult.success) {
        // Return verbose error to client
        throw new MCPError(
          `Self-healing reindex failed.\n` +
          `Original error: ${err.message}\n` +
          `V2Runtime: ${reindexResult.v2Runtime.success ? 'OK' : reindexResult.v2Runtime.error}\n` +
          `MSRL: ${reindexResult.msrl.success ? 'OK' : reindexResult.msrl.error}\n` +
          `V2Runtime stack: ${reindexResult.v2Runtime.stack || 'N/A'}\n` +
          `MSRL stack: ${reindexResult.msrl.stack || 'N/A'}`,
          'INDEX_REBUILD_FAILED',
          500
        );
      }

      console.error(`[self-heal] Reindex successful, retrying ${operationName}...`);
      // Retry the operation once after successful reindex
      return await operation();
    }

    throw error;
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

/**
 * Get tool definitions, filtering based on semantic search availability.
 * When semantic search is disabled:
 * - Remove 'semantic' parameter from search_entities tool
 * - Remove MSRL-specific tools (search_docs, msrl_status)
 */
function getToolDefinitions() {
  // Start with all tool definitions
  let tools = [...allToolDefinitions, getResourcesIndexDefinition];

  if (SEMANTIC_SEARCH_ENABLED) {
    // Include MSRL tools when semantic search is enabled
    tools = [...tools, ...msrlToolDefinitions];
  } else {
    // Modify search_entities to remove semantic parameter when disabled
    tools = tools.map(tool => {
      if (tool.name === 'search_entities') {
        // Create a deep copy of the tool definition
        const modifiedTool = JSON.parse(JSON.stringify(tool));

        // Remove 'semantic' from properties
        if (modifiedTool.inputSchema?.properties?.semantic) {
          delete modifiedTool.inputSchema.properties.semantic;
        }

        // Update the description to remove semantic search mentions
        modifiedTool.description = modifiedTool.description
          .replace(/1\. SEMANTIC SEARCH:.*?\n/g, '')
          .replace(/FOUR MODES:/g, 'THREE MODES:')
          .replace(/, semantic: true.*?search\)/g, '')
          .replace(/\(best for natural language queries\)\n/g, '')
          .replace(/- "Find entities about.*?semantic: true\n/g, '');

        return modifiedTool;
      }
      return tool;
    });
  }

  return tools;
}

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getToolDefinitions(),
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
        // Rebuild BOTH indexes (V2Runtime + MSRL)
        const reindexResult = await rebuildAllIndexes({
          crashOnError: false,
          source: 'tool:rebuild_index'
        });

        if (!reindexResult.success) {
          throw new MCPError(
            `Index rebuild failed.\n` +
            `V2Runtime: ${reindexResult.v2Runtime.success ? `OK (${reindexResult.v2Runtime.entities} entities)` : reindexResult.v2Runtime.error}\n` +
            `MSRL: ${reindexResult.msrl.success ? `OK (${reindexResult.msrl.docs} docs)` : reindexResult.msrl.error}\n` +
            (reindexResult.v2Runtime.stack ? `V2Runtime stack:\n${reindexResult.v2Runtime.stack}\n` : '') +
            (reindexResult.msrl.stack ? `MSRL stack:\n${reindexResult.msrl.stack}` : ''),
            'INDEX_REBUILD_FAILED',
            500
          );
        }

        result = {
          content: {
            v2Runtime: {
              success: true,
              entities: reindexResult.v2Runtime.entities,
            },
            msrl: {
              success: true,
              docs: reindexResult.msrl.docs,
              chunks: reindexResult.msrl.chunks,
            },
          },
          error: null,
        };
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
      case 'entity': {
        // V2 Unified entity tool - routes to create, get, or update based on action
        const runtime = await getOrCreateV2Runtime();
        const input = args as any;
        if (input.action === 'get') {
          // Route get action to search-navigation-tools
          result = await getEntity(input, runtime.getSearchNavigationDeps());
        } else {
          // Route create/update actions to entity-management-tools
          result = await handleEntity(input, runtime.getEntityManagementDeps());
        }
        break;
      }

      // Batch Operations
      case 'entities': {
        // V2 Unified entities tool - routes to get or batch based on action
        const runtime = await getOrCreateV2Runtime();
        result = await handleEntities(args as any, runtime.getEntitiesDeps());
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
        const input = args as any;

        // Reject semantic search requests when disabled
        if (input.semantic && !SEMANTIC_SEARCH_ENABLED) {
          throw new MCPError(
            'Semantic search is not enabled. Start the server with --semantic-search flag to enable it.',
            'FEATURE_DISABLED',
            400
          );
        }

        const runtime = await getOrCreateV2Runtime();
        const deps = runtime.getSearchNavigationDeps();

        // Inject semantic search if enabled and requested
        if (SEMANTIC_SEARCH_ENABLED && input.semantic) {
          // Wait for MSRL to be ready (with timeout to avoid client timeout)
          const engine = await waitForMsrlReady();

          deps.semanticSearch = async (query, options) => {
            // Wrap semantic search in self-healing to handle NOT_INDEXED errors
            return executeWithSelfHealing(async () => {
              const queryResult = await engine.query({
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
            }, 'search_entities.semanticSearch');
          };
        }

        result = await searchEntities(input, deps);
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

      // MSRL Semantic Search Tools (only available when --semantic-search is enabled)
      case 'search_docs': {
        if (!SEMANTIC_SEARCH_ENABLED) {
          throw new MCPError(
            'Semantic search is not enabled. Start the server with --semantic-search flag to enable it.',
            'FEATURE_DISABLED',
            400
          );
        }
        // Wait for MSRL to be ready (with timeout to avoid client timeout)
        const engine = await waitForMsrlReady();

        // Use self-healing wrapper to auto-reindex on NOT_INDEXED error
        result = await executeWithSelfHealing(
          () => handleSearchDocs(engine, args as unknown as SearchDocsInput),
          'search_docs'
        );
        break;
      }
      case 'msrl_status': {
        if (!SEMANTIC_SEARCH_ENABLED) {
          throw new MCPError(
            'Semantic search is not enabled. Start the server with --semantic-search flag to enable it.',
            'FEATURE_DISABLED',
            400
          );
        }
        // For status, return current state even if not ready (useful for debugging)
        if (msrlInitializationState === 'downloading_model') {
          result = {
            state: 'initializing',
            initialization_state: msrlInitializationState,
            snapshot_id: null,
            snapshot_timestamp: null,
            stats: { docs: 0, nodes: 0, leaves: 0, shards: 0 },
            watcher: { enabled: false, debounce_ms: 0 },
            message: 'MSRL is downloading the embedding model (~2.3 GB). Please wait.',
          };
        } else if (msrlInitializationState === 'indexing') {
          result = {
            state: 'initializing',
            initialization_state: msrlInitializationState,
            snapshot_id: null,
            snapshot_timestamp: null,
            stats: { docs: 0, nodes: 0, leaves: 0, shards: 0 },
            watcher: { enabled: false, debounce_ms: 0 },
            message: 'MSRL is building the semantic index. Please wait.',
            progress: msrlIndexProgress ? {
              phase: msrlIndexProgress.phase,
              percent: msrlIndexProgress.percent,
              files_processed: msrlIndexProgress.filesProcessed,
              total_files: msrlIndexProgress.totalFiles,
              chunks_processed: msrlIndexProgress.chunksProcessed,
              current_file: msrlIndexProgress.currentFile,
            } : undefined,
          };
        } else if (msrlInitializationState === 'failed') {
          result = {
            state: 'error',
            initialization_state: msrlInitializationState,
            snapshot_id: null,
            snapshot_timestamp: null,
            stats: { docs: 0, nodes: 0, leaves: 0, shards: 0 },
            watcher: { enabled: false, debounce_ms: 0 },
            error: msrlInitializationError?.message || 'MSRL initialization failed',
          };
        } else if (!msrlEngine) {
          result = {
            state: 'error',
            initialization_state: msrlInitializationState,
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
  console.error(`Obsidian Accomplishments MCP Server v${VERSION} starting...`);
  console.error(`Semantic search: ${SEMANTIC_SEARCH_ENABLED ? 'ENABLED (--semantic-search)' : 'DISABLED (use --semantic-search to enable)'}`);

  // Index all resources on startup (fast operation)
  await indexAllResources();

  // Build V2Runtime index BEFORE connecting (it's fast, ~100ms)
  // This ensures entity tools work immediately
  console.error('[startup] Building V2Runtime entity index...');
  try {
    const runtime = await getOrCreateV2Runtime();
    const v2Result = await runtime.rebuildIndex();
    console.error(`[startup] V2Runtime: ${v2Result.entities_after ?? 0} entities indexed in ${v2Result.duration_ms}ms`);
  } catch (error) {
    console.error('[startup] FATAL: V2Runtime index failed:', error);
    throw error;
  }

  // Connect to MCP transport FIRST - don't make the client wait
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Obsidian Accomplishments MCP Server v${VERSION} running on stdio`);

  // Initialize MSRL in the background (may use existing snapshot or build fresh)
  // Tools will wait for initialization with timeout, returning retry guidance if not ready
  if (SEMANTIC_SEARCH_ENABLED) {
    console.error('[startup] Initializing MSRL semantic search in background...');
    msrlInitializationState = 'downloading_model';

    // Don't await - let it run in background
    (async () => {
      try {
        const { getDefaultModelPath } = await import('@ostanlabs/md-retriever');
        const modelPath = getDefaultModelPath('bge-m3');
        console.error(`[startup] MSRL model location: ${modelPath}`);
        console.error('[startup] Model will be auto-downloaded if not present (~2.3 GB)');

        // MsrlEngine.create() will:
        // 1. Download model if needed
        // 2. Load existing snapshot from {vault}/.msrl/snapshots/ if available
        // 3. Only build fresh index if no snapshot exists
        // This means restarts are fast if a snapshot already exists!
        msrlInitializationState = 'indexing'; // May be loading existing or building new

        msrlEngine = await MsrlEngine.create({
          vaultRoot: config.vaultPath,
          watcher: { enabled: true, debounceMs: 1000 }, // Enable file watcher for live updates
        });

        const status = msrlEngine.getStatus();
        console.error(`[startup] MSRL engine initialized with model at: ${modelPath}`);

        if (status.snapshotId) {
          // Loaded existing snapshot - fast path!
          console.error(`[startup] MSRL: Loaded existing snapshot '${status.snapshotId}' from ${status.snapshotTimestamp}`);
          console.error(`[startup] MSRL: ${status.stats.docs} docs, ${status.stats.leaves} chunks ready`);
          console.error('[startup] MSRL file watcher enabled for live updates');
        } else {
          // Built fresh index
          console.error(`[startup] MSRL: Built fresh index - ${status.stats.docs} docs, ${status.stats.leaves} chunks`);
        }

        // Mark as ready
        msrlInitializationState = 'ready';
        msrlIndexProgress = null;
        console.error('[startup] Semantic search is now ready!');
      } catch (error) {
        // Mark as failed with error details
        msrlInitializationState = 'failed';
        msrlInitializationError = error instanceof Error ? error : new Error(String(error));
        console.error('[startup] MSRL background initialization failed:', error);
        // Don't crash - semantic search will return appropriate errors
      }
    })();
  }
}

main().catch((error) => {
  console.error('FATAL ERROR - Server failed to start:');
  console.error(error);
  if (error instanceof Error && error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});

