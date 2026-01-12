/**
 * V2 Index Service
 *
 * Provides in-memory indexing for fast entity lookups.
 * Implements primary index, secondary indexes, and relationship graph.
 */

import {
  EntityId,
  EntityType,
  EntityStatus,
  EntityMetadata,
  Priority,
  Effort,
  VaultPath,
  CanvasPath,
} from '../../models/v2-types.js';

// =============================================================================
// Secondary Index Types
// =============================================================================

/** Secondary indexes for efficient filtering */
export interface SecondaryIndexes {
  by_type: Map<EntityType, Set<EntityId>>;
  by_status: Map<EntityStatus, Set<EntityId>>;
  by_workstream: Map<string, Set<EntityId>>;
  by_effort: Map<Effort, Set<EntityId>>;
  by_parent: Map<EntityId, Set<EntityId>>;
  by_canvas: Map<CanvasPath, Set<EntityId>>;
  archived: Set<EntityId>;
  in_progress: Set<EntityId>;
  by_priority: Map<Priority, Set<EntityId>>;
}

// =============================================================================
// Relationship Graph Types
// =============================================================================

export type RelationshipType =
  | 'blocks' | 'blocked_by'
  | 'implements' | 'implemented_by'
  | 'supersedes' | 'superseded_by'
  | 'parent_of' | 'child_of'
  | 'previous_version' | 'next_version';

export interface RelationshipGraph {
  forward: Map<EntityId, Map<RelationshipType, Set<EntityId>>>;
  reverse: Map<EntityId, Map<RelationshipType, Set<EntityId>>>;
}

// =============================================================================
// File Mapping Types
// =============================================================================

export interface FileMappings {
  path_to_id: Map<VaultPath, EntityId>;
  id_to_path: Map<EntityId, VaultPath>;
  file_mtimes: Map<VaultPath, number>;
}

// =============================================================================
// Project Index Class
// =============================================================================

export class ProjectIndex {
  private primary: Map<EntityId, EntityMetadata> = new Map();
  private secondary: SecondaryIndexes;
  private relationships: RelationshipGraph;
  private files: FileMappings;
  private version: number = 0;
  private lastRebuild: number = 0;

  constructor() {
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
  }

  private createEmptySecondaryIndexes(): SecondaryIndexes {
    return {
      by_type: new Map(),
      by_status: new Map(),
      by_workstream: new Map(),
      by_effort: new Map(),
      by_parent: new Map(),
      by_canvas: new Map(),
      archived: new Set(),
      in_progress: new Set(),
      by_priority: new Map(),
    };
  }

  private createEmptyRelationshipGraph(): RelationshipGraph {
    return { forward: new Map(), reverse: new Map() };
  }

  private createEmptyFileMappings(): FileMappings {
    return {
      path_to_id: new Map(),
      id_to_path: new Map(),
      file_mtimes: new Map(),
    };
  }

  // Primary Index Operations
  get(id: EntityId): EntityMetadata | undefined { return this.primary.get(id); }
  has(id: EntityId): boolean { return this.primary.has(id); }
  getAllIds(): EntityId[] { return Array.from(this.primary.keys()); }
  getAll(): EntityMetadata[] { return Array.from(this.primary.values()); }
  get size(): number { return this.primary.size; }
  getVersion(): number { return this.version; }

  set(metadata: EntityMetadata): void {
    const existing = this.primary.get(metadata.id);
    if (existing) this.removeFromSecondaryIndexes(existing);
    this.primary.set(metadata.id, metadata);
    this.addToSecondaryIndexes(metadata);
    this.files.path_to_id.set(metadata.vault_path, metadata.id);
    this.files.id_to_path.set(metadata.id, metadata.vault_path);
    this.files.file_mtimes.set(metadata.vault_path, metadata.file_mtime);
    this.version++;
  }

  delete(id: EntityId): boolean {
    const metadata = this.primary.get(id);
    if (!metadata) return false;
    this.primary.delete(id);
    this.removeFromSecondaryIndexes(metadata);
    this.files.path_to_id.delete(metadata.vault_path);
    this.files.id_to_path.delete(id);
    this.files.file_mtimes.delete(metadata.vault_path);
    this.removeFromRelationships(id);
    this.version++;
    return true;
  }

  /** Remove a stale path mapping without deleting the entity (for duplicate cleanup) */
  removePathMapping(path: VaultPath): void {
    this.files.path_to_id.delete(path);
    this.files.file_mtimes.delete(path);
    this.version++;
  }

  clear(): void {
    this.primary.clear();
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
    this.version++;
    this.lastRebuild = Date.now();
  }

  // Helper to add to set-based index
  private addToSetIndex<K>(map: Map<K, Set<EntityId>>, key: K, id: EntityId): void {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(id);
  }

  // Helper to remove from set-based index
  private removeFromSetIndex<K>(map: Map<K, Set<EntityId>>, key: K, id: EntityId): void {
    const set = map.get(key);
    if (set) { set.delete(id); if (set.size === 0) map.delete(key); }
  }

  private addToSecondaryIndexes(metadata: EntityMetadata): void {
    this.addToSetIndex(this.secondary.by_type, metadata.type, metadata.id);
    this.addToSetIndex(this.secondary.by_status, metadata.status, metadata.id);
    this.addToSetIndex(this.secondary.by_workstream, metadata.workstream, metadata.id);
    if (metadata.effort) this.addToSetIndex(this.secondary.by_effort, metadata.effort, metadata.id);
    if (metadata.parent_id) this.addToSetIndex(this.secondary.by_parent, metadata.parent_id, metadata.id);
    this.addToSetIndex(this.secondary.by_canvas, metadata.canvas_source, metadata.id);
    if (metadata.archived) this.secondary.archived.add(metadata.id);
    if (metadata.in_progress) this.secondary.in_progress.add(metadata.id);
    if (metadata.priority) this.addToSetIndex(this.secondary.by_priority, metadata.priority, metadata.id);
  }

  private removeFromSecondaryIndexes(metadata: EntityMetadata): void {
    this.removeFromSetIndex(this.secondary.by_type, metadata.type, metadata.id);
    this.removeFromSetIndex(this.secondary.by_status, metadata.status, metadata.id);
    this.removeFromSetIndex(this.secondary.by_workstream, metadata.workstream, metadata.id);
    if (metadata.effort) this.removeFromSetIndex(this.secondary.by_effort, metadata.effort, metadata.id);
    if (metadata.parent_id) this.removeFromSetIndex(this.secondary.by_parent, metadata.parent_id, metadata.id);
    this.removeFromSetIndex(this.secondary.by_canvas, metadata.canvas_source, metadata.id);
    this.secondary.archived.delete(metadata.id);
    this.secondary.in_progress.delete(metadata.id);
    if (metadata.priority) this.removeFromSetIndex(this.secondary.by_priority, metadata.priority, metadata.id);
  }

  private removeFromRelationships(id: EntityId): void {
    // Remove all forward relationships
    const forwardRels = this.relationships.forward.get(id);
    if (forwardRels) {
      for (const [relType, targets] of forwardRels) {
        for (const target of targets) {
          const reverseRels = this.relationships.reverse.get(target);
          if (reverseRels) {
            const reverseType = this.getReverseRelationType(relType);
            reverseRels.get(reverseType)?.delete(id);
          }
        }
      }
      this.relationships.forward.delete(id);
    }
    // Remove all reverse relationships
    const reverseRels = this.relationships.reverse.get(id);
    if (reverseRels) {
      for (const [relType, sources] of reverseRels) {
        for (const source of sources) {
          const forwardRels = this.relationships.forward.get(source);
          if (forwardRels) {
            const forwardType = this.getReverseRelationType(relType);
            forwardRels.get(forwardType)?.delete(id);
          }
        }
      }
      this.relationships.reverse.delete(id);
    }
  }

  /**
   * Remove only forward relationships for an entity (relationships where this entity is the source).
   * This is used when re-indexing an entity's relationships without losing relationships
   * where this entity is the target (e.g., parent_of relationships from children).
   *
   * @param excludeTypes - Relationship types to exclude from removal. Use this to preserve
   *                       relationships that are "owned" by other entities (e.g., parent_of
   *                       is owned by children, not parents).
   */
  removeForwardRelationships(id: EntityId, excludeTypes?: RelationshipType[]): void {
    const forwardRels = this.relationships.forward.get(id);
    if (forwardRels) {
      const excludeSet = new Set(excludeTypes || []);
      for (const [relType, targets] of forwardRels) {
        // Skip excluded relationship types
        if (excludeSet.has(relType)) continue;

        for (const target of targets) {
          const reverseRels = this.relationships.reverse.get(target);
          if (reverseRels) {
            const reverseType = this.getReverseRelationType(relType);
            reverseRels.get(reverseType)?.delete(id);
          }
        }
        forwardRels.delete(relType);
      }
      // Only delete the forward map if it's empty
      if (forwardRels.size === 0) {
        this.relationships.forward.delete(id);
      }
    }
  }

  private getReverseRelationType(type: RelationshipType): RelationshipType {
    const reverseMap: Record<RelationshipType, RelationshipType> = {
      'blocks': 'blocked_by', 'blocked_by': 'blocks',
      'implements': 'implemented_by', 'implemented_by': 'implements',
      'supersedes': 'superseded_by', 'superseded_by': 'supersedes',
      'parent_of': 'child_of', 'child_of': 'parent_of',
      'previous_version': 'next_version', 'next_version': 'previous_version',
    };
    return reverseMap[type];
  }

  // Secondary Index Query Methods
  getByType(type: EntityType): EntityMetadata[] {
    const ids = this.secondary.by_type.get(type);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByStatus(status: EntityStatus): EntityMetadata[] {
    const ids = this.secondary.by_status.get(status);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByWorkstream(workstream: string): EntityMetadata[] {
    const ids = this.secondary.by_workstream.get(workstream);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByParent(parentId: EntityId): EntityMetadata[] {
    const ids = this.secondary.by_parent.get(parentId);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByCanvas(canvasPath: CanvasPath): EntityMetadata[] {
    const ids = this.secondary.by_canvas.get(canvasPath);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getArchived(): EntityMetadata[] {
    return Array.from(this.secondary.archived).map(id => this.primary.get(id)!).filter(Boolean);
  }

  getInProgress(): EntityMetadata[] {
    return Array.from(this.secondary.in_progress).map(id => this.primary.get(id)!).filter(Boolean);
  }

  // Relationship Operations
  addRelationship(from: EntityId, type: RelationshipType, to: EntityId): void {
    // Add forward relationship
    let forwardRels = this.relationships.forward.get(from);
    if (!forwardRels) { forwardRels = new Map(); this.relationships.forward.set(from, forwardRels); }
    let targets = forwardRels.get(type);
    if (!targets) { targets = new Set(); forwardRels.set(type, targets); }
    targets.add(to);

    // Add reverse relationship
    const reverseType = this.getReverseRelationType(type);
    let reverseRels = this.relationships.reverse.get(to);
    if (!reverseRels) { reverseRels = new Map(); this.relationships.reverse.set(to, reverseRels); }
    let sources = reverseRels.get(reverseType);
    if (!sources) { sources = new Set(); reverseRels.set(reverseType, sources); }
    sources.add(from);
  }

  getRelated(id: EntityId, type: RelationshipType): EntityId[] {
    const rels = this.relationships.forward.get(id);
    return rels?.get(type) ? Array.from(rels.get(type)!) : [];
  }

  getRelatedReverse(id: EntityId, type: RelationshipType): EntityId[] {
    const rels = this.relationships.reverse.get(id);
    return rels?.get(type) ? Array.from(rels.get(type)!) : [];
  }

  // File Mapping Operations
  getIdByPath(path: VaultPath): EntityId | undefined { return this.files.path_to_id.get(path); }
  getPathById(id: EntityId): VaultPath | undefined { return this.files.id_to_path.get(id); }
  getFileMtime(path: VaultPath): number | undefined { return this.files.file_mtimes.get(path); }
  getAllPaths(): VaultPath[] { return Array.from(this.files.path_to_id.keys()); }
}
