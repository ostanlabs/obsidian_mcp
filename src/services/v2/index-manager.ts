/**
 * V2 Index Manager
 *
 * Orchestrates index building, updates, and cache invalidation.
 * Provides unified interface for entity lookups and queries.
 */

import {
  EntityId,
  EntityType,
  EntityStatus,
  EntityMetadata,
  Entity,
  VaultPath,
  CanvasPath,
  Priority,
} from '../../models/v2-types.js';
import { ProjectIndex, RelationshipType } from './index-service.js';
import { SearchIndex, SearchResult, SearchOptions } from './search-service.js';

// =============================================================================
// Index Manager Options
// =============================================================================

export interface IndexManagerOptions {
  /** Auto-rebuild interval in ms (0 = disabled) */
  autoRebuildInterval?: number;
}

const DEFAULT_OPTIONS: Required<IndexManagerOptions> = {
  autoRebuildInterval: 0,
};

// =============================================================================
// Query Types
// =============================================================================

export interface EntityQuery {
  types?: EntityType[];
  statuses?: EntityStatus[];
  workstreams?: string[];
  priorities?: Priority[];
  parentId?: EntityId;
  canvasPath?: CanvasPath;
  archived?: boolean;
  inProgress?: boolean;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Index Manager Class
// =============================================================================

/**
 * Central manager for all entity indexes.
 * Coordinates ProjectIndex and SearchIndex.
 */
export class IndexManager {
  private projectIndex: ProjectIndex;
  private searchIndex: SearchIndex;

  constructor(_options: IndexManagerOptions = {}) {
    this.projectIndex = new ProjectIndex();
    this.searchIndex = new SearchIndex();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Stop any running timers (no-op now, kept for API compatibility) */
  stop(): void {
    // No-op - auto-rebuild was removed with cache
  }

  // ---------------------------------------------------------------------------
  // Index Operations
  // ---------------------------------------------------------------------------

  /** Index a single entity */
  indexEntity(entity: Entity, fileMtime: number): void {
    // Create metadata for primary index
    const metadata: EntityMetadata = this.createMetadata(entity, fileMtime);
    this.projectIndex.set(metadata);

    // Index for search
    const content = this.extractSearchableContent(entity);
    this.searchIndex.index(entity.id, entity.title, content, entity.type, entity.archived);

    // Index relationships
    this.indexRelationships(entity);
  }

  /** Remove entity from all indexes */
  removeEntity(id: EntityId): void {
    this.projectIndex.delete(id);
    this.searchIndex.remove(id);
  }

  /** Clear all indexes */
  clearAll(): void {
    this.projectIndex.clear();
    this.searchIndex.clear();
  }

  // ---------------------------------------------------------------------------
  // Metadata Creation
  // ---------------------------------------------------------------------------

  private createMetadata(entity: Entity, fileMtime: number): EntityMetadata {
    const base: EntityMetadata = {
      id: entity.id,
      type: entity.type,
      title: entity.title,
      workstream: entity.workstream,
      status: entity.status,
      archived: entity.archived,
      in_progress: this.isInProgress(entity),
      canvas_source: entity.canvas_source,
      vault_path: entity.vault_path,
      updated_at: entity.updated_at,
      file_mtime: fileMtime,
      children_count: 0,
    };

    // Add type-specific fields
    if (entity.type === 'milestone' || entity.type === 'story') {
      base.priority = (entity as any).priority;
    }
    if (entity.type === 'story') {
      base.parent_id = (entity as any).parent;
    }
    if (entity.type === 'task') {
      base.parent_id = (entity as any).parent;
    }

    return base;
  }

  private isInProgress(entity: Entity): boolean {
    if (entity.type === 'milestone' || entity.type === 'story' || entity.type === 'task') {
      return entity.status === 'In Progress';
    }
    return false;
  }

  private extractSearchableContent(entity: Entity): string {
    const parts: string[] = [entity.title];

    if (entity.type === 'milestone') {
      if ((entity as any).objective) parts.push((entity as any).objective);
    }
    if (entity.type === 'story') {
      if ((entity as any).outcome) parts.push((entity as any).outcome);
      if ((entity as any).notes) parts.push((entity as any).notes);
    }
    if (entity.type === 'task') {
      if ((entity as any).goal) parts.push((entity as any).goal);
      if ((entity as any).description) parts.push((entity as any).description);
    }
    if (entity.type === 'decision') {
      if ((entity as any).context) parts.push((entity as any).context);
      if ((entity as any).decision) parts.push((entity as any).decision);
      if ((entity as any).rationale) parts.push((entity as any).rationale);
    }
    if (entity.type === 'document') {
      if ((entity as any).content) parts.push((entity as any).content);
    }

    return parts.join(' ');
  }

  private indexRelationships(entity: Entity): void {
    // Parent-child relationships
    if (entity.type === 'story' && (entity as any).parent) {
      this.projectIndex.addRelationship((entity as any).parent, 'parent_of', entity.id);
    }
    if (entity.type === 'task' && (entity as any).parent) {
      this.projectIndex.addRelationship((entity as any).parent, 'parent_of', entity.id);
    }

    // Dependency relationships
    if ((entity as any).depends_on) {
      for (const depId of (entity as any).depends_on) {
        this.projectIndex.addRelationship(depId, 'blocks', entity.id);
      }
    }

    // Implementation relationships
    if (entity.type === 'story' && (entity as any).implements) {
      for (const docId of (entity as any).implements) {
        this.projectIndex.addRelationship(entity.id, 'implements', docId);
      }
    }

    // Supersedes relationships
    if (entity.type === 'decision' && (entity as any).supersedes) {
      this.projectIndex.addRelationship(entity.id, 'supersedes', (entity as any).supersedes);
    }
  }

  // ---------------------------------------------------------------------------
  // Query Operations
  // ---------------------------------------------------------------------------

  /** Get entity metadata by ID */
  getMetadata(id: EntityId): EntityMetadata | undefined {
    return this.projectIndex.get(id);
  }

  /** Check if entity exists in index */
  hasMetadata(id: EntityId): boolean {
    return this.projectIndex.has(id);
  }

  /** Check if entity exists */
  hasEntity(id: EntityId): boolean {
    return this.projectIndex.has(id);
  }

  /** Query entities with filters */
  query(q: EntityQuery): EntityMetadata[] {
    let results = this.projectIndex.getAll();

    // Apply filters
    if (q.types?.length) {
      results = results.filter(m => q.types!.includes(m.type));
    }
    if (q.statuses?.length) {
      results = results.filter(m => q.statuses!.includes(m.status));
    }
    if (q.workstreams?.length) {
      results = results.filter(m => q.workstreams!.includes(m.workstream));
    }
    if (q.priorities?.length) {
      results = results.filter(m => m.priority && q.priorities!.includes(m.priority));
    }
    if (q.parentId) {
      results = results.filter(m => m.parent_id === q.parentId);
    }
    if (q.canvasPath) {
      results = results.filter(m => m.canvas_source === q.canvasPath);
    }
    if (q.archived !== undefined) {
      results = results.filter(m => m.archived === q.archived);
    }
    if (q.inProgress !== undefined) {
      results = results.filter(m => m.in_progress === q.inProgress);
    }

    // Apply pagination
    if (q.offset) results = results.slice(q.offset);
    if (q.limit) results = results.slice(0, q.limit);

    return results;
  }

  /** Search entities */
  search(query: string, options?: SearchOptions): SearchResult[] {
    return this.searchIndex.search(query, options);
  }

  /** Get related entities */
  getRelated(id: EntityId, type: RelationshipType): EntityId[] {
    return this.projectIndex.getRelated(id, type);
  }

  /** Get children of entity */
  getChildren(parentId: EntityId): EntityMetadata[] {
    return this.projectIndex.getByParent(parentId);
  }

  /** Get entity by file path */
  getByPath(path: VaultPath): EntityMetadata | undefined {
    const id = this.projectIndex.getIdByPath(path);
    return id ? this.projectIndex.get(id) : undefined;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  getStats(): {
    entityCount: number;
    searchStats: ReturnType<SearchIndex['getStats']>;
    indexVersion: number;
  } {
    return {
      entityCount: this.projectIndex.size,
      searchStats: this.searchIndex.getStats(),
      indexVersion: this.projectIndex.getVersion(),
    };
  }
}
