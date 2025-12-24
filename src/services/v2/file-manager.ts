/**
 * V2 Atomic File Manager
 *
 * Provides atomic file writes with temp files and rollback support.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { VaultPath, FileOperationError } from '../../models/v2-types.js';

// =============================================================================
// File Operation Types
// =============================================================================

export interface WriteOptions {
  /** Create parent directories if they don't exist */
  createDirs?: boolean;
  /** Backup existing file before overwrite */
  backup?: boolean;
  /** File encoding */
  encoding?: BufferEncoding;
}

export interface ReadOptions {
  /** File encoding */
  encoding?: BufferEncoding;
}

export interface MoveOptions {
  /** Overwrite destination if exists */
  overwrite?: boolean;
  /** Create parent directories if they don't exist */
  createDirs?: boolean;
}

const DEFAULT_WRITE_OPTIONS: Required<WriteOptions> = {
  createDirs: true,
  backup: false,
  encoding: 'utf-8',
};

const DEFAULT_READ_OPTIONS: Required<ReadOptions> = {
  encoding: 'utf-8',
};

const DEFAULT_MOVE_OPTIONS: Required<MoveOptions> = {
  overwrite: false,
  createDirs: true,
};

// =============================================================================
// Atomic File Manager Class
// =============================================================================

/**
 * Manages file operations with atomic writes and rollback support.
 */
export class AtomicFileManager {
  private tempDir: string;
  private backupDir: string;

  constructor(
    private vaultPath: string,
    tempDir?: string,
    backupDir?: string
  ) {
    this.tempDir = tempDir || path.join(vaultPath, '.obsidian', 'mcp-temp');
    this.backupDir = backupDir || path.join(vaultPath, '.obsidian', 'mcp-backup');
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /** Read file contents */
  async read(filePath: VaultPath, options: ReadOptions = {}): Promise<string> {
    const opts = { ...DEFAULT_READ_OPTIONS, ...options };
    const absolutePath = this.toAbsolute(filePath);

    try {
      return await fs.readFile(absolutePath, { encoding: opts.encoding });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new FileOperationError(`File not found: ${filePath}`, 'read', filePath);
      }
      throw new FileOperationError(`Failed to read file: ${error.message}`, 'read', filePath);
    }
  }

  /** Check if file exists */
  async exists(filePath: VaultPath): Promise<boolean> {
    const absolutePath = this.toAbsolute(filePath);
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Get file stats */
  async stat(filePath: VaultPath): Promise<fs.FileHandle | null> {
    const absolutePath = this.toAbsolute(filePath);
    try {
      const stats = await fs.stat(absolutePath);
      return stats as any;
    } catch {
      return null;
    }
  }

  /** Get file modification time */
  async getMtime(filePath: VaultPath): Promise<number | null> {
    const absolutePath = this.toAbsolute(filePath);
    try {
      const stats = await fs.stat(absolutePath);
      return stats.mtimeMs;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  /** Write file atomically */
  async write(filePath: VaultPath, content: string, options: WriteOptions = {}): Promise<void> {
    const opts = { ...DEFAULT_WRITE_OPTIONS, ...options };
    const absolutePath = this.toAbsolute(filePath);
    const tempPath = await this.getTempPath(filePath);

    try {
      // Ensure directories exist
      if (opts.createDirs) {
        await this.ensureDir(path.dirname(absolutePath));
        await this.ensureDir(path.dirname(tempPath));
      }

      // Backup existing file if requested
      if (opts.backup && await this.exists(filePath)) {
        await this.backup(filePath);
      }

      // Write to temp file first
      await fs.writeFile(tempPath, content, { encoding: opts.encoding });

      // Atomic rename
      await fs.rename(tempPath, absolutePath);
    } catch (error: any) {
      // Clean up temp file on failure
      try { await fs.unlink(tempPath); } catch {}
      throw new FileOperationError(`Failed to write file: ${error.message}`, 'write', filePath);
    }
  }

  /** Append to file */
  async append(filePath: VaultPath, content: string, options: WriteOptions = {}): Promise<void> {
    const opts = { ...DEFAULT_WRITE_OPTIONS, ...options };
    const absolutePath = this.toAbsolute(filePath);

    try {
      if (opts.createDirs) {
        await this.ensureDir(path.dirname(absolutePath));
      }
      await fs.appendFile(absolutePath, content, { encoding: opts.encoding });
    } catch (error: any) {
      throw new FileOperationError(`Failed to append to file: ${error.message}`, 'write', filePath);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete Operations
  // ---------------------------------------------------------------------------

  /** Delete file */
  async delete(filePath: VaultPath, backup: boolean = false): Promise<void> {
    const absolutePath = this.toAbsolute(filePath);

    try {
      if (backup) {
        await this.backup(filePath);
      }
      await fs.unlink(absolutePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') return; // Already deleted
      throw new FileOperationError(`Failed to delete file: ${error.message}`, 'delete', filePath);
    }
  }

  // ---------------------------------------------------------------------------
  // Move Operations
  // ---------------------------------------------------------------------------

  /** Move file */
  async move(sourcePath: VaultPath, destPath: VaultPath, options: MoveOptions = {}): Promise<void> {
    const opts = { ...DEFAULT_MOVE_OPTIONS, ...options };
    const absoluteSource = this.toAbsolute(sourcePath);
    const absoluteDest = this.toAbsolute(destPath);

    try {
      // Check if destination exists
      if (!opts.overwrite && await this.exists(destPath)) {
        throw new Error('Destination file already exists');
      }

      // Ensure destination directory exists
      if (opts.createDirs) {
        await this.ensureDir(path.dirname(absoluteDest));
      }

      await fs.rename(absoluteSource, absoluteDest);
    } catch (error: any) {
      throw new FileOperationError(`Failed to move file: ${error.message}`, 'move', sourcePath);
    }
  }

  /** Copy file */
  async copy(sourcePath: VaultPath, destPath: VaultPath, options: MoveOptions = {}): Promise<void> {
    const opts = { ...DEFAULT_MOVE_OPTIONS, ...options };
    const absoluteSource = this.toAbsolute(sourcePath);
    const absoluteDest = this.toAbsolute(destPath);

    try {
      if (!opts.overwrite && await this.exists(destPath)) {
        throw new Error('Destination file already exists');
      }

      if (opts.createDirs) {
        await this.ensureDir(path.dirname(absoluteDest));
      }

      await fs.copyFile(absoluteSource, absoluteDest);
    } catch (error: any) {
      throw new FileOperationError(`Failed to copy file: ${error.message}`, 'copy', sourcePath);
    }
  }

  // ---------------------------------------------------------------------------
  // Directory Operations
  // ---------------------------------------------------------------------------

  /** Ensure directory exists */
  async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new FileOperationError(`Failed to create directory: ${error.message}`, 'mkdir', dirPath);
      }
    }
  }

  /** List files in directory (recursive) */
  async listFiles(dirPath: VaultPath, pattern?: RegExp): Promise<VaultPath[]> {
    const absolutePath = this.toAbsolute(dirPath);
    return this.listFilesRecursive(absolutePath, dirPath, pattern);
  }

  /** Recursively list files in directory */
  private async listFilesRecursive(absolutePath: string, vaultPath: VaultPath, pattern?: RegExp): Promise<VaultPath[]> {
    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const files: VaultPath[] = [];

      for (const entry of entries) {
        const entryAbsPath = path.join(absolutePath, entry.name);
        const entryVaultPath = path.join(vaultPath, entry.name);

        if (entry.isFile()) {
          if (!pattern || pattern.test(entryVaultPath)) {
            files.push(entryVaultPath);
          }
        } else if (entry.isDirectory()) {
          const subFiles = await this.listFilesRecursive(entryAbsPath, entryVaultPath, pattern);
          files.push(...subFiles);
        }
      }

      return files;
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw new FileOperationError(`Failed to list directory: ${error.message}`, 'readdir', vaultPath);
    }
  }

  /** List subdirectories */
  async listDirs(dirPath: VaultPath): Promise<VaultPath[]> {
    const absolutePath = this.toAbsolute(dirPath);

    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => path.join(dirPath, e.name));
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw new FileOperationError(`Failed to list directory: ${error.message}`, 'readdir', dirPath);
    }
  }

  // ---------------------------------------------------------------------------
  // Backup Operations
  // ---------------------------------------------------------------------------

  /** Backup file */
  async backup(filePath: VaultPath): Promise<VaultPath> {
    const absolutePath = this.toAbsolute(filePath);
    const timestamp = Date.now();
    const backupName = `${path.basename(filePath, '.md')}_${timestamp}.md`;
    const backupPath = path.join(this.backupDir, backupName);

    await this.ensureDir(this.backupDir);
    await fs.copyFile(absolutePath, backupPath);

    return this.toVaultPath(backupPath);
  }

  /** Restore from backup */
  async restore(backupPath: VaultPath, destPath: VaultPath): Promise<void> {
    await this.copy(backupPath, destPath, { overwrite: true });
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /** Get temp file path */
  private async getTempPath(filePath: VaultPath): Promise<string> {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const tempName = `${path.basename(filePath, '.md')}_${timestamp}_${random}.tmp`;
    return path.join(this.tempDir, tempName);
  }

  /** Convert vault path to absolute path */
  private toAbsolute(vaultPath: VaultPath): string {
    if (path.isAbsolute(vaultPath)) return vaultPath;
    return path.join(this.vaultPath, vaultPath);
  }

  /** Convert absolute path to vault path */
  private toVaultPath(absolutePath: string): VaultPath {
    if (absolutePath.startsWith(this.vaultPath)) {
      return absolutePath.slice(this.vaultPath.length + 1);
    }
    return absolutePath;
  }

  /** Clean up temp files */
  async cleanupTemp(): Promise<number> {
    try {
      const files = await fs.readdir(this.tempDir);
      let cleaned = 0;
      for (const file of files) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
          cleaned++;
        } catch {}
      }
      return cleaned;
    } catch {
      return 0;
    }
  }
}
