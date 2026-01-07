/**
 * V2 Runtime
 *
 * Wires all V2 services together and provides dependency implementations
 * for the V2 MCP tools.
 */

import * as fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import * as path from 'path';

import {
  Entity,
  EntityId,
  EntityType,
  EntityStatus,
  EntityMetadata,
  V2Config,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  DecisionId,
  ISODateTime,
  CanvasPath,
  VaultPath,
  Priority,
  Effort,
  getEntityTypeFromId,
} from '../../models/v2-types.js';

import { ProjectIndex } from './index-service.js';
import { AtomicFileManager } from './file-manager.js';
import { LifecycleManager } from './lifecycle-manager.js';
import { PathResolver } from './path-resolver.js';
import { EntityParser } from './entity-parser.js';
import { EntitySerializer } from './entity-serializer.js';
import { SearchIndex } from './search-service.js';
import { CanvasManager } from './canvas-manager.js';

import type { EntityManagementDependencies } from '../../tools/entity-management-tools.js';
import type { BatchOperationsDependencies } from '../../tools/batch-operations-tools.js';
import type { ProjectUnderstandingDependencies } from '../../tools/project-understanding-tools.js';
import type { SearchNavigationDependencies } from '../../tools/search-navigation-tools.js';
import type { DecisionDocumentDependencies } from '../../tools/decision-document-tools.js';
import type { ImplementationHandoffDependencies } from '../../tools/implementation-handoff-tools.js';
import type { EntitySummary, EntityFull, Workstream } from '../../tools/tool-types.js';

import { getConfig } from '../../utils/config.js';

// =============================================================================
// V2 Runtime Class
// =============================================================================

/**
 * V2 Runtime - orchestrates all V2 services and provides dependency implementations.
 */
export class V2Runtime {
  private index: ProjectIndex;
  private fileManager: AtomicFileManager;
  private lifecycleManager: LifecycleManager;
  private pathResolver: PathResolver;
  private parser: EntityParser;
  private serializer: EntitySerializer;
  private searchIndex: SearchIndex;
  private canvasManager: CanvasManager;

  // File watchers
  private watchers: FSWatcher[] = [];

  // Debounce timers for file changes
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 100;

  // ID prefix mapping for each entity type
  private readonly idPrefixes: Map<EntityType, string> = new Map([
    ['milestone', 'M'],
    ['story', 'S'],
    ['task', 'T'],
    ['decision', 'DEC'],
    ['document', 'DOC'],
  ]);

  // Track duplicate IDs (id -> array of file paths)
  private duplicateIds: Map<EntityId, string[]> = new Map();

  constructor(private config: V2Config) {
    this.index = new ProjectIndex();
    this.fileManager = new AtomicFileManager(config.vaultPath);
    this.lifecycleManager = new LifecycleManager();
    this.pathResolver = new PathResolver(config);
    this.parser = new EntityParser();
    this.serializer = new EntitySerializer();
    this.searchIndex = new SearchIndex();
    this.canvasManager = new CanvasManager(
      config.vaultPath,
      config.defaultCanvas,
      async (entityId) => {
        const entity = await this.getEntity(entityId);
        return entity?.vault_path || null;
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /** Initialize the runtime by scanning the vault and starting file watchers */
  async initialize(): Promise<void> {
    await this.scanVault();
    this.startFileWatchers();
  }

  /** Shutdown the runtime and cleanup resources */
  async shutdown(): Promise<void> {
    this.stopFileWatchers();
  }

  /** Get the canvas manager for direct canvas operations */
  getCanvasManager(): CanvasManager {
    return this.canvasManager;
  }

  /** Scan vault and build indexes */
  private async scanVault(): Promise<void> {
    const folders = this.pathResolver.getAllAbsoluteEntityFolders();
    console.error(`[V2Runtime] Scanning ${folders.length} entity folders:`, folders);

    let totalEntities = 0;
    for (const folder of folders) {
      const count = await this.scanFolder(folder);
      totalEntities += count;
    }
    console.error(`[V2Runtime] Scan complete. Found ${totalEntities} entities. Index size: ${this.index.getAll().length}`);
  }

  /** Recursively scan a folder for entity files */
  private async scanFolder(folder: string): Promise<number> {
    let count = 0;
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          count += await this.scanFolder(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const entity = await this.loadEntity(fullPath);
          if (entity) count++;
        }
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.error(`[V2Runtime] Folder does not exist (skipping): ${folder}`);
      } else {
        console.error(`[V2Runtime] Error scanning folder ${folder}:`, err);
      }
    }
    return count;
  }

  /** Load a single entity from file and update ProjectIndex */
  private async loadEntity(absolutePath: string): Promise<Entity | null> {
    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const vaultPath = this.pathResolver.toVaultPath(absolutePath);
      const result = this.parser.parse(content, vaultPath);
      const entity = result.entity;

      // Check for duplicate ID
      const existingPaths = this.duplicateIds.get(entity.id);
      if (existingPaths) {
        // Already have this ID - add to duplicates list
        if (!existingPaths.includes(absolutePath)) {
          existingPaths.push(absolutePath);
          console.warn(
            `[V2Runtime] Duplicate entity ID detected: ${entity.id}\n` +
            `  Files with this ID:\n` +
            existingPaths.map(p => `    - ${p}`).join('\n')
          );
        }
      } else {
        // Check if entity already exists in ProjectIndex (first duplicate detection)
        const existingMetadata = this.index.get(entity.id);
        if (existingMetadata) {
          const originalPath = this.pathResolver.toAbsolutePath(existingMetadata.vault_path);
          if (originalPath !== absolutePath) {
            const paths = [originalPath, absolutePath];
            this.duplicateIds.set(entity.id, paths);
            console.warn(
              `[V2Runtime] Duplicate entity ID detected: ${entity.id}\n` +
              `  Files with this ID:\n` +
              paths.map(p => `    - ${p}`).join('\n')
            );
          }
        }
      }

      // Index for search
      this.searchIndex.index(
        entity.id,
        entity.title,
        this.getEntityContent(entity),
        entity.type,
        entity.archived || false
      );

      // Get file mtime for metadata
      const stats = await fs.stat(absolutePath);
      const fileMtime = stats.mtimeMs;

      // Remove old relationships if entity was already indexed (re-load case)
      this.removeRelationships(entity.id);

      // Index metadata in ProjectIndex (this is the single source of truth)
      const metadata = this.createEntityMetadata(entity, fileMtime);
      this.index.set(metadata);

      // Index relationships in ProjectIndex
      this.indexRelationships(entity);

      return entity;
    } catch (err) {
      console.error(`Error loading entity from ${absolutePath}:`, err);
      return null;
    }
  }

  /** Remove entity from index by file path (safe delete) */
  private removeEntityByPath(absolutePath: string): void {
    const vaultPath = this.pathResolver.toVaultPath(absolutePath) as VaultPath;
    // Find entity by vault_path in ProjectIndex
    const entityId = this.index.getIdByPath(vaultPath);
    if (entityId) {
      // Safe delete: only remove entity if this path is the canonical path for this ID
      // This handles the case where duplicate files with the same ID existed
      const canonicalPath = this.index.getPathById(entityId);
      if (canonicalPath === vaultPath) {
        // This is the canonical file - remove the entity entirely
        this.searchIndex.remove(entityId);
        this.removeRelationships(entityId);
        this.index.delete(entityId);
      } else {
        // This was a duplicate file - just remove the stale path mapping
        console.warn(`[V2Runtime] Removing stale path mapping for ${entityId}: ${vaultPath} (canonical: ${canonicalPath})`);
        this.index.removePathMapping(vaultPath);
      }
    }
  }

  /** Get content from entity for search indexing */
  private getEntityContent(entity: Entity): string {
    switch (entity.type) {
      case 'milestone': return (entity as Milestone).objective || '';
      case 'story': {
        const s = entity as Story;
        const parts = [s.outcome, s.notes].filter(Boolean);
        return parts.join(' ');
      }
      case 'task': {
        const t = entity as Task;
        const parts = [t.goal, t.description, t.technical_notes, t.notes].filter(Boolean);
        return parts.join(' ');
      }
      case 'decision': {
        const d = entity as Decision;
        const parts = [d.context, d.decision, d.rationale].filter(Boolean);
        return parts.join(' ');
      }
      case 'document': return (entity as Document).content || '';
      default: return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Index Relationship Management
  // ---------------------------------------------------------------------------

  /**
   * Index all relationships for an entity into ProjectIndex.
   * This enables O(1) lookups for dependencies, children, etc.
   */
  private indexRelationships(entity: Entity): void {
    // Parent-child relationships (Story -> Milestone, Task -> Story)
    if (entity.type === 'story' && (entity as Story).parent) {
      this.index.addRelationship((entity as Story).parent!, 'parent_of', entity.id);
    }
    if (entity.type === 'task' && (entity as Task).parent) {
      this.index.addRelationship((entity as Task).parent!, 'parent_of', entity.id);
    }

    // Dependency relationships: depends_on means "I am blocked by these"
    // So if A depends_on B, then B blocks A
    const dependsOn = (entity as any).depends_on as EntityId[] | undefined;
    if (dependsOn && Array.isArray(dependsOn)) {
      for (const depId of dependsOn) {
        this.index.addRelationship(depId, 'blocks', entity.id);
      }
    }

    // Implementation relationships (Story implements Document)
    if (entity.type === 'story' && (entity as Story).implements) {
      for (const docId of (entity as Story).implements!) {
        this.index.addRelationship(entity.id, 'implements', docId);
      }
    }
    if (entity.type === 'milestone' && (entity as Milestone).implements) {
      for (const docId of (entity as Milestone).implements!) {
        this.index.addRelationship(entity.id, 'implements', docId);
      }
    }

    // Supersedes relationships (Decision supersedes Decision)
    if (entity.type === 'decision' && (entity as Decision).supersedes) {
      this.index.addRelationship(entity.id, 'supersedes', (entity as Decision).supersedes!);
    }

    // Enables relationships (Decision enables Entity)
    if (entity.type === 'decision' && (entity as Decision).enables) {
      for (const enabledId of (entity as Decision).enables!) {
        this.index.addRelationship(entity.id, 'enables', enabledId);
      }
    }
  }

  /**
   * Remove all relationships for an entity from ProjectIndex.
   * Called before re-indexing or when entity is deleted.
   */
  private removeRelationships(entityId: EntityId): void {
    this.index.delete(entityId);
  }

  /**
   * Create EntityMetadata from an Entity for the primary index.
   */
  private createEntityMetadata(entity: Entity, fileMtime: number = 0): EntityMetadata {
    const metadata: EntityMetadata = {
      id: entity.id,
      type: entity.type,
      title: entity.title,
      workstream: entity.workstream,
      status: entity.status,
      archived: entity.archived,
      in_progress: this.isEntityInProgress(entity),
      canvas_source: entity.canvas_source,
      vault_path: entity.vault_path,
      updated_at: entity.updated_at,
      file_mtime: fileMtime,
      children_count: 0, // Will be updated when children are indexed
    };

    // Add type-specific fields
    if (entity.type === 'milestone') {
      metadata.priority = (entity as Milestone).priority;
    }
    if (entity.type === 'story') {
      metadata.priority = (entity as Story).priority;
      metadata.effort = (entity as Story).effort;
      metadata.parent_id = (entity as Story).parent;
    }
    if (entity.type === 'task') {
      metadata.parent_id = (entity as Task).parent;
    }

    return metadata;
  }

  /**
   * Check if an entity is in progress.
   */
  private isEntityInProgress(entity: Entity): boolean {
    if (entity.type === 'milestone' || entity.type === 'story' || entity.type === 'task') {
      return entity.status === 'In Progress';
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // File Watching
  // ---------------------------------------------------------------------------

  /** Start file watchers for all entity folders */
  private startFileWatchers(): void {
    const folders = this.pathResolver.getAllAbsoluteEntityFolders();

    for (const folder of folders) {
      try {
        const watcher = watch(folder, { persistent: true }, (eventType, filename) => {
          if (!filename || !filename.endsWith('.md')) return;

          const absolutePath = path.join(folder, filename);
          this.handleFileChange(eventType, absolutePath);
        });

        this.watchers.push(watcher);
      } catch (err: any) {
        // Folder might not exist yet - that's okay
        if (err.code !== 'ENOENT') {
          console.error(`Error watching folder ${folder}:`, err);
        }
      }
    }
  }

  /** Stop all file watchers */
  private stopFileWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    // Clear any pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /** Handle file change event with debouncing */
  private handleFileChange(eventType: string, absolutePath: string): void {
    // Clear existing timer for this path
    const existingTimer = this.debounceTimers.get(absolutePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced handler
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(absolutePath);
      await this.processFileChange(absolutePath);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(absolutePath, timer);
  }

  /** Process a file change after debouncing */
  private async processFileChange(absolutePath: string): Promise<void> {
    try {
      // Check if file exists
      await fs.access(absolutePath);

      // File exists - reload it (handles both create and modify)
      await this.loadEntity(absolutePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File was deleted - remove from cache
        this.removeEntityByPath(absolutePath);
      } else {
        console.error(`Error processing file change for ${absolutePath}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Core Entity Operations
  // ---------------------------------------------------------------------------

  /** Get entity by ID - loads from disk using ProjectIndex */
  async getEntity(id: EntityId): Promise<Entity | null> {
    const metadata = this.index.get(id);
    if (!metadata) {
      // Entity not in index
      return null;
    }
    if (!metadata.vault_path) {
      console.error(`[V2Runtime] Entity ${id} has no vault_path in index`);
      return null;
    }

    const absolutePath = this.pathResolver.toAbsolutePath(metadata.vault_path);
    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const result = this.parser.parse(content, metadata.vault_path);
      return result.entity;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist - remove stale entry from index
        console.warn(`[V2Runtime] Removing stale index entry for ${id} - file not found: ${absolutePath}`);
        this.index.delete(id);
        this.searchIndex.remove(id);
      } else {
        console.error(`[V2Runtime] Error reading entity ${id} from ${absolutePath}:`, err);
      }
      return null;
    }
  }

  /** Get all entities - loads from disk using ProjectIndex */
  async getAllEntities(options?: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    workstream?: string;
    types?: EntityType[];
  }): Promise<Entity[]> {
    // First filter metadata from ProjectIndex (fast)
    let metadataList: EntityMetadata[] = this.index.getAll();

    if (!options?.includeArchived) {
      metadataList = metadataList.filter((m: EntityMetadata) => !m.archived);
    }

    if (!options?.includeCompleted) {
      metadataList = metadataList.filter((m: EntityMetadata) => m.status !== 'Completed');
    }

    if (options?.workstream) {
      metadataList = metadataList.filter((m: EntityMetadata) => m.workstream === options.workstream);
    }

    if (options?.types) {
      metadataList = metadataList.filter((m: EntityMetadata) => options.types!.includes(m.type));
    }

    // Then load full entities from disk (only for filtered results)
    const entities: Entity[] = [];
    for (const metadata of metadataList) {
      const entity = await this.getEntity(metadata.id);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  /** Get entity status */
  private getEntityStatus(entity: Entity): string {
    switch (entity.type) {
      case 'milestone': return (entity as Milestone).status;
      case 'story': return (entity as Story).status;
      case 'task': return (entity as Task).status;
      case 'decision': return (entity as Decision).status;
      case 'document': return (entity as Document).status;
      default: return 'Unknown';
    }
  }

  /** Get entity workstream */
  private getEntityWorkstream(entity: Entity): string {
    switch (entity.type) {
      case 'milestone': return (entity as Milestone).workstream;
      case 'story': return (entity as Story).workstream;
      case 'task': return (entity as Task).workstream || '';
      case 'decision': return (entity as Decision).workstream;
      case 'document': return (entity as Document).workstream;
      default: return '';
    }
  }

  /**
   * Get the highest ID number for a given entity type by scanning vault files.
   * This ensures we never generate duplicate IDs even if entities were created
   * by the Obsidian plugin while the MCP server was running.
   *
   * NOTE: This scans the vault on every call to guarantee accuracy.
   * The index may be stale if the plugin creates entities.
   */
  private async getHighestIdForType(type: EntityType): Promise<number> {
    const prefix = this.idPrefixes.get(type);
    if (!prefix) return 0;

    let highest = 0;
    const folders = this.pathResolver.getAllAbsoluteEntityFolders();

    for (const folder of folders) {
      try {
        const files = await this.getAllMarkdownFilesInFolder(folder);

        for (const filePath of files) {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const vaultPath = this.pathResolver.toVaultPath(filePath);
            const result = this.parser.parse(content, vaultPath);

            // Only consider entities of the target type
            if (result.entity.type === type) {
              // Extract numeric part from ID (e.g., "S-042" -> 42)
              const match = result.entity.id.match(new RegExp(`^${prefix}-(\\d+)$`));
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > highest) {
                  highest = num;
                }
              }
            }
          } catch {
            // Skip files that can't be parsed (not entities)
            continue;
          }
        }
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code !== 'ENOENT') {
          console.error(`[V2Runtime] Error scanning folder ${folder}:`, err);
        }
      }
    }

    return highest;
  }

  /**
   * Get all markdown files in a folder (recursively)
   */
  private async getAllMarkdownFilesInFolder(folder: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.getAllMarkdownFilesInFolder(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        console.error(`[V2Runtime] Error reading folder ${folder}:`, err);
      }
    }

    return files;
  }

  /** Get next ID for entity type (zero-padded to 3 digits) */
  async getNextId(type: EntityType): Promise<EntityId> {
    // Scan the vault to find the highest existing ID for this type
    // This prevents ID collisions with entities created by the Obsidian plugin
    const highest = await this.getHighestIdForType(type);
    const next = highest + 1;

    const prefix = this.idPrefixes.get(type);
    if (!prefix) {
      throw new Error(`Unknown entity type: ${type}`);
    }

    // Zero-pad to 3 digits (e.g., S-001, M-012, T-123)
    const padded = String(next).padStart(3, '0');
    return `${prefix}-${padded}` as EntityId;
  }

  /** Get all duplicate entity IDs and their file paths */
  getDuplicateIds(): Map<EntityId, string[]> {
    return new Map(this.duplicateIds);
  }

  /** Check if there are any duplicate IDs */
  hasDuplicateIds(): boolean {
    return this.duplicateIds.size > 0;
  }

  /** Check if an entity exists in the index */
  entityExists(id: EntityId): boolean {
    return this.index.has(id);
  }

  /** Get entity type from ID (from index) */
  getEntityTypeFromCache(id: EntityId): EntityType | null {
    const metadata = this.index.get(id);
    return metadata?.type ?? null;
  }

  /** Write entity to file */
  async writeEntity(entity: Entity): Promise<void> {
    const filePath = this.pathResolver.getEntityPath(entity.id, entity.title);
    const absolutePath = this.pathResolver.toAbsolutePath(filePath);

    // Check if entity exists at a different path (title change scenario)
    // If so, delete the old file to prevent duplicates
    const existingPath = this.index.getPathById(entity.id);
    if (existingPath && existingPath !== filePath) {
      const oldAbsolutePath = this.pathResolver.toAbsolutePath(existingPath);
      try {
        await fs.unlink(oldAbsolutePath);
        // Remove old path mapping
        this.index.removePathMapping(existingPath as VaultPath);
        console.log(`[V2Runtime] Deleted old file after title change: ${existingPath} -> ${filePath}`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`[V2Runtime] Error deleting old file ${oldAbsolutePath}:`, err);
        }
      }
    }

    // Set vault_path on entity before serializing
    entity.vault_path = filePath as VaultPath;

    const content = this.serializer.serialize(entity);

    // Ensure directory exists
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf-8');

    // Update search index
    this.searchIndex.index(
      entity.id,
      entity.title,
      this.getEntityContent(entity),
      entity.type,
      entity.archived || false
    );

    // Get file mtime for metadata
    const stats = await fs.stat(absolutePath);
    const fileMtime = stats.mtimeMs;

    // Remove old relationships (in case entity was updated)
    this.removeRelationships(entity.id);

    // Update ProjectIndex metadata
    const metadata = this.createEntityMetadata(entity, fileMtime);
    this.index.set(metadata);

    // Re-index relationships
    this.indexRelationships(entity);
  }

  /** Get children of an entity - uses ProjectIndex for O(1) lookup */
  async getChildren(parentId: EntityId): Promise<Entity[]> {
    // Use ProjectIndex relationship graph for O(1) lookup
    // parent_of relationship: parent -> child
    const childIds = this.index.getRelated(parentId, 'parent_of');
    const children: Entity[] = [];
    for (const childId of childIds) {
      const entity = await this.getEntity(childId);
      if (entity) {
        children.push(entity);
      }
    }
    return children;
  }

  /** Get parent of an entity */
  async getParent(id: EntityId): Promise<Entity | null> {
    const entity = await this.getEntity(id);
    if (!entity) return null;

    let parentId: EntityId | undefined;
    if (entity.type === 'story') {
      parentId = (entity as Story).parent;
    } else if (entity.type === 'task') {
      parentId = (entity as Task).parent;
    }

    return parentId ? this.getEntity(parentId) : null;
  }

  /** Get siblings of an entity */
  async getSiblings(id: EntityId): Promise<Entity[]> {
    const entity = await this.getEntity(id);
    if (!entity) return [];

    const parent = await this.getParent(id);
    if (!parent) {
      // Top-level entity - siblings are same type (use ProjectIndex)
      const allMetadata: EntityMetadata[] = this.index.getAll();
      const siblings: Entity[] = [];
      for (const m of allMetadata) {
        if (m.type === entity.type && m.id !== id) {
          const sibling = await this.getEntity(m.id);
          if (sibling) {
            siblings.push(sibling);
          }
        }
      }
      return siblings;
    }

    const children = await this.getChildren(parent.id);
    return children.filter(c => c.id !== id);
  }

  /** Get entity path */
  async getEntityPath(id: EntityId): Promise<string> {
    const entity = await this.getEntity(id);
    if (!entity) return '';
    return this.pathResolver.getEntityPath(id, entity.title);
  }

  // ---------------------------------------------------------------------------
  // Dependency Operations
  // ---------------------------------------------------------------------------

  /**
   * Get entities that this entity depends on (what blocks this entity).
   * Uses ProjectIndex relationship graph for O(1) lookup.
   *
   * If entity A has depends_on: [B], then A is blocked by B.
   * This returns [B] when called with A's id.
   */
  async getDependencies(id: EntityId): Promise<Entity[]> {
    // In the index: B blocks A is stored as forward(B, 'blocks', A)
    // So to find what blocks A, we look at reverse relationships
    const blockerIds = this.index.getRelatedReverse(id, 'blocks');

    const deps: Entity[] = [];
    for (const depId of blockerIds) {
      const dep = await this.getEntity(depId);
      if (dep) deps.push(dep);
    }
    return deps;
  }

  /**
   * Get entities that depend on this entity (what this entity blocks).
   * Uses ProjectIndex relationship graph for O(1) lookup.
   *
   * If entity A has depends_on: [B], then B blocks A.
   * This returns [A] when called with B's id.
   */
  async getDependents(id: EntityId): Promise<Entity[]> {
    // In the index: B blocks A is stored as forward(B, 'blocks', A)
    // So to find what B blocks, we look at forward relationships
    const dependentIds = this.index.getRelated(id, 'blocks');

    const dependents: Entity[] = [];
    for (const depId of dependentIds) {
      const dep = await this.getEntity(depId);
      if (dep) dependents.push(dep);
    }
    return dependents;
  }

  // ---------------------------------------------------------------------------
  // Status Operations
  // ---------------------------------------------------------------------------

  /** Validate status transition */
  validateStatusTransition(entity: Entity, newStatus: EntityStatus): { valid: boolean; reason?: string } {
    // Use lifecycle manager's canTransition method
    const result = this.lifecycleManager.canTransition(entity, newStatus);
    return { valid: result.allowed, reason: result.reason };
  }

  /** Compute cascade effects of status change */
  async computeCascadeEffects(entity: Entity, newStatus: EntityStatus): Promise<EntityId[]> {
    // For now, return empty - cascade logic can be added later
    return [];
  }

  // ---------------------------------------------------------------------------
  // Archive Operations
  // ---------------------------------------------------------------------------

  /** Move entity to archive */
  async moveToArchive(id: EntityId, archivePath?: string): Promise<string> {
    const entity = await this.getEntity(id);
    if (!entity) throw new Error(`Entity not found: ${id}`);

    const currentPath = this.pathResolver.getEntityPath(id, entity.title);
    // If archivePath is provided, it's a folder path - append the filename
    // Otherwise use the full archive path from path resolver
    let targetPath: string;
    if (archivePath) {
      const filename = path.basename(currentPath);
      targetPath = path.join(archivePath, filename);
    } else {
      targetPath = this.pathResolver.getArchivePath(id, entity.title);
    }

    const absoluteCurrent = this.pathResolver.toAbsolutePath(currentPath);
    const absoluteTarget = this.pathResolver.toAbsolutePath(targetPath);

    // Ensure archive directory exists
    await fs.mkdir(path.dirname(absoluteTarget), { recursive: true });

    // Move file
    await fs.rename(absoluteCurrent, absoluteTarget);

    // Update entity on disk with archived flag
    entity.archived = true;
    entity.vault_path = targetPath as VaultPath;
    const content = this.serializer.serialize(entity);
    await fs.writeFile(absoluteTarget, content, 'utf-8');

    // Update ProjectIndex with new path and archived status
    const stats = await fs.stat(absoluteTarget);
    const metadata = this.createEntityMetadata(entity, stats.mtimeMs);
    this.index.set(metadata);

    return targetPath;
  }

  /** Restore entity from archive */
  async restoreFromArchive(id: EntityId): Promise<string> {
    const entity = await this.getEntity(id);
    if (!entity) throw new Error(`Entity not found: ${id}`);

    const archivePath = this.pathResolver.getArchivePath(id, entity.title);
    const targetPath = this.pathResolver.getEntityPath(id, entity.title);

    const absoluteArchive = this.pathResolver.toAbsolutePath(archivePath);
    const absoluteTarget = this.pathResolver.toAbsolutePath(targetPath);

    // Ensure target directory exists
    await fs.mkdir(path.dirname(absoluteTarget), { recursive: true });

    // Move file
    await fs.rename(absoluteArchive, absoluteTarget);

    // Update entity on disk with archived flag
    entity.archived = false;
    entity.vault_path = targetPath as VaultPath;
    const content = this.serializer.serialize(entity);
    await fs.writeFile(absoluteTarget, content, 'utf-8');

    // Update ProjectIndex with new path and archived status
    const stats = await fs.stat(absoluteTarget);
    const metadata = this.createEntityMetadata(entity, stats.mtimeMs);
    this.index.set(metadata);

    return targetPath;
  }

  // ---------------------------------------------------------------------------
  // Conversion Helpers
  // ---------------------------------------------------------------------------

  /** Convert entity to summary */
  toEntitySummary(entity: Entity): EntitySummary {
    const summary: EntitySummary = {
      id: entity.id,
      type: entity.type,
      title: entity.title,
      status: this.getEntityStatus(entity) as EntityStatus,
      workstream: this.getEntityWorkstream(entity),
      last_updated: entity.updated_at || new Date().toISOString(),
    };

    // Add parent for stories and tasks
    if ('parent' in entity && entity.parent) {
      const parentEntity = this.index.get(entity.parent as EntityId);
      summary.parent = {
        id: entity.parent as EntityId,
        title: parentEntity?.title || 'Unknown',
      };
    }

    return summary;
  }

  /** Convert entity to full representation */
  async toEntityFull(entity: Entity): Promise<EntityFull> {
    const summary = this.toEntitySummary(entity);
    const children = await this.getChildren(entity.id);

    // Get dependencies using the indexed relationships
    const dependencies = await this.getDependencies(entity.id);
    const dependents = await this.getDependents(entity.id);

    // Build the full entity representation
    const full: EntityFull = {
      ...summary,
      content: this.getEntityContent(entity),
      children_count: children.length,
      children: children.map(c => this.toEntitySummary(c)),
      dependencies: {
        blocks: dependents.map(e => e.id),      // Entities that this entity blocks
        blocked_by: dependencies.map(e => e.id), // Entities that block this entity
      },
      dependency_details: {
        blocks: dependents.map(e => this.toEntitySummary(e)),
        blocked_by: dependencies.map(e => this.toEntitySummary(e)),
      },
    };

    // Add type-specific fields
    if (entity.type === 'milestone' || entity.type === 'story') {
      full.priority = (entity as Milestone | Story).priority;
    }
    if (entity.type === 'story') {
      full.effort = (entity as Story).effort;
    }

    return full;
  }

  /** Get current timestamp */
  getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  // ---------------------------------------------------------------------------
  // Search Operations
  // ---------------------------------------------------------------------------

  /** Search entities */
  async searchEntities(query: string, options?: {
    types?: EntityType[];
    statuses?: EntityStatus[];
    workstreams?: string[];
    archived?: boolean;
    limit?: number;
  }): Promise<Array<{ entity: Entity; score: number; snippet: string }>> {
    const results = this.searchIndex.search(query, {
      types: options?.types,
      includeArchived: options?.archived,
      limit: options?.limit,
    });

    const output: Array<{ entity: Entity; score: number; snippet: string }> = [];
    for (const result of results) {
      const entity = await this.getEntity(result.id);
      if (!entity) continue;

      // Apply additional filters
      if (options?.statuses && !options.statuses.includes(this.getEntityStatus(entity) as EntityStatus)) {
        continue;
      }
      if (options?.workstreams && !options.workstreams.includes(this.getEntityWorkstream(entity))) {
        continue;
      }

      output.push({
        entity,
        score: result.score,
        snippet: this.getEntityContent(entity).substring(0, 200),
      });
    }

    return output;
  }

  /** Get task progress for a story */
  async getTaskProgress(storyId: EntityId): Promise<{ total: number; completed: number }> {
    const children = await this.getChildren(storyId);
    const tasks = children.filter(c => c.type === 'task') as Task[];
    const completed = tasks.filter(t => t.status === 'Completed').length;
    return { total: tasks.length, completed };
  }

  // ---------------------------------------------------------------------------
  // Decision & Document Operations
  // ---------------------------------------------------------------------------

  /** Get all decisions */
  async getAllDecisions(options?: {
    workstream?: string;
    includeSuperseded?: boolean;
    includeArchived?: boolean;
  }): Promise<Decision[]> {
    const entities = await this.getAllEntities({
      includeArchived: options?.includeArchived,
      includeCompleted: true,
      types: ['decision'],
      workstream: options?.workstream,
    });

    let decisions = entities as Decision[];

    if (!options?.includeSuperseded) {
      decisions = decisions.filter(d => d.status !== 'Superseded');
    }

    return decisions;
  }

  /** Get all documents */
  async getAllDocuments(options?: { workstream?: string }): Promise<Document[]> {
    const entities = await this.getAllEntities({
      includeArchived: false,
      includeCompleted: true,
      types: ['document'],
      workstream: options?.workstream,
    });
    return entities as Document[];
  }

  /** Get all stories */
  async getAllStories(options?: { workstream?: string; priorities?: string[] }): Promise<Story[]> {
    const entities = await this.getAllEntities({
      includeArchived: false,
      includeCompleted: true,
      types: ['story'],
      workstream: options?.workstream,
    });

    let stories = entities as Story[];

    if (options?.priorities) {
      stories = stories.filter(s => options.priorities!.includes(s.priority || 'Medium'));
    }

    return stories;
  }

  /** Create a decision */
  async createDecision(data: {
    title: string;
    context: string;
    decision: string;
    rationale: string;
    workstream: string;
    decided_by: string;
    enables?: EntityId[];
    supersedes?: EntityId;
  }): Promise<Decision> {
    const id = await this.getNextId('decision') as DecisionId;
    const now = this.getCurrentTimestamp() as ISODateTime;

    const decision: Decision = {
      id,
      type: 'decision',
      title: data.title,
      context: data.context,
      decision: data.decision,
      rationale: data.rationale,
      workstream: data.workstream,
      decided_by: data.decided_by,
      decided_on: now,
      status: 'Decided',
      enables: data.enables || [],
      supersedes: data.supersedes as DecisionId | undefined,
      archived: false,
      created_at: now,
      updated_at: now,
      canvas_source: '' as CanvasPath,
      cssclasses: [],
      vault_path: '' as VaultPath,
    };

    await this.writeEntity(decision);
    return decision;
  }

  /** Update a document */
  async updateDocument(id: EntityId, data: Partial<Document>): Promise<Document> {
    const entity = await this.getEntity(id);
    if (!entity || entity.type !== 'document') {
      throw new Error(`Document not found: ${id}`);
    }

    const updated: Document = {
      ...(entity as Document),
      ...data,
      updated_at: this.getCurrentTimestamp() as ISODateTime,
    };

    await this.writeEntity(updated);
    return updated;
  }

  /** Get decisions affecting a document */
  async getDecisionsAffectingDocument(docId: EntityId): Promise<Decision[]> {
    const decisions = await this.getAllDecisions({ includeSuperseded: true });
    // For now, return decisions that reference this document
    // This would need more sophisticated tracking in a real implementation
    return decisions.filter(d => d.enables?.includes(docId));
  }

  /** Generate entity ID - uses vault scanning for consistency */
  async generateId(type: 'decision' | 'document'): Promise<EntityId> {
    // Scan the vault to find the highest existing ID for this type
    // This prevents ID collisions with entities created by the Obsidian plugin
    const highest = await this.getHighestIdForType(type);
    const next = highest + 1;

    const prefix = this.idPrefixes.get(type);
    if (!prefix) {
      throw new Error(`Unknown entity type: ${type}`);
    }

    const padded = String(next).padStart(3, '0');
    return `${prefix}-${padded}` as EntityId;
  }

  // ---------------------------------------------------------------------------
  // Implementation Handoff Operations
  // ---------------------------------------------------------------------------

  /** Get related decisions for an entity */
  async getRelatedDecisions(entityId: EntityId): Promise<Decision[]> {
    const decisions = await this.getAllDecisions();
    return decisions.filter(d => d.enables?.includes(entityId));
  }

  /** Get blocking entities */
  async getBlockingEntities(entityId: EntityId): Promise<Entity[]> {
    return this.getDependencies(entityId);
  }

  /** Check if entity has open TODOs */
  async hasOpenTodos(entityId: EntityId): Promise<boolean> {
    const entity = await this.getEntity(entityId);
    if (!entity) return false;
    const content = this.getEntityContent(entity);
    return content.includes('- [ ]') || content.includes('TODO');
  }

  /** Get acceptance criteria */
  async getAcceptanceCriteria(entityId: EntityId): Promise<string[]> {
    const entity = await this.getEntity(entityId);
    if (!entity || entity.type !== 'story') return [];
    return (entity as Story).acceptance_criteria || [];
  }

  /** Get implementation context */
  async getImplementationContext(entityId: EntityId): Promise<string | undefined> {
    const entity = await this.getEntity(entityId);
    if (!entity) return undefined;
    // Implementation context would be stored in entity metadata
    return (entity as any).implementation_context;
  }

  /** Get related documents */
  async getRelatedDocuments(entityId: EntityId): Promise<Document[]> {
    const entity = await this.getEntity(entityId);
    if (!entity) return [];
    const implements_ = (entity as any).implements as EntityId[] | undefined;
    if (!implements_) return [];

    const docs: Document[] = [];
    for (const docId of implements_) {
      const doc = await this.getEntity(docId);
      if (doc && doc.type === 'document') {
        docs.push(doc as Document);
      }
    }
    return docs;
  }

  /** Search content for pattern */
  async searchContent(entityId: EntityId, pattern: string): Promise<boolean> {
    const entity = await this.getEntity(entityId);
    if (!entity) return false;
    const content = this.getEntityContent(entity);
    return content.toLowerCase().includes(pattern.toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // Dependency Provider Methods
  // ---------------------------------------------------------------------------

  /** Get entity management dependencies */
  getEntityManagementDeps(): EntityManagementDependencies {
    return {
      getEntity: (id) => this.getEntity(id),
      getNextId: (type) => this.getNextId(type),
      getChildren: (id) => this.getChildren(id),
      entityExists: (id) => this.entityExists(id),
      getEntityType: (id) => this.getEntityTypeFromCache(id),
      writeEntity: (entity) => this.writeEntity(entity),
      moveToArchive: (id, path) => this.moveToArchive(id, path),
      restoreFromArchive: (id) => this.restoreFromArchive(id),
      validateStatusTransition: (entity, status) => this.validateStatusTransition(entity, status),
      computeCascadeEffects: (entity, status) => this.computeCascadeEffects(entity, status),
      toEntityFull: (entity) => this.toEntityFull(entity),
      getCurrentTimestamp: () => this.getCurrentTimestamp(),
      // Canvas operations
      addToCanvas: async (entity, canvasPath) => {
        const nodeId = await this.canvasManager.addNode(
          entity.vault_path,
          canvasPath as CanvasPath,
          undefined,
          this.canvasManager.getDimensionsForType(entity.type)
        );
        return nodeId !== null;
      },
      removeFromCanvas: async (id, canvasPath) => {
        const entity = await this.getEntity(id);
        if (!entity) return false;
        return this.canvasManager.removeNode(entity.vault_path, canvasPath as CanvasPath);
      },
    };
  }

  /** Get batch operations dependencies */
  getBatchOperationsDeps(): BatchOperationsDependencies {
    return {
      createEntity: async (type, data) => {
        const id = await this.getNextId(type);
        const now = this.getCurrentTimestamp() as ISODateTime;
        // Build entity with all required base fields plus type-specific data
        const baseFields = {
          id,
          type,
          created_at: now,
          updated_at: now,
          archived: false,
          canvas_source: '' as CanvasPath,
          cssclasses: [] as string[],
          vault_path: '' as VaultPath,
        };
        // Merge with provided data (which should include title, workstream, status, etc.)
        const entity = { ...baseFields, ...data } as unknown as Entity;
        await this.writeEntity(entity);
        return entity;
      },
      getEntity: (id) => this.getEntity(id),
      entityExists: (id) => this.entityExists(id),
      getEntityType: (id) => this.getEntityTypeFromCache(id),
      updateEntityStatus: async (id, status) => {
        const entity = await this.getEntity(id);
        if (!entity) throw new Error(`Entity not found: ${id}`);
        (entity as any).status = status;
        entity.updated_at = this.getCurrentTimestamp() as ISODateTime;
        await this.writeEntity(entity);
      },
      writeEntity: (entity) => this.writeEntity(entity),
      archiveEntity: (id, path) => this.moveToArchive(id, path).then(() => {}),
      getChildren: (id) => this.getChildren(id),
      validateStatusTransition: (entity, status) => this.validateStatusTransition(entity, status),
      computeCascadeEffects: (entity, status) => this.computeCascadeEffects(entity, status),
      getCurrentTimestamp: () => this.getCurrentTimestamp(),
      // Canvas operations
      addToCanvas: async (entity, canvasPath) => {
        const nodeId = await this.canvasManager.addNode(
          entity.vault_path,
          canvasPath as CanvasPath,
          undefined,
          this.canvasManager.getDimensionsForType(entity.type)
        );
        return nodeId !== null;
      },
      removeFromCanvas: async (id, canvasPath) => {
        const entity = await this.getEntity(id);
        if (!entity) return false;
        return this.canvasManager.removeNode(entity.vault_path, canvasPath as CanvasPath);
      },
    };
  }

  /** Get project understanding dependencies */
  getProjectUnderstandingDeps(): ProjectUnderstandingDependencies {
    return {
      getAllEntities: (options) => this.getAllEntities(options),
      toEntitySummary: (entity) => this.toEntitySummary(entity),
      getBlockers: (id) => this.getDependencies(id),
      getBlockedBy: (id) => this.getDependents(id),
      getLastUpdated: (entity) => new Date(entity.updated_at || entity.created_at || Date.now()),
    };
  }

  /** Get search navigation dependencies */
  getSearchNavigationDeps(): SearchNavigationDependencies {
    return {
      searchEntities: (query, options) => this.searchEntities(query, options),
      getEntity: (id) => this.getEntity(id),
      getEntityPath: (id) => this.getEntityPath(id),
      toEntitySummary: (entity) => this.toEntitySummary(entity),
      toEntityFull: (entity) => this.toEntityFull(entity),
      getParent: (id) => this.getParent(id),
      getChildren: (id) => this.getChildren(id),
      getSiblings: (id) => this.getSiblings(id),
      getDependencies: (id) => this.getDependencies(id),
      getDependents: (id) => this.getDependents(id),
      getTaskProgress: (id) => this.getTaskProgress(id),
    };
  }

  /** Get decision document dependencies */
  getDecisionDocumentDeps(): DecisionDocumentDependencies {
    return {
      createDecision: (data) => this.createDecision(data),
      getEntity: (id) => this.getEntity(id),
      getAllDecisions: (options) => this.getAllDecisions(options),
      getAllDocuments: () => this.getAllDocuments(),
      updateDocument: (id, data) => this.updateDocument(id, data),
      toEntityFull: (entity) => this.toEntityFull(entity),
      getCurrentTimestamp: () => this.getCurrentTimestamp(),
      generateId: async (type) => await this.generateId(type),
      getDecisionsAffectingDocument: (id) => this.getDecisionsAffectingDocument(id),
      searchContent: (id, pattern) => this.searchContent(id, pattern),
      addToCanvas: async (entity, canvasPath) => {
        const nodeId = await this.canvasManager.addNode(
          entity.vault_path,
          canvasPath as CanvasPath,
          undefined,
          this.canvasManager.getDimensionsForType(entity.type)
        );
        return nodeId !== null;
      },
    };
  }

  /** Get implementation handoff dependencies */
  getImplementationHandoffDeps(): ImplementationHandoffDependencies {
    return {
      getAllStories: (options) => this.getAllStories(options),
      getAllDocuments: (options) => this.getAllDocuments(options),
      getEntity: (id) => this.getEntity(id),
      getEntityPath: (id) => this.getEntityPath(id),
      getRelatedDecisions: (id) => this.getRelatedDecisions(id),
      getBlockingEntities: (id) => this.getBlockingEntities(id),
      getDependencies: (id) => this.getDependencies(id),
      hasOpenTodos: (id) => this.hasOpenTodos(id),
      getAcceptanceCriteria: (id) => this.getAcceptanceCriteria(id),
      getImplementationContext: (id) => this.getImplementationContext(id),
      getRelatedDocuments: (id) => this.getRelatedDocuments(id),
      searchContent: (id, pattern) => this.searchContent(id, pattern),
    };
  }
}

// =============================================================================
// Singleton Runtime Instance
// =============================================================================

let runtimeInstance: V2Runtime | null = null;

/** Get or create the V2 runtime instance */
export async function getV2Runtime(config: V2Config): Promise<V2Runtime> {
  if (!runtimeInstance) {
    runtimeInstance = new V2Runtime(config);
    await runtimeInstance.initialize();
  }
  return runtimeInstance;
}

/** Reset the runtime (for testing) */
export function resetV2Runtime(): void {
  runtimeInstance = null;
}
