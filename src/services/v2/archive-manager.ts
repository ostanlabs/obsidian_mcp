/**
 * V2 Archive Manager
 *
 * Handles archive and restore operations for entities.
 * Archives are organized by quarter and milestone.
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
  quarter: string;
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

    const quarter = this.getQuarter(new Date());
    const archivePath = this.getArchivePath(quarter, milestoneId);
    const archived: EntityId[] = [];
    const timestamp = new Date().toISOString();

    // Archive stories and their tasks
    const stories = this.getChildren(milestoneId, 'story');
    for (const story of stories) {
      const tasks = this.getChildren(story.id, 'task');
      for (const task of tasks) {
        await this.archiveEntity(task.id, archivePath);
        archived.push(task.id);
      }
      await this.archiveEntity(story.id, archivePath);
      archived.push(story.id);
    }

    // Archive related decisions and documents
    const decisions = this.getChildren(milestoneId, 'decision');
    for (const decision of decisions) {
      await this.archiveEntity(decision.id, archivePath);
      archived.push(decision.id);
    }

    const documents = this.getChildren(milestoneId, 'document');
    for (const doc of documents) {
      await this.archiveEntity(doc.id, archivePath);
      archived.push(doc.id);
    }

    // Archive the milestone itself
    await this.archiveEntity(milestoneId, archivePath);
    archived.push(milestoneId);

    return {
      archived_entities: archived,
      archive_path: archivePath,
      timestamp,
    };
  }

  /** Archive a single entity */
  async archiveEntity(entityId: EntityId, archivePath?: string): Promise<ArchiveMetadata> {
    const entity = this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const originalPath = this.getEntityPath(entityId);
    if (!originalPath) {
      throw new Error(`Entity path not found: ${entityId}`);
    }

    const quarter = this.getQuarter(new Date());
    const targetPath = archivePath || this.getArchivePath(quarter);
    const newPath = `${targetPath}/${this.getFilename(entity)}`;

    await this.moveFile(originalPath, newPath);

    return {
      entity_id: entityId,
      entity_type: entity.type,
      archived_at: new Date().toISOString(),
      archive_path: newPath,
      original_path: originalPath,
      quarter,
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

  /** Get current quarter string (e.g., "2024-Q1") */
  private getQuarter(date: Date): string {
    const year = date.getFullYear();
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    return `${year}-Q${quarter}`;
  }

  /** Get archive path for a quarter and optional milestone */
  private getArchivePath(quarter: string, milestoneId?: EntityId): string {
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

  /** List archived entities for a quarter */
  getArchivedEntities(quarter: string): ArchiveMetadata[] {
    // This would be implemented with actual file system scanning
    // For now, return empty array as placeholder
    return [];
  }
}
