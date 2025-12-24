/**
 * V2 Search Service
 *
 * Provides token-based inverted index for full-text search across entities.
 */

import { EntityId, EntityMetadata } from '../../models/v2-types.js';

// =============================================================================
// Search Index Types
// =============================================================================

/** Search result with relevance score */
export interface SearchResult {
  id: EntityId;
  score: number;
  matches: {
    field: string;
    positions: number[];
  }[];
}

/** Search options */
export interface SearchOptions {
  /** Fields to search (default: all) */
  fields?: ('title' | 'content' | 'tags')[];
  /** Maximum results to return */
  limit?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Filter by entity type */
  types?: string[];
  /** Include archived entities */
  includeArchived?: boolean;
}

// =============================================================================
// Search Index Class
// =============================================================================

/**
 * Token-based inverted index for full-text search.
 */
export class SearchIndex {
  /** Inverted index: token -> Set of entity IDs */
  private titleIndex: Map<string, Set<EntityId>> = new Map();
  private contentIndex: Map<string, Set<EntityId>> = new Map();

  /** Document frequency for TF-IDF scoring */
  private documentCount: number = 0;
  private tokenDocFreq: Map<string, number> = new Map();

  /** Entity metadata cache for filtering */
  private entityMeta: Map<EntityId, { type: string; archived: boolean }> = new Map();

  // ---------------------------------------------------------------------------
  // Indexing Operations
  // ---------------------------------------------------------------------------

  /** Add or update entity in search index */
  index(id: EntityId, title: string, content: string, type: string, archived: boolean): void {
    // Remove existing entry if updating
    this.remove(id);

    // Tokenize and index title
    const titleTokens = this.tokenize(title);
    for (const token of titleTokens) {
      this.addToIndex(this.titleIndex, token, id);
      this.incrementDocFreq(token);
    }

    // Tokenize and index content
    const contentTokens = this.tokenize(content);
    for (const token of contentTokens) {
      this.addToIndex(this.contentIndex, token, id);
      this.incrementDocFreq(token);
    }

    // Store metadata
    this.entityMeta.set(id, { type, archived });
    this.documentCount++;
  }

  /** Remove entity from search index */
  remove(id: EntityId): void {
    if (!this.entityMeta.has(id)) return;

    // Remove from title index
    for (const [token, ids] of this.titleIndex) {
      if (ids.delete(id)) {
        this.decrementDocFreq(token);
        if (ids.size === 0) this.titleIndex.delete(token);
      }
    }

    // Remove from content index
    for (const [token, ids] of this.contentIndex) {
      if (ids.delete(id)) {
        this.decrementDocFreq(token);
        if (ids.size === 0) this.contentIndex.delete(token);
      }
    }

    this.entityMeta.delete(id);
    this.documentCount--;
  }

  /** Clear all indexes */
  clear(): void {
    this.titleIndex.clear();
    this.contentIndex.clear();
    this.tokenDocFreq.clear();
    this.entityMeta.clear();
    this.documentCount = 0;
  }

  // ---------------------------------------------------------------------------
  // Search Operations
  // ---------------------------------------------------------------------------

  /** Search for entities matching query */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const { fields = ['title', 'content'], limit = 50, minScore = 0.1, types, includeArchived = false } = options;

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Collect matching entity IDs with scores
    const scores = new Map<EntityId, number>();
    const matches = new Map<EntityId, SearchResult['matches']>();

    for (const token of queryTokens) {
      const idf = this.calculateIDF(token);

      if (fields.includes('title')) {
        const titleMatches = this.titleIndex.get(token);
        if (titleMatches) {
          for (const id of titleMatches) {
            const currentScore = scores.get(id) || 0;
            scores.set(id, currentScore + idf * 2); // Title matches weighted 2x
            this.addMatch(matches, id, 'title', token);
          }
        }
      }

      if (fields.includes('content')) {
        const contentMatches = this.contentIndex.get(token);
        if (contentMatches) {
          for (const id of contentMatches) {
            const currentScore = scores.get(id) || 0;
            scores.set(id, currentScore + idf);
            this.addMatch(matches, id, 'content', token);
          }
        }
      }
    }

    // Filter and sort results
    const results: SearchResult[] = [];
    for (const [id, score] of scores) {
      if (score < minScore) continue;

      const meta = this.entityMeta.get(id);
      if (!meta) continue;
      if (!includeArchived && meta.archived) continue;
      if (types && !types.includes(meta.type)) continue;

      results.push({ id, score, matches: matches.get(id) || [] });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /** Tokenize text into searchable tokens */
  private tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2)
      .map(token => token.trim());
  }

  /** Add entity to token index */
  private addToIndex(index: Map<string, Set<EntityId>>, token: string, id: EntityId): void {
    let ids = index.get(token);
    if (!ids) { ids = new Set(); index.set(token, ids); }
    ids.add(id);
  }

  /** Increment document frequency for token */
  private incrementDocFreq(token: string): void {
    this.tokenDocFreq.set(token, (this.tokenDocFreq.get(token) || 0) + 1);
  }

  /** Decrement document frequency for token */
  private decrementDocFreq(token: string): void {
    const freq = this.tokenDocFreq.get(token) || 0;
    if (freq <= 1) {
      this.tokenDocFreq.delete(token);
    } else {
      this.tokenDocFreq.set(token, freq - 1);
    }
  }

  /** Calculate IDF (Inverse Document Frequency) for token */
  private calculateIDF(token: string): number {
    const docFreq = this.tokenDocFreq.get(token) || 0;
    if (docFreq === 0 || this.documentCount === 0) return 0;
    return Math.log(this.documentCount / docFreq) + 1;
  }

  /** Add match info to results */
  private addMatch(
    matches: Map<EntityId, SearchResult['matches']>,
    id: EntityId,
    field: string,
    token: string
  ): void {
    let entityMatches = matches.get(id);
    if (!entityMatches) { entityMatches = []; matches.set(id, entityMatches); }

    let fieldMatch = entityMatches.find(m => m.field === field);
    if (!fieldMatch) {
      fieldMatch = { field, positions: [] };
      entityMatches.push(fieldMatch);
    }
    // Position tracking simplified - just count matches
    fieldMatch.positions.push(fieldMatch.positions.length);
  }

  /** Get index statistics */
  getStats(): { documentCount: number; titleTokens: number; contentTokens: number } {
    return {
      documentCount: this.documentCount,
      titleTokens: this.titleIndex.size,
      contentTokens: this.contentIndex.size,
    };
  }
}
