/**
 * Pagination Utilities
 *
 * Helper functions for implementing pagination across MCP tools.
 * Defaults are conservative (max_items: 20) for smaller LLM contexts.
 * Agents with larger context windows can increase these values.
 */

import {
  PaginationInput,
  PaginationOutput,
  PAGINATION_DEFAULTS,
} from './tool-types.js';

/**
 * Decoded continuation token structure.
 */
export interface ContinuationToken {
  offset: number;
  /** Optional context for validation */
  context?: string;
}

/**
 * Encode a continuation token for the response.
 */
export function encodeContinuationToken(token: ContinuationToken): string {
  return Buffer.from(JSON.stringify(token)).toString('base64url');
}

/**
 * Decode a continuation token from the request.
 * Returns null if token is invalid.
 */
export function decodeContinuationToken(encoded: string): ContinuationToken | null {
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (typeof parsed.offset !== 'number' || parsed.offset < 0) {
      return null;
    }
    return parsed as ContinuationToken;
  } catch {
    return null;
  }
}

/**
 * Measure the approximate size of a value in bytes when JSON serialized.
 */
export function measureResponseSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}

/**
 * Options for applying pagination to an array.
 */
export interface ApplyPaginationOptions<T> {
  /** The full array of items to paginate */
  items: T[];
  /** Pagination input from the request */
  pagination?: PaginationInput;
  /** Optional context string for continuation token validation */
  context?: string;
}

/**
 * Result of applying pagination to an array.
 */
export interface ApplyPaginationResult<T> {
  /** The paginated subset of items */
  items: T[];
  /** Pagination metadata for the response */
  pagination: PaginationOutput;
}

/**
 * Apply pagination to an array of items.
 *
 * @param options Pagination options including items and input parameters
 * @returns Paginated items and metadata
 */
export function applyPagination<T>(
  options: ApplyPaginationOptions<T>
): ApplyPaginationResult<T> {
  const { items, pagination: input, context } = options;

  // Determine offset from continuation token or start at 0
  let offset = 0;
  if (input?.continuation_token) {
    const token = decodeContinuationToken(input.continuation_token);
    if (token) {
      // Optionally validate context matches
      if (context && token.context && token.context !== context) {
        // Context mismatch - start from beginning
        offset = 0;
      } else {
        offset = token.offset;
      }
    }
  }

  // Determine max items (with bounds)
  let maxItems = input?.max_items ?? PAGINATION_DEFAULTS.MAX_ITEMS;
  maxItems = Math.min(maxItems, PAGINATION_DEFAULTS.MAX_ITEMS_LIMIT);
  maxItems = Math.max(maxItems, 1);

  // Slice items
  let paginatedItems = items.slice(offset, offset + maxItems);

  // Apply max_response_size if specified
  let responseSizeBytes: number | undefined;
  if (input?.max_response_size && input.max_response_size > 0) {
    // Incrementally add items until size limit is reached
    const sizeLimit = input.max_response_size;
    const fittingItems: T[] = [];

    for (const item of paginatedItems) {
      const testItems = [...fittingItems, item];
      const size = measureResponseSize(testItems);
      if (size > sizeLimit && fittingItems.length > 0) {
        // Adding this item would exceed limit, stop here
        break;
      }
      fittingItems.push(item);
      responseSizeBytes = size;
    }
    paginatedItems = fittingItems;
  } else {
    responseSizeBytes = measureResponseSize(paginatedItems);
  }

  // Calculate pagination metadata
  const totalItems = items.length;
  const returned = paginatedItems.length;
  const nextOffset = offset + returned;
  const hasMore = nextOffset < totalItems;
  const page = Math.floor(offset / maxItems) + 1;
  const totalPages = Math.ceil(totalItems / maxItems);

  // Build continuation token if there are more items
  let continuationToken: string | undefined;
  if (hasMore) {
    continuationToken = encodeContinuationToken({
      offset: nextOffset,
      context,
    });
  }

  return {
    items: paginatedItems,
    pagination: {
      returned,
      total_items: totalItems,
      total_pages: totalPages,
      page,
      has_more: hasMore,
      continuation_token: continuationToken,
      response_size_bytes: responseSizeBytes,
    },
  };
}
