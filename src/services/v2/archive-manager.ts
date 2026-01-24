/**
 * V2 Archive Manager
 *
 * Handles archive and restore operations for entities.
 * Archives are organized by entity type in a flat structure: archive/{type}/
 * Supports reading from legacy quarter-based structure for backwards compatibility.
 */

import {
  Entity,
  EntityId,
  EntityType,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
} from '../../models/v2-types.js';

// =============================================================================
// Archive Types
// =============================================================================

export interface ArchiveResult {
  archived_entities: EntityId[];
  archive_path: string;
  timestamp: string;
}

export interface RestoreResult {
  restored_entities: EntityId[];
  restore_path: string;
  timestamp: string;
}

export interface ArchiveMetadata {
  entity_id: EntityId;
  entity_type: EntityType;
  archived_at: string;
  archive_path: string;
  original_path: string;
  milestone_id?: EntityId;
  /** @deprecated Quarter is no longer used in new flat archive structure */
  quarter?: string;
}

// =============================================================================
// Archive Manager Class
// =============================================================================

/**
 * Manages entity archival and restoration.
 */
export class ArchiveManager {
  private basePath: string;

  // Callbacks for external dependencies
  private getEntity: (id: EntityId) => Entity | undefined = () => undefined;
  private getChildren: (id: EntityId, type?: EntityType) => Entity[] = () => [];
  private moveFile: (from: string, to: string) => Promise<void> = async () => {};
  private getEntityPath: (id: EntityId) => string | undefined = () => undefined;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setEntityCallback(fn: (id: EntityId) => Entity | undefined): void {
    this.getEntity = fn;
  }

  setChildrenCallback(fn: (id: EntityId, type?: EntityType) => Entity[]): void {
    this.getChildren = fn;
  }

  setMoveFileCallback(fn: (from: string, to: string) => Promise<void>): void {
    this.moveFile = fn;
  }

  setEntityPathCallback(fn: (id: EntityId) => string | undefined): void {
    this.getEntityPath = fn;
  }

  // ---------------------------------------------------------------------------
  // Archive Operations
  // ---------------------------------------------------------------------------

  /** Archive a milestone and all its children */
  async archiveMilestone(milestoneId: EntityId): Promise<ArchiveResult> {
    const milestone = this.getEntity(milestoneId);
    if (!milestone || milestone.type !== 'milestone') {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }

    if (milestone.status !== 'Completed') {
      throw new Error(`Cannot archive incomplete milestone: ${milestoneId}`);
    }

    const archived: EntityId[] = [];
    const timestamp = new Date().toISOString();

    // Archive stories and their tasks (each to their type-specific archive folder)
    const stories = this.getChildren(milestoneId, 'story');
    for (const story of stories) {
      const tasks = this.getChildren(story.id, 'task');
      for (const task of tasks) {
        await this.archiveEntity(task.id);
        archived.push(task.id);
      }
      await this.archiveEntity(story.id);
      archived.push(story.id);
    }

    // Archive related decisions and documents
    const decisions = this.getChildren(milestoneId, 'decision');
    for (const decision of decisions) {
      await this.archiveEntity(decision.id);
      archived.push(decision.id);
    }

    const documents = this.getChildren(milestoneId, 'document');
    for (const doc of documents) {
      await this.archiveEntity(doc.id);
      archived.push(doc.id);
    }

    // Archive the milestone itself
    await this.archiveEntity(milestoneId);
    archived.push(milestoneId);

    // Return the milestone archive path as the primary path
    const archivePath = this.getArchivePathForType('milestone');

    return {
      archived_entities: archived,
      archive_path: archivePath,
      timestamp,
    };
  }

  /** Archive a single entity to the flat archive structure: archive/{type}/ */
  async archiveEntity(entityId: EntityId, archivePath?: string): Promise<ArchiveMetadata> {
    const entity = this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const originalPath = this.getEntityPath(entityId);
    if (!originalPath) {
      throw new Error(`Entity path not found: ${entityId}`);
    }

    // Use flat archive structure: archive/{type}/
    const targetPath = archivePath || this.getArchivePathForType(entity.type);
    const newPath = `${targetPath}/${this.getFilename(entity)}`;

    await this.moveFile(originalPath, newPath);

    return {
      entity_id: entityId,
      entity_type: entity.type,
      archived_at: new Date().toISOString(),
      archive_path: newPath,
      original_path: originalPath,
    };
  }

  // ---------------------------------------------------------------------------
  // Restore Operations
  // ---------------------------------------------------------------------------

  /** Restore an entity from archive */
  async restoreFromArchive(entityId: EntityId, archivePath: string): Promise<RestoreResult> {
    const entity = this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found in archive: ${entityId}`);
    }

    const restored: EntityId[] = [];
    const timestamp = new Date().toISOString();

    // Determine restore path based on entity type
    const restorePath = this.getRestorePath(entity);

    // If milestone, restore all children first
    if (entity.type === 'milestone') {
      const stories = this.getChildren(entityId, 'story');
      for (const story of stories) {
        const tasks = this.getChildren(story.id, 'task');
        for (const task of tasks) {
          await this.restoreEntity(task.id, archivePath);
          restored.push(task.id);
        }
        await this.restoreEntity(story.id, archivePath);
        restored.push(story.id);
      }
    }

    // Restore the entity itself
    await this.restoreEntity(entityId, archivePath);
    restored.push(entityId);

    return {
      restored_entities: restored,
      restore_path: restorePath,
      timestamp,
    };
  }

  /** Restore a single entity */
  private async restoreEntity(entityId: EntityId, archivePath: string): Promise<void> {
    const entity = this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const currentPath = `${archivePath}/${this.getFilename(entity)}`;
    const restorePath = this.getRestorePath(entity);
    const newPath = `${restorePath}/${this.getFilename(entity)}`;

    await this.moveFile(currentPath, newPath);
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Get archive path for entity type using flat structure: archive/{type}/
   * This is the new archive structure aligned with the Canvas Project Manager Plugin.
   */
  private getArchivePathForType(type: EntityType): string {
    return `${this.basePath}/archive/${type}`;
  }

  /**
   * @deprecated Use getArchivePathForType instead.
   * Get current quarter string (e.g., "2024-Q1") - kept for backwards compatibility
   */
  private getQuarter(date: Date): string {
    const year = date.getFullYear();
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    return `${year}-Q${quarter}`;
  }

  /**
   * @deprecated Use getArchivePathForType instead.
   * Get archive path for a quarter and optional milestone - kept for backwards compatibility
   */
  private getLegacyArchivePath(quarter: string, milestoneId?: EntityId): string {
    const base = `${this.basePath}/archive/${quarter}`;
    return milestoneId ? `${base}/${milestoneId}` : base;
  }

  /** Get restore path for an entity */
  private getRestorePath(entity: Entity): string {
    switch (entity.type) {
      case 'milestone':
        return `${this.basePath}/milestones`;
      case 'story':
        return `${this.basePath}/stories`;
      case 'task':
        return `${this.basePath}/tasks`;
      case 'decision':
        return `${this.basePath}/decisions`;
      case 'document':
        return `${this.basePath}/documents`;
      case 'feature':
        return `${this.basePath}/features`;
    }
  }

  /**
   * Try to find an entity in the archive, checking both new flat structure
   * and legacy quarter-based structure for backwards compatibility.
   */
  findInArchive(entityId: EntityId, entityType: EntityType): string | null {
    // First check new flat structure: archive/{type}/
    const flatPath = `${this.getArchivePathForType(entityType)}`;

    // If not found, check legacy quarter-based structure
    // This would require file system scanning which is handled by the caller
    // Return the flat path as the primary location
    return flatPath;
  }

  /** Get filename for an entity */
  private getFilename(entity: Entity): string {
    const sanitizedTitle = entity.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${entity.id}-${sanitizedTitle}.md`;
  }

  /** Check if an entity is eligible for archival */
  canArchive(entity: Entity): { eligible: boolean; reason?: string } {
    switch (entity.type) {
      case 'milestone':
        if (entity.status !== 'Completed') {
          return { eligible: false, reason: 'Milestone must be completed' };
        }
        break;
      case 'story':
        if (entity.status !== 'Completed') {
          return { eligible: false, reason: 'Story must be completed' };
        }
        break;
      case 'task':
        if (entity.status !== 'Completed') {
          return { eligible: false, reason: 'Task must be completed' };
        }
        break;
      case 'decision':
        if (entity.status !== 'Decided' && entity.status !== 'Superseded') {
          return { eligible: false, reason: 'Decision must be decided or superseded' };
        }
        break;
      case 'document':
        if (entity.status !== 'Approved' && entity.status !== 'Superseded') {
          return { eligible: false, reason: 'Document must be approved or superseded' };
        }
        break;
    }
    return { eligible: true };
  }

  /**
   * @deprecated Use getArchivedEntitiesByType instead.
   * List archived entities for a quarter (legacy structure)
   */
  getArchivedEntities(quarter: string): ArchiveMetadata[] {
    // This would be implemented with actual file system scanning
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * List archived entities by type from the flat archive structure.
   * This is the preferred method for the new archive structure.
   */
  getArchivedEntitiesByType(type: EntityType): ArchiveMetadata[] {
    // This would be implemented with actual file system scanning
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get all possible archive paths for an entity (both new and legacy structures).
   * Useful for finding entities that may have been archived with either structure.
   */
  getPossibleArchivePaths(entityId: EntityId, entityType: EntityType): string[] {
    const paths: string[] = [];

    // New flat structure: archive/{type}/
    paths.push(this.getArchivePathForType(entityType));

    // Legacy quarter-based structure: archive/{quarter}/ and archive/{quarter}/{milestone}/
    // Would need to scan for existing quarters
    // For now, just return the flat path
    return paths;
  }
}
