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

export interface ExcerptBudgetInput {
  /** Total character budget across all results (default: 8000) */
  total_chars?: number;
  /** Minimum characters per result (default: 200) */
  min_per_result?: number;
  /** Maximum characters per result (default: 3000) */
  max_per_result?: number;
}

export interface SearchDocsInput {
  query: string;
  top_k?: number;
  /** @deprecated Use excerpt_budget.max_per_result instead */
  max_excerpt_chars?: number;
  /** Minimum score threshold (default: 0.2, floor: 0.2). Results below this are dropped. */
  min_score?: number;
  /** Excerpt budget for relevance-weighted allocation */
  excerpt_budget?: ExcerptBudgetInput;
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
    /** Full content length available (before truncation) */
    content_length: number;
    /** Budget allocated to this result based on relevance score */
    allocated_budget: number;
    score?: number;
    vector_score?: number;
    bm25_score?: number;
  }>;
  total_results: number;
  took_ms: number;
  /** Budget metadata for agent feedback */
  budget_info: {
    /** Total characters returned across all excerpts */
    total_chars_returned: number;
    /** Total characters available (before truncation) */
    total_chars_available: number;
    /** True if any excerpts were truncated due to budget */
    budget_exhausted: boolean;
    /** Results dropped because score < min_score */
    results_dropped_by_score: number;
    /** Results dropped because limit was exceeded */
    results_dropped_by_limit: number;
  };
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
  build_progress?: {
    phase: 'scanning' | 'parsing' | 'embedding' | 'indexing' | 'complete';
    files_processed: number;
    total_files: number;
    chunks_processed: number;
    percent: number;
    current_file?: string;
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
- Relevance-weighted excerpt budgets: higher-scoring results get more context
- Score threshold filtering: drop low-relevance results
- Budget feedback: know when excerpts were truncated to adjust queries

BUDGET BEHAVIOR:
- Total budget (default 8000 chars) is distributed across results based on relevance scores
- Higher-scoring results get proportionally more characters
- If a result's content is smaller than its allocation, surplus is redistributed
- budget_info in response tells you if content was truncated

EXAMPLES:
- "Search for authentication implementation details"
- "Find documents about Kubernetes deployment" with min_score: 0.5 to filter noise
- Large budget search: excerpt_budget: { total_chars: 15000 }`,
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
      min_score: {
        type: 'number',
        description: 'Minimum relevance score threshold (default: 0.2, floor: 0.2). Results below this are dropped.',
      },
      excerpt_budget: {
        type: 'object',
        description: 'Configure how character budget is allocated across results',
        properties: {
          total_chars: {
            type: 'number',
            description: 'Total character budget across all results (default: 8000)',
          },
          min_per_result: {
            type: 'number',
            description: 'Minimum characters per result (default: 200)',
          },
          max_per_result: {
            type: 'number',
            description: 'Maximum characters per result (default: 3000)',
          },
        },
      },
      max_excerpt_chars: {
        type: 'number',
        description: '[DEPRECATED] Use excerpt_budget.max_per_result instead',
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
  const { query, top_k, max_excerpt_chars, min_score, excerpt_budget, filters, include_scores } = input;

  // Map snake_case to camelCase for engine
  const engineParams: EngineQueryParams = {
    query,
    topK: top_k,
    maxExcerptChars: max_excerpt_chars,
    minScore: min_score,
    excerptBudget: excerpt_budget
      ? {
          totalChars: excerpt_budget.total_chars,
          minPerResult: excerpt_budget.min_per_result,
          maxPerResult: excerpt_budget.max_per_result,
        }
      : undefined,
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
      content_length: r.contentLength,
      allocated_budget: r.allocatedBudget,
      ...(include_scores && {
        score: r.score,
        vector_score: r.vectorScore,
        bm25_score: r.bm25Score,
      }),
    })),
    total_results: result.results.length,
    took_ms: result.meta.tookMs,
    budget_info: {
      total_chars_returned: result.meta.totalCharsReturned,
      total_chars_available: result.meta.totalCharsAvailable,
      budget_exhausted: result.meta.budgetExhausted,
      results_dropped_by_score: result.meta.resultsDroppedByScore,
      results_dropped_by_limit: result.meta.resultsDroppedByLimit,
    },
  };
}

/**
 * Handle msrl_status tool call.
 * Maps camelCase engine status to snake_case MCP response.
 */
export function handleMsrlStatus(engine: MsrlEngine): MsrlStatusOutput {
  const status: IndexStatus = engine.getStatus();

  const output: MsrlStatusOutput = {
    state: status.state,
    snapshot_id: status.snapshotId,
    snapshot_timestamp: status.snapshotTimestamp,
    stats: status.stats,
    watcher: {
      enabled: status.watcher.enabled,
      debounce_ms: status.watcher.debounceMs,
    },
  };

  // Include build progress if present
  if (status.buildProgress) {
    output.build_progress = {
      phase: status.buildProgress.phase,
      files_processed: status.buildProgress.filesProcessed,
      total_files: status.buildProgress.totalFiles,
      chunks_processed: status.buildProgress.chunksProcessed,
      percent: status.buildProgress.percent,
      current_file: status.buildProgress.currentFile,
    };
  }

  return output;
}