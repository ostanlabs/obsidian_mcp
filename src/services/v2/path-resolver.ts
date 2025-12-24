/**
 * V2 Path Resolver
 *
 * Resolves entity paths, archive paths, and file naming conventions.
 */

import * as path from 'path';
import {
  EntityId,
  EntityType,
  VaultPath,
  V2Config,
  getEntityTypeFromId,
} from '../../models/v2-types.js';

// =============================================================================
// Path Constants
// =============================================================================

/** Folder names for each entity type */
const TYPE_FOLDERS: Record<EntityType, string> = {
  milestone: 'milestones',
  story: 'stories',
  task: 'tasks',
  decision: 'decisions',
  document: 'documents',
};

/** Archive folder structure */
const ARCHIVE_FOLDER = 'archive';

// =============================================================================
// Path Resolver Class
// =============================================================================

/**
 * Resolves file paths for entities in the vault.
 */
export class PathResolver {
  constructor(private config: V2Config) {}

  // ---------------------------------------------------------------------------
  // Entity Paths
  // ---------------------------------------------------------------------------

  /** Get folder path for entity type */
  getTypeFolderPath(type: EntityType): VaultPath {
    return path.join(this.config.entitiesFolder, TYPE_FOLDERS[type]);
  }

  /** Get absolute folder path for entity type */
  getAbsoluteTypeFolderPath(type: EntityType): string {
    return path.join(this.config.vaultPath, this.getTypeFolderPath(type));
  }

  /** Generate file path for entity */
  getEntityPath(id: EntityId, title: string): VaultPath {
    const type = getEntityTypeFromId(id);
    if (!type) throw new Error(`Invalid entity ID: ${id}`);

    const folder = this.getTypeFolderPath(type);
    const filename = this.generateFilename(id, title);
    return path.join(folder, filename);
  }

  /** Get absolute file path for entity */
  getAbsoluteEntityPath(id: EntityId, title: string): string {
    return path.join(this.config.vaultPath, this.getEntityPath(id, title));
  }

  /** Generate filename from ID and title */
  generateFilename(id: EntityId, title: string): string {
    const sanitized = this.sanitizeTitle(title);
    return `${id}_${sanitized}.md`;
  }

  /** Sanitize title for use in filename */
  private sanitizeTitle(title: string): string {
    return title
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_')          // Replace spaces with underscores
      .replace(/_+/g, '_')           // Collapse multiple underscores
      .replace(/^_|_$/g, '')         // Trim leading/trailing underscores
      .substring(0, 100);            // Limit length
  }

  // ---------------------------------------------------------------------------
  // Archive Paths
  // ---------------------------------------------------------------------------

  /** Get archive folder path for a date */
  getArchiveFolderPath(date: Date = new Date()): VaultPath {
    const year = date.getFullYear();
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    return path.join(this.config.archiveFolder, `${year}-Q${quarter}`);
  }

  /** Get absolute archive folder path */
  getAbsoluteArchiveFolderPath(date: Date = new Date()): string {
    return path.join(this.config.vaultPath, this.getArchiveFolderPath(date));
  }

  /** Get archive path for entity */
  getArchivePath(id: EntityId, title: string, date: Date = new Date()): VaultPath {
    const archiveFolder = this.getArchiveFolderPath(date);
    const filename = this.generateFilename(id, title);
    return path.join(archiveFolder, filename);
  }

  /** Get absolute archive path for entity */
  getAbsoluteArchivePath(id: EntityId, title: string, date: Date = new Date()): string {
    return path.join(this.config.vaultPath, this.getArchivePath(id, title, date));
  }

  // ---------------------------------------------------------------------------
  // Path Parsing
  // ---------------------------------------------------------------------------

  /** Extract entity ID from file path */
  extractIdFromPath(filePath: VaultPath): EntityId | null {
    const filename = path.basename(filePath, '.md');
    const match = filename.match(/^(M-\d+|S-\d+|T-\d+|DEC-\d+|DOC-\d+)/);
    return match ? (match[1] as EntityId) : null;
  }

  /** Check if path is in archive */
  isArchivePath(filePath: VaultPath): boolean {
    return filePath.startsWith(this.config.archiveFolder);
  }

  /** Check if path is an entity file */
  isEntityPath(filePath: VaultPath): boolean {
    if (!filePath.endsWith('.md')) return false;
    const id = this.extractIdFromPath(filePath);
    return id !== null;
  }

  /** Get entity type from path */
  getTypeFromPath(filePath: VaultPath): EntityType | null {
    for (const [type, folder] of Object.entries(TYPE_FOLDERS)) {
      if (filePath.includes(`/${folder}/`) || filePath.startsWith(`${folder}/`)) {
        return type as EntityType;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Canvas Paths
  // ---------------------------------------------------------------------------

  /** Get canvas folder path */
  getCanvasFolderPath(): VaultPath {
    return this.config.canvasFolder;
  }

  /** Get absolute canvas folder path */
  getAbsoluteCanvasFolderPath(): string {
    return path.join(this.config.vaultPath, this.config.canvasFolder);
  }

  /** Check if path is a canvas file */
  isCanvasPath(filePath: VaultPath): boolean {
    return filePath.endsWith('.canvas');
  }

  // ---------------------------------------------------------------------------
  // Folder Utilities
  // ---------------------------------------------------------------------------

  /** Get all entity folder paths */
  getAllEntityFolders(): VaultPath[] {
    return Object.values(TYPE_FOLDERS).map(folder =>
      path.join(this.config.entitiesFolder, folder)
    );
  }

  /** Get all absolute entity folder paths */
  getAllAbsoluteEntityFolders(): string[] {
    return this.getAllEntityFolders().map(folder =>
      path.join(this.config.vaultPath, folder)
    );
  }

  /** Get config */
  /** Convert absolute path to vault-relative path */
  toVaultPath(absolutePath: string): VaultPath {
    if (absolutePath.startsWith(this.config.vaultPath)) {
      return absolutePath.slice(this.config.vaultPath.length + 1);
    }
    return absolutePath;
  }

  /** Convert vault-relative path to absolute path */
  toAbsolutePath(vaultPath: VaultPath): string {
    if (path.isAbsolute(vaultPath)) return vaultPath;
    return path.join(this.config.vaultPath, vaultPath);
  }

  /** Get config */
  getConfig(): V2Config {
    return this.config;
  }
}
