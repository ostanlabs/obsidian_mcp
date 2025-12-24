# Index and Cache Design

> **Version:** 2.0
> **Date:** December 2024
> **Scope:** MCP Server Implementation
> **Status:** Implementation Spec

---

## Overview

The MCP Server needs fast access to entity metadata, relationships, and search without parsing every markdown file on each request. This document specifies the in-memory index structure, cache invalidation strategy, and persistence approach.

---

## Table of Contents

1. [Design Goals](#design-goals)
2. [Index Architecture](#index-architecture)
3. [Primary Index](#primary-index)
4. [Secondary Indexes](#secondary-indexes)
5. [Relationship Graph](#relationship-graph)
6. [Search Index](#search-index)
7. [Cache Invalidation](#cache-invalidation)
8. [Persistence](#persistence)
9. [Initialization](#initialization)
10. [Performance Targets](#performance-targets)

---

## Design Goals

| Goal | Target | Rationale |
|------|--------|-----------|
| **Fast lookups** | < 1ms for by-ID lookup | Tool responses must be instant |
| **Fast filtering** | < 10ms for filtered list | Status/type/workstream queries |
| **Fast search** | < 50ms for text search | Full-text across titles/content |
| **Memory efficient** | < 50MB for 10K entities | Run alongside Obsidian |
| **Consistent** | Always reflects file state | No stale data |
| **Recoverable** | Rebuild from files | Index is derived, not source |

---

## Index Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ProjectIndex                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Primary Index                          │  │
│  │  Map<EntityId, EntityMetadata>                           │  │
│  │  • All entity metadata (not full content)                │  │
│  │  • O(1) lookup by ID                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Secondary Indexes                       │  │
│  │                                                            │  │
│  │  by_type:       Map<EntityType, Set<EntityId>>           │  │
│  │  by_status:     Map<EntityStatus, Set<EntityId>>         │  │
│  │  by_workstream: Map<string, Set<EntityId>>               │  │
│  │  by_effort:     Map<string, Set<EntityId>>               │  │
│  │  by_parent:     Map<EntityId, Set<EntityId>>             │  │
│  │  by_canvas:     Map<CanvasPath, Set<EntityId>>           │  │
│  │  by_archived:   Set<EntityId>                            │  │
│  │  in_progress:   Set<EntityId>                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Relationship Graph                      │  │
│  │                                                            │  │
│  │  blocks:      Map<EntityId, Set<EntityId>>  (A blocks B) │  │
│  │  blocked_by:  Map<EntityId, Set<EntityId>>  (B blocked by A)│
│  │  implements:  Map<DocumentId, Set<StoryId>>              │  │
│  │  implemented_by: Map<StoryId, Set<DocumentId>>           │  │
│  │  enables:     Map<DecisionId, Set<EntityId>>             │  │
│  │  enabled_by:  Map<EntityId, Set<DecisionId>>             │  │
│  │  supersedes:  Map<EntityId, EntityId>                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     Search Index                          │  │
│  │                                                            │  │
│  │  title_tokens:   Map<string, Set<EntityId>>              │  │
│  │  content_tokens: Map<string, Set<EntityId>>              │  │
│  │  tag_index:      Map<string, Set<EntityId>>              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    File Mappings                          │  │
│  │                                                            │  │
│  │  path_to_id:  Map<VaultPath, EntityId>                   │  │
│  │  id_to_path:  Map<EntityId, VaultPath>                   │  │
│  │  file_mtimes: Map<VaultPath, number>                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Primary Index

### EntityMetadata Structure

```typescript
interface EntityMetadata {
  // === IDENTITY ===
  id: EntityId;
  type: EntityType;
  title: string;
  
  // === ORGANIZATION ===
  workstream: string;
  effort?: string;              // For stories/tasks
  priority?: Priority;
  
  // === LIFECYCLE ===
  status: EntityStatus;
  archived: boolean;
  in_progress: boolean;         // Cached flag for quick filtering
  
  // === HIERARCHY ===
  parent_id?: EntityId;
  children_count: number;       // Cached count
  
  // === RELATIONSHIPS ===
  blocks_count: number;         // How many entities this blocks
  blocked_by_count: number;     // How many block this entity
  is_blocked: boolean;          // Cached: has incomplete blockers
  
  // === PROGRESS (for containers) ===
  task_progress?: {
    total: number;
    complete: number;
    in_progress: number;
  };
  
  // === FILE INFO ===
  vault_path: VaultPath;
  canvas_source: CanvasPath;
  
  // === TIMESTAMPS ===
  created_at: number;           // Unix timestamp for sorting
  updated_at: number;
  
  // === SEARCH ===
  title_lower: string;          // Lowercase for case-insensitive search
  search_snippet?: string;      // First ~200 chars of content
}
```

### Primary Index Operations

```typescript
class PrimaryIndex {
  private entities: Map<EntityId, EntityMetadata> = new Map();
  
  // O(1) operations
  get(id: EntityId): EntityMetadata | undefined;
  has(id: EntityId): boolean;
  set(id: EntityId, metadata: EntityMetadata): void;
  delete(id: EntityId): boolean;
  
  // O(n) operations (use secondary indexes instead)
  values(): IterableIterator<EntityMetadata>;
  entries(): IterableIterator<[EntityId, EntityMetadata]>;
  
  // Size
  get size(): number;
}
```

---

## Secondary Indexes

### Index Structure

```typescript
class SecondaryIndexes {
  // Type index: entity type → entity IDs
  by_type: Map<EntityType, Set<EntityId>> = new Map([
    ['milestone', new Set()],
    ['story', new Set()],
    ['task', new Set()],
    ['decision', new Set()],
    ['document', new Set()],
  ]);
  
  // Status index: status → entity IDs
  by_status: Map<EntityStatus, Set<EntityId>> = new Map();
  
  // Workstream index: workstream name → entity IDs
  by_workstream: Map<string, Set<EntityId>> = new Map();
  
  // Effort index: effort type → entity IDs (stories/tasks only)
  by_effort: Map<string, Set<EntityId>> = new Map();
  
  // Parent index: parent ID → child IDs
  by_parent: Map<EntityId, Set<EntityId>> = new Map();
  
  // Canvas index: canvas path → entity IDs
  by_canvas: Map<CanvasPath, Set<EntityId>> = new Map();
  
  // Special sets
  archived: Set<EntityId> = new Set();
  in_progress: Set<EntityId> = new Set();
}
```

### Index Maintenance

```typescript
class SecondaryIndexes {
  // Add entity to all relevant indexes
  addEntity(metadata: EntityMetadata): void {
    // Type index
    this.by_type.get(metadata.type)?.add(metadata.id);
    
    // Status index
    if (!this.by_status.has(metadata.status)) {
      this.by_status.set(metadata.status, new Set());
    }
    this.by_status.get(metadata.status)!.add(metadata.id);
    
    // Workstream index
    if (!this.by_workstream.has(metadata.workstream)) {
      this.by_workstream.set(metadata.workstream, new Set());
    }
    this.by_workstream.get(metadata.workstream)!.add(metadata.id);
    
    // Effort index (if applicable)
    if (metadata.effort) {
      if (!this.by_effort.has(metadata.effort)) {
        this.by_effort.set(metadata.effort, new Set());
      }
      this.by_effort.get(metadata.effort)!.add(metadata.id);
    }
    
    // Parent index
    if (metadata.parent_id) {
      if (!this.by_parent.has(metadata.parent_id)) {
        this.by_parent.set(metadata.parent_id, new Set());
      }
      this.by_parent.get(metadata.parent_id)!.add(metadata.id);
    }
    
    // Canvas index
    if (!this.by_canvas.has(metadata.canvas_source)) {
      this.by_canvas.set(metadata.canvas_source, new Set());
    }
    this.by_canvas.get(metadata.canvas_source)!.add(metadata.id);
    
    // Special sets
    if (metadata.archived) {
      this.archived.add(metadata.id);
    }
    if (metadata.in_progress) {
      this.in_progress.add(metadata.id);
    }
  }
  
  // Remove entity from all indexes
  removeEntity(metadata: EntityMetadata): void {
    this.by_type.get(metadata.type)?.delete(metadata.id);
    this.by_status.get(metadata.status)?.delete(metadata.id);
    this.by_workstream.get(metadata.workstream)?.delete(metadata.id);
    if (metadata.effort) {
      this.by_effort.get(metadata.effort)?.delete(metadata.id);
    }
    if (metadata.parent_id) {
      this.by_parent.get(metadata.parent_id)?.delete(metadata.id);
    }
    this.by_canvas.get(metadata.canvas_source)?.delete(metadata.id);
    this.archived.delete(metadata.id);
    this.in_progress.delete(metadata.id);
  }
  
  // Update entity: remove old, add new
  updateEntity(oldMetadata: EntityMetadata, newMetadata: EntityMetadata): void {
    this.removeEntity(oldMetadata);
    this.addEntity(newMetadata);
  }
}
```

### Query Operations

```typescript
class SecondaryIndexes {
  // Get entities by type
  getByType(type: EntityType): Set<EntityId> {
    return this.by_type.get(type) ?? new Set();
  }
  
  // Get entities by status
  getByStatus(status: EntityStatus): Set<EntityId> {
    return this.by_status.get(status) ?? new Set();
  }
  
  // Get entities by workstream
  getByWorkstream(workstream: string): Set<EntityId> {
    return this.by_workstream.get(workstream) ?? new Set();
  }
  
  // Get children of a parent
  getChildren(parentId: EntityId): Set<EntityId> {
    return this.by_parent.get(parentId) ?? new Set();
  }
  
  // Get entities on a canvas
  getByCanvas(canvas: CanvasPath): Set<EntityId> {
    return this.by_canvas.get(canvas) ?? new Set();
  }
  
  // Intersection query: combine multiple filters
  query(filters: {
    type?: EntityType;
    status?: EntityStatus;
    workstream?: string;
    effort?: string;
    archived?: boolean;
    in_progress?: boolean;
    canvas?: CanvasPath;
  }): Set<EntityId> {
    let result: Set<EntityId> | null = null;
    
    // Start with smallest set for efficiency
    const sets: Set<EntityId>[] = [];
    
    if (filters.type) sets.push(this.getByType(filters.type));
    if (filters.status) sets.push(this.getByStatus(filters.status));
    if (filters.workstream) sets.push(this.getByWorkstream(filters.workstream));
    if (filters.effort) sets.push(this.by_effort.get(filters.effort) ?? new Set());
    if (filters.canvas) sets.push(this.getByCanvas(filters.canvas));
    if (filters.archived === true) sets.push(this.archived);
    if (filters.in_progress === true) sets.push(this.in_progress);
    
    // Sort by size (smallest first)
    sets.sort((a, b) => a.size - b.size);
    
    // Intersect all sets
    for (const set of sets) {
      if (result === null) {
        result = new Set(set);
      } else {
        result = new Set([...result].filter(id => set.has(id)));
      }
      // Early exit if empty
      if (result.size === 0) break;
    }
    
    // Handle archived=false (exclude archived)
    if (filters.archived === false && result) {
      result = new Set([...result].filter(id => !this.archived.has(id)));
    }
    
    return result ?? new Set();
  }
}
```

---

## Relationship Graph

### Graph Structure

```typescript
class RelationshipGraph {
  // Dependency relationships (blocks/blocked_by)
  private blocks: Map<EntityId, Set<EntityId>> = new Map();
  private blocked_by: Map<EntityId, Set<EntityId>> = new Map();
  
  // Implementation relationships
  private implements: Map<StoryId, Set<DocumentId>> = new Map();
  private implemented_by: Map<DocumentId, Set<StoryId>> = new Map();
  
  // Enable relationships (decisions → entities)
  private enables: Map<DecisionId, Set<EntityId>> = new Map();
  private enabled_by: Map<EntityId, Set<DecisionId>> = new Map();
  
  // Supersedes relationships
  private supersedes: Map<EntityId, EntityId> = new Map();      // new → old
  private superseded_by: Map<EntityId, EntityId> = new Map();   // old → new
}
```

### Graph Operations

```typescript
class RelationshipGraph {
  // === DEPENDENCY OPERATIONS ===
  
  addDependency(blocker: EntityId, blocked: EntityId): void {
    // blocker blocks blocked
    if (!this.blocks.has(blocker)) {
      this.blocks.set(blocker, new Set());
    }
    this.blocks.get(blocker)!.add(blocked);
    
    // blocked is blocked_by blocker
    if (!this.blocked_by.has(blocked)) {
      this.blocked_by.set(blocked, new Set());
    }
    this.blocked_by.get(blocked)!.add(blocker);
  }
  
  removeDependency(blocker: EntityId, blocked: EntityId): void {
    this.blocks.get(blocker)?.delete(blocked);
    this.blocked_by.get(blocked)?.delete(blocker);
  }
  
  // Get what this entity blocks
  getBlocks(id: EntityId): Set<EntityId> {
    return this.blocks.get(id) ?? new Set();
  }
  
  // Get what blocks this entity
  getBlockedBy(id: EntityId): Set<EntityId> {
    return this.blocked_by.get(id) ?? new Set();
  }
  
  // === IMPLEMENTATION OPERATIONS ===
  
  addImplements(storyId: StoryId, docId: DocumentId): void {
    if (!this.implements.has(storyId)) {
      this.implements.set(storyId, new Set());
    }
    this.implements.get(storyId)!.add(docId);
    
    if (!this.implemented_by.has(docId)) {
      this.implemented_by.set(docId, new Set());
    }
    this.implemented_by.get(docId)!.add(storyId);
  }
  
  // === ENABLE OPERATIONS ===
  
  addEnables(decisionId: DecisionId, entityId: EntityId): void {
    if (!this.enables.has(decisionId)) {
      this.enables.set(decisionId, new Set());
    }
    this.enables.get(decisionId)!.add(entityId);
    
    if (!this.enabled_by.has(entityId)) {
      this.enabled_by.set(entityId, new Set());
    }
    this.enabled_by.get(entityId)!.add(decisionId);
  }
  
  // === GRAPH ALGORITHMS ===
  
  // Get all entities transitively blocked by this entity
  getTransitiveBlocks(id: EntityId): Set<EntityId> {
    const result = new Set<EntityId>();
    const queue = [...(this.blocks.get(id) ?? [])];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!result.has(current)) {
        result.add(current);
        queue.push(...(this.blocks.get(current) ?? []));
      }
    }
    
    return result;
  }
  
  // Get all entities that must complete before this one
  getTransitiveBlockedBy(id: EntityId): Set<EntityId> {
    const result = new Set<EntityId>();
    const queue = [...(this.blocked_by.get(id) ?? [])];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!result.has(current)) {
        result.add(current);
        queue.push(...(this.blocked_by.get(current) ?? []));
      }
    }
    
    return result;
  }
  
  // Detect cycles in dependency graph
  hasCycle(startId: EntityId): boolean {
    const visited = new Set<EntityId>();
    const recursionStack = new Set<EntityId>();
    
    const dfs = (id: EntityId): boolean => {
      visited.add(id);
      recursionStack.add(id);
      
      for (const blocked of this.blocks.get(id) ?? []) {
        if (!visited.has(blocked)) {
          if (dfs(blocked)) return true;
        } else if (recursionStack.has(blocked)) {
          return true;
        }
      }
      
      recursionStack.delete(id);
      return false;
    };
    
    return dfs(startId);
  }
  
  // Get connected components (for orphan detection)
  getConnectedComponents(): EntityId[][] {
    const visited = new Set<EntityId>();
    const components: EntityId[][] = [];
    
    // Get all nodes
    const allNodes = new Set<EntityId>();
    for (const [id] of this.blocks) allNodes.add(id);
    for (const [id] of this.blocked_by) allNodes.add(id);
    
    for (const startId of allNodes) {
      if (visited.has(startId)) continue;
      
      const component: EntityId[] = [];
      const queue = [startId];
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        component.push(current);
        
        // Add neighbors (both directions)
        for (const neighbor of this.blocks.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
        for (const neighbor of this.blocked_by.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      
      components.push(component);
    }
    
    return components;
  }
  
  // Get critical path (longest chain of dependencies)
  getCriticalPath(primary: PrimaryIndex): EntityId[] {
    // Find entities with no blockers (start nodes)
    const startNodes: EntityId[] = [];
    for (const [id] of this.blocked_by) {
      if ((this.blocked_by.get(id)?.size ?? 0) === 0) {
        startNodes.push(id);
      }
    }
    
    // DFS to find longest path
    let longestPath: EntityId[] = [];
    
    const dfs = (id: EntityId, path: EntityId[]): void => {
      path.push(id);
      
      const blocks = this.blocks.get(id);
      if (!blocks || blocks.size === 0) {
        // End of path
        if (path.length > longestPath.length) {
          longestPath = [...path];
        }
      } else {
        for (const next of blocks) {
          dfs(next, path);
        }
      }
      
      path.pop();
    };
    
    for (const start of startNodes) {
      dfs(start, []);
    }
    
    return longestPath;
  }
}
```

---

## Search Index

### Token-Based Search

```typescript
class SearchIndex {
  // Inverted index: token → entity IDs
  private title_tokens: Map<string, Set<EntityId>> = new Map();
  private content_tokens: Map<string, Set<EntityId>> = new Map();
  
  // Tokenization
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .split(/\s+/)               // Split on whitespace
      .filter(t => t.length >= 2) // Min token length
      .filter(t => !STOP_WORDS.has(t));
  }
  
  // Add entity to search index
  addEntity(id: EntityId, title: string, content?: string): void {
    // Index title
    for (const token of this.tokenize(title)) {
      if (!this.title_tokens.has(token)) {
        this.title_tokens.set(token, new Set());
      }
      this.title_tokens.get(token)!.add(id);
    }
    
    // Index content (if provided)
    if (content) {
      for (const token of this.tokenize(content)) {
        if (!this.content_tokens.has(token)) {
          this.content_tokens.set(token, new Set());
        }
        this.content_tokens.get(token)!.add(id);
      }
    }
  }
  
  // Remove entity from search index
  removeEntity(id: EntityId): void {
    for (const [, ids] of this.title_tokens) {
      ids.delete(id);
    }
    for (const [, ids] of this.content_tokens) {
      ids.delete(id);
    }
  }
  
  // Search for entities
  search(query: string, options?: {
    titleOnly?: boolean;
    limit?: number;
  }): SearchResult[] {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return [];
    
    // Score each entity
    const scores: Map<EntityId, number> = new Map();
    
    for (const token of tokens) {
      // Title matches (weight: 3)
      const titleMatches = this.title_tokens.get(token);
      if (titleMatches) {
        for (const id of titleMatches) {
          scores.set(id, (scores.get(id) ?? 0) + 3);
        }
      }
      
      // Content matches (weight: 1)
      if (!options?.titleOnly) {
        const contentMatches = this.content_tokens.get(token);
        if (contentMatches) {
          for (const id of contentMatches) {
            scores.set(id, (scores.get(id) ?? 0) + 1);
          }
        }
      }
    }
    
    // Sort by score
    const results: SearchResult[] = [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);
    
    // Apply limit
    if (options?.limit) {
      return results.slice(0, options.limit);
    }
    
    return results;
  }
  
  // Prefix search (for autocomplete)
  prefixSearch(prefix: string): Set<EntityId> {
    const lowerPrefix = prefix.toLowerCase();
    const results = new Set<EntityId>();
    
    for (const [token, ids] of this.title_tokens) {
      if (token.startsWith(lowerPrefix)) {
        for (const id of ids) {
          results.add(id);
        }
      }
    }
    
    return results;
  }
}

interface SearchResult {
  id: EntityId;
  score: number;
}

// Common stop words to exclude
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these',
  'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'hers',
]);
```

---

## Cache Invalidation

### File Watcher Integration

```typescript
interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: VaultPath;
  oldPath?: VaultPath;  // For rename
}

class IndexManager {
  private primary: PrimaryIndex;
  private secondary: SecondaryIndexes;
  private graph: RelationshipGraph;
  private search: SearchIndex;
  private fileMtimes: Map<VaultPath, number>;
  
  // Handle file change events
  async handleFileChange(event: FileChangeEvent): Promise<void> {
    switch (event.type) {
      case 'create':
        await this.indexFile(event.path);
        break;
        
      case 'modify':
        await this.reindexFile(event.path);
        break;
        
      case 'delete':
        await this.removeFile(event.path);
        break;
        
      case 'rename':
        await this.renameFile(event.oldPath!, event.path);
        break;
    }
  }
  
  private async indexFile(path: VaultPath): Promise<void> {
    // Parse file
    const content = await this.readFile(path);
    const metadata = this.parseMetadata(content, path);
    
    if (!metadata) return;  // Not an entity file
    
    // Add to indexes
    this.primary.set(metadata.id, metadata);
    this.secondary.addEntity(metadata);
    this.indexRelationships(metadata, content);
    this.search.addEntity(metadata.id, metadata.title, content);
    
    // Track mtime
    this.fileMtimes.set(path, Date.now());
  }
  
  private async reindexFile(path: VaultPath): Promise<void> {
    const entityId = this.pathToId.get(path);
    if (!entityId) {
      // New entity file
      await this.indexFile(path);
      return;
    }
    
    const oldMetadata = this.primary.get(entityId);
    if (!oldMetadata) return;
    
    // Parse new content
    const content = await this.readFile(path);
    const newMetadata = this.parseMetadata(content, path);
    
    if (!newMetadata) {
      // File no longer an entity
      await this.removeFile(path);
      return;
    }
    
    // Update indexes
    this.primary.set(newMetadata.id, newMetadata);
    this.secondary.updateEntity(oldMetadata, newMetadata);
    this.reindexRelationships(oldMetadata, newMetadata, content);
    this.search.removeEntity(oldMetadata.id);
    this.search.addEntity(newMetadata.id, newMetadata.title, content);
    
    // Update mtime
    this.fileMtimes.set(path, Date.now());
  }
  
  private async removeFile(path: VaultPath): Promise<void> {
    const entityId = this.pathToId.get(path);
    if (!entityId) return;
    
    const metadata = this.primary.get(entityId);
    if (!metadata) return;
    
    // Remove from all indexes
    this.primary.delete(entityId);
    this.secondary.removeEntity(metadata);
    this.removeRelationships(entityId);
    this.search.removeEntity(entityId);
    
    // Remove file mappings
    this.pathToId.delete(path);
    this.idToPath.delete(entityId);
    this.fileMtimes.delete(path);
  }
}
```

### Batch Operations

```typescript
class IndexManager {
  // Batch update for efficiency
  async batchUpdate(changes: FileChangeEvent[]): Promise<void> {
    // Group by type for efficiency
    const creates = changes.filter(c => c.type === 'create');
    const modifies = changes.filter(c => c.type === 'modify');
    const deletes = changes.filter(c => c.type === 'delete');
    const renames = changes.filter(c => c.type === 'rename');
    
    // Process deletes first (to free IDs)
    for (const event of deletes) {
      await this.removeFile(event.path);
    }
    
    // Process renames
    for (const event of renames) {
      await this.renameFile(event.oldPath!, event.path);
    }
    
    // Process creates
    for (const event of creates) {
      await this.indexFile(event.path);
    }
    
    // Process modifies
    for (const event of modifies) {
      await this.reindexFile(event.path);
    }
    
    // Recompute derived fields
    this.recomputeBlockedStatus();
    this.recomputeChildCounts();
    this.recomputeTaskProgress();
  }
  
  // Recompute is_blocked for all entities
  private recomputeBlockedStatus(): void {
    for (const [id, metadata] of this.primary.entries()) {
      const blockers = this.graph.getBlockedBy(id);
      let isBlocked = false;
      
      for (const blockerId of blockers) {
        const blocker = this.primary.get(blockerId);
        if (blocker && !this.isComplete(blocker.status)) {
          isBlocked = true;
          break;
        }
      }
      
      if (metadata.is_blocked !== isBlocked) {
        metadata.is_blocked = isBlocked;
      }
    }
  }
  
  private isComplete(status: EntityStatus): boolean {
    return status === 'Completed' || status === 'Complete' || status === 'Decided' || status === 'Approved';
  }
}
```

---

## Persistence

### Index Serialization

```typescript
interface SerializedIndex {
  version: number;
  timestamp: number;
  entities: SerializedEntity[];
  relationships: SerializedRelationship[];
  fileMtimes: [string, number][];
}

interface SerializedEntity {
  id: string;
  metadata: EntityMetadata;
}

interface SerializedRelationship {
  type: 'blocks' | 'implements' | 'enables' | 'supersedes';
  from: string;
  to: string;
}

class IndexPersistence {
  private cacheFile = '.obsidian/plugins/canvas-accomplishments/index-cache.json';
  
  async save(manager: IndexManager): Promise<void> {
    const data: SerializedIndex = {
      version: 2,
      timestamp: Date.now(),
      entities: [...manager.primary.entries()].map(([id, metadata]) => ({
        id,
        metadata,
      })),
      relationships: this.serializeRelationships(manager.graph),
      fileMtimes: [...manager.fileMtimes.entries()],
    };
    
    await this.vault.adapter.write(
      this.cacheFile,
      JSON.stringify(data)
    );
  }
  
  async load(): Promise<SerializedIndex | null> {
    try {
      const content = await this.vault.adapter.read(this.cacheFile);
      const data = JSON.parse(content) as SerializedIndex;
      
      // Version check
      if (data.version !== 2) {
        return null;  // Incompatible version, rebuild
      }
      
      return data;
    } catch {
      return null;  // No cache or corrupted
    }
  }
  
  // Check if cache is still valid
  async validateCache(cache: SerializedIndex): Promise<boolean> {
    // Check file mtimes
    for (const [path, cachedMtime] of cache.fileMtimes) {
      try {
        const stat = await this.vault.adapter.stat(path);
        if (!stat || stat.mtime > cachedMtime) {
          return false;  // File changed
        }
      } catch {
        return false;  // File deleted
      }
    }
    
    // Check for new files
    const entityFiles = await this.findEntityFiles();
    const cachedPaths = new Set(cache.fileMtimes.map(([p]) => p));
    for (const path of entityFiles) {
      if (!cachedPaths.has(path)) {
        return false;  // New file
      }
    }
    
    return true;
  }
}
```

---

## Initialization

### Startup Sequence

```typescript
class IndexManager {
  async initialize(): Promise<void> {
    // 1. Try to load cache
    const cache = await this.persistence.load();
    
    if (cache && await this.persistence.validateCache(cache)) {
      // 2a. Restore from cache
      await this.restoreFromCache(cache);
      console.log(`Index restored from cache (${this.primary.size} entities)`);
    } else {
      // 2b. Full rebuild
      await this.rebuildIndex();
      console.log(`Index rebuilt (${this.primary.size} entities)`);
      
      // Save new cache
      await this.persistence.save(this);
    }
    
    // 3. Start file watcher
    this.startFileWatcher();
  }
  
  private async rebuildIndex(): Promise<void> {
    // Clear existing
    this.primary.clear();
    this.secondary.clear();
    this.graph.clear();
    this.search.clear();
    
    // Find all entity files
    const files = await this.findEntityFiles();
    
    // Index in batches for progress reporting
    const batchSize = 100;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(path => this.indexFile(path)));
      
      // Report progress
      const progress = Math.min(100, Math.round((i + batch.length) / files.length * 100));
      this.emit('indexProgress', { progress, total: files.length });
    }
    
    // Compute derived fields
    this.recomputeBlockedStatus();
    this.recomputeChildCounts();
    this.recomputeTaskProgress();
  }
  
  private async findEntityFiles(): Promise<VaultPath[]> {
    const folders = [
      'accomplishments/milestones',
      'accomplishments/stories',
      'accomplishments/tasks',
      'accomplishments/decisions',
      'accomplishments/documents',
    ];
    
    const files: VaultPath[] = [];
    
    for (const folder of folders) {
      const folderFiles = await this.vault.adapter.list(folder);
      for (const file of folderFiles.files) {
        if (file.endsWith('.md')) {
          files.push(file as VaultPath);
        }
      }
    }
    
    return files;
  }
}
```

---

## Performance Targets

### Benchmarks

| Operation | Target | Method |
|-----------|--------|--------|
| Get by ID | < 1ms | O(1) Map lookup |
| List by type | < 5ms | O(1) Set copy |
| Filter (2 criteria) | < 10ms | Set intersection |
| Filter (5 criteria) | < 20ms | Cascading intersection |
| Full-text search | < 50ms | Token index + scoring |
| Get blocked items | < 10ms | Graph traversal |
| Get critical path | < 50ms | DFS with caching |
| Index single file | < 20ms | Parse + insert |
| Full rebuild (1K files) | < 5s | Parallel parse |
| Full rebuild (10K files) | < 30s | Batched parallel |

### Memory Estimates

| Component | Per Entity | 10K Entities |
|-----------|------------|--------------|
| Primary index | ~500 bytes | ~5 MB |
| Secondary indexes | ~100 bytes | ~1 MB |
| Relationship graph | ~200 bytes | ~2 MB |
| Search index | ~300 bytes | ~3 MB |
| **Total** | ~1.1 KB | ~11 MB |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2024-12-17 | Initial V2 index design |
