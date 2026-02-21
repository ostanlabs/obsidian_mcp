/**
 * MSRL Tools
 *
 * MCP tool definitions and handlers for MSRL semantic search.
 * Provides:
 * - search_docs: Semantic search across the vault
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MsrlEngine, EngineQueryParams, QueryResult, IndexStatus } from '@ostanlabs/md-retriever';

// =============================================================================
// Types
// =============================================================================

export interface SearchDocsInput {
  query: string;
  top_k?: number;
  max_excerpt_chars?: number;
  filters?: {
    doc_uri_prefix?: string;
    doc_uris?: string[];
    heading_path_contains?: string;
  };
  include_scores?: boolean;
}

export interface SearchDocsOutput {
  results: Array<{
    doc_uri: string;
    heading_path: string;
    excerpt: string;
    excerpt_truncated: boolean;
    score?: number;
    vector_score?: number;
    bm25_score?: number;
  }>;
  total_results: number;
  took_ms: number;
}

export interface MsrlStatusOutput {
  state: 'ready' | 'building' | 'error';
  snapshot_id: string | null;
  snapshot_timestamp: string | null;
  stats: {
    docs: number;
    nodes: number;
    leaves: number;
    shards: number;
  };
  watcher: {
    enabled: boolean;
    debounce_ms: number;
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const searchDocsDefinition: Tool = {
  name: 'search_docs',
  description: `Semantic search across all documents in the vault using hybrid vector + keyword search.

USE FOR: Finding relevant documents by meaning, not just keywords.
NOT FOR: Listing all files (use list_files), getting specific entity (use get_entity).

FEATURES:
- Hybrid search: combines semantic (vector) and keyword (BM25) matching
- Returns relevant excerpts with context
- Filters by document path or heading

EXAMPLES:
- "Search for authentication implementation details"
- "Find documents about Kubernetes deployment"
- "Search for API design decisions"`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query',
      },
      top_k: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10, max: 100)',
      },
      max_excerpt_chars: {
        type: 'number',
        description: 'Maximum characters per excerpt (default: 500, max: 2000)',
      },
      filters: {
        type: 'object',
        properties: {
          doc_uri_prefix: {
            type: 'string',
            description: 'Filter to documents starting with this path prefix (e.g., "stories/")',
          },
          doc_uris: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter to specific document URIs',
          },
          heading_path_contains: {
            type: 'string',
            description: 'Filter to sections containing this heading path segment',
          },
        },
      },
      include_scores: {
        type: 'boolean',
        description: 'Include detailed scores (vector_score, bm25_score) in results',
      },
    },
    required: ['query'],
  },
};

export const msrlStatusDefinition: Tool = {
  name: 'msrl_status',
  description: `Get the status of the MSRL semantic search index.

USE FOR: Checking if the index is ready, viewing index statistics.
NOT FOR: Searching (use search_docs).

RETURNS:
- state: 'ready', 'building', or 'error'
- snapshot_id: Current snapshot identifier
- stats: Document, node, leaf, and shard counts
- watcher: File watcher status`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const msrlToolDefinitions: Tool[] = [
  searchDocsDefinition,
  msrlStatusDefinition,
];

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handle search_docs tool call.
 * Maps snake_case MCP params to camelCase engine params.
 */
export async function handleSearchDocs(
  engine: MsrlEngine,
  input: SearchDocsInput
): Promise<SearchDocsOutput> {
  const { query, top_k, max_excerpt_chars, filters, include_scores } = input;

  // Map snake_case to camelCase for engine
  const engineParams: EngineQueryParams = {
    query,
    topK: top_k,
    maxExcerptChars: max_excerpt_chars,
    filters: filters
      ? {
          docUriPrefix: filters.doc_uri_prefix,
          docUris: filters.doc_uris,
          headingPathContains: filters.heading_path_contains,
        }
      : undefined,
    debug: include_scores
      ? {
          includeScores: true,
        }
      : undefined,
  };

  const result: QueryResult = await engine.query(engineParams);

  // Map camelCase results back to snake_case for MCP
  return {
    results: result.results.map((r) => ({
      doc_uri: r.docUri,
      heading_path: r.headingPath,
      excerpt: r.excerpt,
      excerpt_truncated: r.excerptTruncated,
      ...(include_scores && {
        score: r.score,
        vector_score: r.vectorScore,
        bm25_score: r.bm25Score,
      }),
    })),
    total_results: result.results.length,
    took_ms: result.meta.tookMs,
  };
}

/**
 * Handle msrl_status tool call.
 * Maps camelCase engine status to snake_case MCP response.
 */
export function handleMsrlStatus(engine: MsrlEngine): MsrlStatusOutput {
  const status: IndexStatus = engine.getStatus();

  return {
    state: status.state,
    snapshot_id: status.snapshotId,
    snapshot_timestamp: status.snapshotTimestamp,
    stats: status.stats,
    watcher: {
      enabled: status.watcher.enabled,
      debounce_ms: status.watcher.debounceMs,
    },
  };
}
