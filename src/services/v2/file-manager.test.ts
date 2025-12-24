/**
 * Tests for V2 Atomic File Manager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AtomicFileManager } from './file-manager.js';
import { FileOperationError } from '../../models/v2-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('AtomicFileManager', () => {
  let tempDir: string;
  let fileManager: AtomicFileManager;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-manager-test-'));
    fileManager = new AtomicFileManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read', () => {
    it('should read file contents', async () => {
      const filePath = 'test.md';
      const content = '# Test Content\n\nSome text here.';
      await fs.writeFile(path.join(tempDir, filePath), content, 'utf-8');

      const result = await fileManager.read(filePath);
      expect(result).toBe(content);
    });

    it('should throw FileOperationError for non-existent file', async () => {
      await expect(fileManager.read('nonexistent.md')).rejects.toThrow(FileOperationError);
    });

    it('should read with custom encoding', async () => {
      const filePath = 'test.txt';
      const content = 'Test content';
      await fs.writeFile(path.join(tempDir, filePath), content, 'utf-8');

      const result = await fileManager.read(filePath, { encoding: 'utf-8' });
      expect(result).toBe(content);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = 'exists.md';
      await fs.writeFile(path.join(tempDir, filePath), 'content', 'utf-8');

      const result = await fileManager.exists(filePath);
      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const result = await fileManager.exists('nonexistent.md');
      expect(result).toBe(false);
    });
  });

  describe('stat', () => {
    it('should return stats for existing file', async () => {
      const filePath = 'stats.md';
      await fs.writeFile(path.join(tempDir, filePath), 'content', 'utf-8');

      const result = await fileManager.stat(filePath);
      expect(result).not.toBeNull();
    });

    it('should return null for non-existent file', async () => {
      const result = await fileManager.stat('nonexistent.md');
      expect(result).toBeNull();
    });
  });

  describe('getMtime', () => {
    it('should return modification time for existing file', async () => {
      const filePath = 'mtime.md';
      await fs.writeFile(path.join(tempDir, filePath), 'content', 'utf-8');

      const result = await fileManager.getMtime(filePath);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should return null for non-existent file', async () => {
      const result = await fileManager.getMtime('nonexistent.md');
      expect(result).toBeNull();
    });
  });

  describe('write', () => {
    it('should write file atomically', async () => {
      const filePath = 'write-test.md';
      const content = '# New Content';

      await fileManager.write(filePath, content);

      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe(content);
    });

    it('should create parent directories', async () => {
      const filePath = 'subdir/nested/write-test.md';
      const content = '# Nested Content';

      await fileManager.write(filePath, content, { createDirs: true });

      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe(content);
    });

    it('should overwrite existing file', async () => {
      const filePath = 'overwrite.md';
      await fs.writeFile(path.join(tempDir, filePath), 'old content', 'utf-8');

      await fileManager.write(filePath, 'new content');

      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe('new content');
    });

    it('should backup file before overwrite when requested', async () => {
      const filePath = 'backup-test.md';
      await fs.writeFile(path.join(tempDir, filePath), 'original content', 'utf-8');

      await fileManager.write(filePath, 'new content', { backup: true });

      // Check new content
      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe('new content');

      // Check backup exists
      const backupDir = path.join(tempDir, '.obsidian', 'mcp-backup');
      const backupFiles = await fs.readdir(backupDir);
      expect(backupFiles.length).toBeGreaterThan(0);
    });
  });

  describe('append', () => {
    it('should append to existing file', async () => {
      const filePath = 'append-test.md';
      await fs.writeFile(path.join(tempDir, filePath), 'line 1\n', 'utf-8');

      await fileManager.append(filePath, 'line 2\n');

      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe('line 1\nline 2\n');
    });

    it('should create file if it does not exist', async () => {
      const filePath = 'new-append.md';

      await fileManager.append(filePath, 'first line\n');

      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe('first line\n');
    });

    it('should create parent directories when appending', async () => {
      const filePath = 'subdir/append.md';

      await fileManager.append(filePath, 'content', { createDirs: true });

      const result = await fs.readFile(path.join(tempDir, filePath), 'utf-8');
      expect(result).toBe('content');
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      const filePath = 'delete-test.md';
      await fs.writeFile(path.join(tempDir, filePath), 'content', 'utf-8');

      await fileManager.delete(filePath);

      const exists = await fileManager.exists(filePath);
      expect(exists).toBe(false);
    });

    it('should not throw for non-existent file', async () => {
      await expect(fileManager.delete('nonexistent.md')).resolves.not.toThrow();
    });

    it('should backup before delete when requested', async () => {
      const filePath = 'delete-backup.md';
      await fs.writeFile(path.join(tempDir, filePath), 'content to backup', 'utf-8');

      await fileManager.delete(filePath, true);

      // File should be deleted
      const exists = await fileManager.exists(filePath);
      expect(exists).toBe(false);

      // Backup should exist
      const backupDir = path.join(tempDir, '.obsidian', 'mcp-backup');
      const backupFiles = await fs.readdir(backupDir);
      expect(backupFiles.length).toBeGreaterThan(0);
    });
  });

  describe('move', () => {
    it('should move file to new location', async () => {
      const sourcePath = 'source.md';
      const destPath = 'dest.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'content', 'utf-8');

      await fileManager.move(sourcePath, destPath);

      expect(await fileManager.exists(sourcePath)).toBe(false);
      expect(await fileManager.exists(destPath)).toBe(true);
      expect(await fileManager.read(destPath)).toBe('content');
    });

    it('should throw when destination exists and overwrite is false', async () => {
      const sourcePath = 'source.md';
      const destPath = 'dest.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'source content', 'utf-8');
      await fs.writeFile(path.join(tempDir, destPath), 'dest content', 'utf-8');

      await expect(fileManager.move(sourcePath, destPath, { overwrite: false }))
        .rejects.toThrow(FileOperationError);
    });

    it('should overwrite when overwrite is true', async () => {
      const sourcePath = 'source.md';
      const destPath = 'dest.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'source content', 'utf-8');
      await fs.writeFile(path.join(tempDir, destPath), 'dest content', 'utf-8');

      await fileManager.move(sourcePath, destPath, { overwrite: true });

      expect(await fileManager.read(destPath)).toBe('source content');
    });

    it('should create destination directories', async () => {
      const sourcePath = 'source.md';
      const destPath = 'subdir/nested/dest.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'content', 'utf-8');

      await fileManager.move(sourcePath, destPath, { createDirs: true });

      expect(await fileManager.exists(destPath)).toBe(true);
    });
  });

  describe('copy', () => {
    it('should copy file to new location', async () => {
      const sourcePath = 'source.md';
      const destPath = 'copy.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'content', 'utf-8');

      await fileManager.copy(sourcePath, destPath);

      expect(await fileManager.exists(sourcePath)).toBe(true);
      expect(await fileManager.exists(destPath)).toBe(true);
      expect(await fileManager.read(destPath)).toBe('content');
    });

    it('should throw when destination exists and overwrite is false', async () => {
      const sourcePath = 'source.md';
      const destPath = 'dest.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'source', 'utf-8');
      await fs.writeFile(path.join(tempDir, destPath), 'dest', 'utf-8');

      await expect(fileManager.copy(sourcePath, destPath, { overwrite: false }))
        .rejects.toThrow(FileOperationError);
    });

    it('should overwrite when overwrite is true', async () => {
      const sourcePath = 'source.md';
      const destPath = 'dest.md';
      await fs.writeFile(path.join(tempDir, sourcePath), 'source', 'utf-8');
      await fs.writeFile(path.join(tempDir, destPath), 'dest', 'utf-8');

      await fileManager.copy(sourcePath, destPath, { overwrite: true });

      expect(await fileManager.read(destPath)).toBe('source');
    });
  });

  describe('ensureDir', () => {
    it('should create directory', async () => {
      const dirPath = path.join(tempDir, 'new-dir');

      await fileManager.ensureDir(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories', async () => {
      const dirPath = path.join(tempDir, 'a', 'b', 'c');

      await fileManager.ensureDir(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const dirPath = path.join(tempDir, 'existing-dir');
      await fs.mkdir(dirPath);

      await expect(fileManager.ensureDir(dirPath)).resolves.not.toThrow();
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.md'), 'content', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'file2.md'), 'content', 'utf-8');

      const files = await fileManager.listFiles('.');

      expect(files).toContain('file1.md');
      expect(files).toContain('file2.md');
    });

    it('should list files recursively', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fs.writeFile(path.join(tempDir, 'root.md'), 'content', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'subdir', 'nested.md'), 'content', 'utf-8');

      const files = await fileManager.listFiles('.');

      expect(files).toContain('root.md');
      expect(files.some(f => f.includes('nested.md'))).toBe(true);
    });

    it('should filter files by pattern', async () => {
      await fs.writeFile(path.join(tempDir, 'file.md'), 'content', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content', 'utf-8');

      const files = await fileManager.listFiles('.', /\.md$/);

      expect(files).toContain('file.md');
      expect(files).not.toContain('file.txt');
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await fileManager.listFiles('nonexistent');

      expect(files).toEqual([]);
    });
  });

  describe('listDirs', () => {
    it('should list subdirectories', async () => {
      await fs.mkdir(path.join(tempDir, 'dir1'));
      await fs.mkdir(path.join(tempDir, 'dir2'));
      await fs.writeFile(path.join(tempDir, 'file.md'), 'content', 'utf-8');

      const dirs = await fileManager.listDirs('.');

      expect(dirs.some(d => d.includes('dir1'))).toBe(true);
      expect(dirs.some(d => d.includes('dir2'))).toBe(true);
      expect(dirs.some(d => d.includes('file.md'))).toBe(false);
    });

    it('should return empty array for non-existent directory', async () => {
      const dirs = await fileManager.listDirs('nonexistent');

      expect(dirs).toEqual([]);
    });
  });

  describe('backup', () => {
    it('should create backup of file', async () => {
      const filePath = 'to-backup.md';
      await fs.writeFile(path.join(tempDir, filePath), 'backup content', 'utf-8');

      const backupPath = await fileManager.backup(filePath);

      expect(backupPath).toContain('to-backup');
      expect(backupPath).toContain('.md');
    });
  });

  describe('restore', () => {
    it('should restore file from backup', async () => {
      // Create original and backup
      const originalPath = 'original.md';
      await fs.writeFile(path.join(tempDir, originalPath), 'original content', 'utf-8');
      const backupPath = await fileManager.backup(originalPath);

      // Modify original
      await fileManager.write(originalPath, 'modified content');

      // Restore from backup
      await fileManager.restore(backupPath, originalPath);

      const result = await fileManager.read(originalPath);
      expect(result).toBe('original content');
    });
  });

  describe('cleanupTemp', () => {
    it('should clean up temp files', async () => {
      // Create temp directory and files
      const mcpTempDir = path.join(tempDir, '.obsidian', 'mcp-temp');
      await fs.mkdir(mcpTempDir, { recursive: true });
      await fs.writeFile(path.join(mcpTempDir, 'temp1.tmp'), 'temp', 'utf-8');
      await fs.writeFile(path.join(mcpTempDir, 'temp2.tmp'), 'temp', 'utf-8');

      const cleaned = await fileManager.cleanupTemp();

      expect(cleaned).toBe(2);
    });

    it('should return 0 when temp directory does not exist', async () => {
      const cleaned = await fileManager.cleanupTemp();

      expect(cleaned).toBe(0);
    });
  });

  describe('path handling', () => {
    it('should handle absolute paths', async () => {
      const absolutePath = path.join(tempDir, 'absolute.md');
      await fs.writeFile(absolutePath, 'content', 'utf-8');

      const result = await fileManager.read(absolutePath);
      expect(result).toBe('content');
    });

    it('should handle relative paths', async () => {
      const relativePath = 'relative.md';
      await fs.writeFile(path.join(tempDir, relativePath), 'content', 'utf-8');

      const result = await fileManager.read(relativePath);
      expect(result).toBe('content');
    });
  });
});

