# File Operations Specification

> **Version:** 2.0
> **Date:** December 2024
> **Scope:** MCP Server and Obsidian Plugin
> **Status:** Implementation Spec

---

## Overview

This document specifies file system operations for entity management: path conventions, atomic operations, archive structure, and file naming rules.

---

## Table of Contents

1. [Path Conventions](#path-conventions)
2. [File Naming](#file-naming)
3. [Folder Structure](#folder-structure)
4. [Atomic Operations](#atomic-operations)
5. [Archive Operations](#archive-operations)
6. [Restore Operations](#restore-operations)
7. [File Watching](#file-watching)

---

## Path Conventions

### Base Paths

```typescript
interface PathConfig {
  // Active entities
  entities_root: 'accomplishments';
  
  // Type-specific folders
  milestones: 'accomplishments/milestones';
  stories: 'accomplishments/stories';
  tasks: 'accomplishments/tasks';
  decisions: 'accomplishments/decisions';
  documents: 'accomplishments/documents';
  
  // Archive
  archive_root: 'archive';
  
  // Canvas files
  canvas_root: 'projects';
  
  // Plugin data
  plugin_data: '.obsidian/plugins/canvas-accomplishments';
}

const DEFAULT_PATHS: PathConfig = {
  entities_root: 'accomplishments',
  milestones: 'accomplishments/milestones',
  stories: 'accomplishments/stories',
  tasks: 'accomplishments/tasks',
  decisions: 'accomplishments/decisions',
  documents: 'accomplishments/documents',
  archive_root: 'archive',
  canvas_root: 'projects',
  plugin_data: '.obsidian/plugins/canvas-accomplishments',
};
```

### Path Resolution

```typescript
class PathResolver {
  private config: PathConfig;
  
  constructor(config: PathConfig = DEFAULT_PATHS) {
    this.config = config;
  }
  
  // Get folder path for entity type
  getFolderForType(type: EntityType): string {
    switch (type) {
      case 'milestone': return this.config.milestones;
      case 'story': return this.config.stories;
      case 'task': return this.config.tasks;
      case 'decision': return this.config.decisions;
      case 'document': return this.config.documents;
      default: throw new Error(`Unknown entity type: ${type}`);
    }
  }
  
  // Build full path for entity
  getEntityPath(entity: { id: string; type: EntityType; title: string }): string {
    const folder = this.getFolderForType(entity.type);
    const filename = this.buildFilename(entity.title);
    return `${folder}/${filename}`;
  }

  // Build filename from title (ID is stored in frontmatter, not filename)
  buildFilename(title: string): string {
    const slug = this.slugify(title);
    return `${slug}.md`;
  }
  
  // Parse entity type from path (ID must be read from frontmatter)
  parseEntityPath(path: string): {
    type: EntityType;
    slug: string;
  } | null {
    const match = path.match(
      /accomplishments\/(\w+)\/(.+)\.md$/
    );

    if (!match) return null;

    const [, folder, slug] = match;
    const type = this.folderToType(folder);

    return { type, slug };
  }

  // Get archive path for entity
  getArchivePath(
    entity: EntityBase,
    archiveDate: Date = new Date()
  ): string {
    const quarter = this.getQuarter(archiveDate);
    const filename = this.buildFilename(entity.title);
    return `${this.config.archive_root}/${quarter}/${entity.type}s/${filename}`;
  }
  
  // Get milestone archive path (includes children)
  getMilestoneArchivePath(
    milestone: Milestone,
    archiveDate: Date = new Date()
  ): string {
    const quarter = this.getQuarter(archiveDate);
    const slug = this.slugify(milestone.title);
    return `${this.config.archive_root}/${quarter}/${milestone.id}_${slug}`;
  }
  
  // Utilities
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')    // Remove special chars
      .replace(/\s+/g, '_')         // Spaces to underscores
      .replace(/_+/g, '_')          // Collapse multiple underscores
      .replace(/^_|_$/g, '')        // Trim leading/trailing
      .slice(0, 50);                // Max length
  }
  
  private getQuarter(date: Date): string {
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }
  
  private folderToType(folder: string): EntityType {
    const map: Record<string, EntityType> = {
      'milestones': 'milestone',
      'stories': 'story',
      'tasks': 'task',
      'decisions': 'decision',
      'documents': 'document',
    };
    return map[folder] ?? 'story';
  }
}
```

---

## File Naming

### Naming Rules

| Rule | Example | Rationale |
|------|---------|-----------|
| Title-based filename | `Project_Launch.md` | Human-readable |
| ID in frontmatter | `id: M-001` | Unique identifier stored in file content |
| Underscore separator | `Project_Launch.md` | Safe in all systems |
| Max 100 char slug | Truncated at 100 | Prevent path length issues |
| `.md` extension | Always markdown | Obsidian compatibility |

> **Note:** Entity IDs are no longer included in filenames. The ID is stored in the frontmatter `id` field.

### ID Format Patterns

```typescript
const ID_PATTERNS = {
  milestone: /^M-(\d{3,})$/,
  story: /^S-(\d{3,})$/,
  task: /^T-(\d{3,})$/,
  decision: /^DEC-(\d{3,})$/,
  document: /^DOC-(\d{3,})$/,
};

function validateId(id: string, type: EntityType): boolean {
  const pattern = ID_PATTERNS[type];
  return pattern.test(id);
}
```

### ID Generation

```typescript
class IdGenerator {
  private counters: Map<EntityType, number> = new Map();
  
  async initialize(index: ProjectIndex): Promise<void> {
    for (const type of ['milestone', 'story', 'task', 'decision', 'document'] as EntityType[]) {
      const ids = index.secondary.getByType(type);
      let maxNum = 0;
      
      for (const id of ids) {
        const num = parseIdNumber(id);
        maxNum = Math.max(maxNum, num);
      }
      
      this.counters.set(type, maxNum);
    }
  }
  
  generateId(type: EntityType): string {
    const current = this.counters.get(type) ?? 0;
    const next = current + 1;
    this.counters.set(type, next);
    
    const prefix = this.getPrefix(type);
    const padded = String(next).padStart(3, '0');
    
    return `${prefix}-${padded}`;
  }
  
  private getPrefix(type: EntityType): string {
    switch (type) {
      case 'milestone': return 'M';
      case 'story': return 'S';
      case 'task': return 'T';
      case 'decision': return 'DEC';
      case 'document': return 'DOC';
    }
  }
}
```

---

## Folder Structure

### Active Entity Structure

```
accomplishments/
├── milestones/
│   ├── M-001_Q1_Product_Launch.md
│   └── M-002_Infrastructure_Upgrade.md
├── stories/
│   ├── S-001_User_Authentication.md
│   └── S-015_Premium_Features.md
├── tasks/
│   ├── T-001_Setup_Database.md
│   └── T-002_Create_API_Endpoints.md
├── decisions/
│   ├── DEC-001_Premium_Feature_Set.md
│   └── DEC-002_API_Versioning.md
└── documents/
    ├── DOC-001_Architecture_Overview.md
    └── DOC-005_Premium_Features_Spec.md
```

### Archive Structure

```
archive/
├── 2024-Q3/
│   ├── M-001_MVP_Launch/
│   │   ├── _milestone.md
│   │   ├── stories/
│   │   └── tasks/
│   ├── decisions/
│   └── documents/
└── 2024-Q4/
    └── ...
```

---

## Atomic Operations

### Operation Types

```typescript
type FileOperation = 
  | CreateOperation
  | UpdateOperation
  | MoveOperation
  | DeleteOperation
  | BatchOperation;

interface CreateOperation {
  type: 'create';
  path: string;
  content: string;
}

interface UpdateOperation {
  type: 'update';
  path: string;
  content: string;
  expectedMtime?: number;
}

interface MoveOperation {
  type: 'move';
  fromPath: string;
  toPath: string;
  updateContent?: (content: string) => string;
}

interface DeleteOperation {
  type: 'delete';
  path: string;
  backup?: boolean;
}

interface BatchOperation {
  type: 'batch';
  operations: FileOperation[];
  atomic: boolean;
}
```

### Atomic File Manager

```typescript
class AtomicFileManager {
  private vault: Vault;
  private rollbackStack: RollbackEntry[] = [];
  
  async execute(op: FileOperation): Promise<OperationResult> {
    try {
      switch (op.type) {
        case 'create': return this.executeCreate(op);
        case 'update': return this.executeUpdate(op);
        case 'move': return this.executeMove(op);
        case 'delete': return this.executeDelete(op);
        case 'batch': return this.executeBatch(op);
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  private async executeCreate(op: CreateOperation): Promise<OperationResult> {
    if (await this.vault.adapter.exists(op.path)) {
      return { success: false, error: `File already exists: ${op.path}` };
    }
    
    const dir = dirname(op.path);
    if (!await this.vault.adapter.exists(dir)) {
      await this.vault.adapter.mkdir(dir);
    }
    
    await this.vault.adapter.write(op.path, op.content);
    this.rollbackStack.push({ type: 'delete', path: op.path });
    
    return { success: true, path: op.path };
  }
  
  private async executeUpdate(op: UpdateOperation): Promise<OperationResult> {
    if (!await this.vault.adapter.exists(op.path)) {
      return { success: false, error: `File not found: ${op.path}` };
    }
    
    if (op.expectedMtime !== undefined) {
      const stat = await this.vault.adapter.stat(op.path);
      if (stat && stat.mtime !== op.expectedMtime) {
        return { success: false, error: 'File was modified', conflict: true };
      }
    }
    
    const original = await this.vault.adapter.read(op.path);
    this.rollbackStack.push({ type: 'restore', path: op.path, content: original });
    
    await this.vault.adapter.write(op.path, op.content);
    return { success: true, path: op.path };
  }
  
  private async executeMove(op: MoveOperation): Promise<OperationResult> {
    if (!await this.vault.adapter.exists(op.fromPath)) {
      return { success: false, error: `Source not found: ${op.fromPath}` };
    }
    
    const dir = dirname(op.toPath);
    if (!await this.vault.adapter.exists(dir)) {
      await this.vault.adapter.mkdir(dir);
    }
    
    let content = await this.vault.adapter.read(op.fromPath);
    if (op.updateContent) {
      content = op.updateContent(content);
    }
    
    this.rollbackStack.push({
      type: 'move',
      fromPath: op.toPath,
      toPath: op.fromPath,
      content: await this.vault.adapter.read(op.fromPath),
    });
    
    await this.vault.adapter.write(op.toPath, content);
    await this.vault.adapter.remove(op.fromPath);
    
    return { success: true, path: op.toPath };
  }
  
  private async executeBatch(op: BatchOperation): Promise<OperationResult> {
    const results: OperationResult[] = [];
    const startIndex = this.rollbackStack.length;
    
    for (const subOp of op.operations) {
      const result = await this.execute(subOp);
      results.push(result);
      
      if (!result.success && op.atomic) {
        await this.rollbackTo(startIndex);
        return { success: false, error: result.error, partialResults: results };
      }
    }
    
    return { success: results.every(r => r.success), results };
  }
  
  async rollbackTo(index: number): Promise<void> {
    while (this.rollbackStack.length > index) {
      const entry = this.rollbackStack.pop()!;
      await this.applyRollback(entry);
    }
  }
  
  commit(): void {
    this.rollbackStack = [];
  }
}
```

---

## Archive Operations

```typescript
interface ArchiveResult {
  success: boolean;
  archived_entities: { id: string; archive_path: string }[];
  errors: string[];
}

class ArchiveManager {
  async archiveEntity(entityId: EntityId): Promise<ArchiveResult> {
    const entity = await this.loadEntity(entityId);
    if (!entity) {
      return { success: false, archived_entities: [], errors: ['Not found'] };
    }
    
    if (!this.canArchive(entity)) {
      return { success: false, archived_entities: [], errors: ['Cannot archive incomplete entity'] };
    }
    
    const archivePath = this.pathResolver.getArchivePath(entity);
    
    entity.archived = true;
    entity.updated_at = new Date().toISOString();
    
    const result = await this.fileManager.execute({
      type: 'move',
      fromPath: entity.vault_path,
      toPath: archivePath,
      updateContent: (c) => this.updateArchivedContent(c, entity),
    });
    
    if (result.success) {
      await this.removeFromCanvas(entity);
      await this.index.removeEntity(entity.id);
    }
    
    return {
      success: result.success,
      archived_entities: result.success ? [{ id: entity.id, archive_path: archivePath }] : [],
      errors: result.error ? [result.error] : [],
    };
  }
  
  private canArchive(entity: EntityBase): boolean {
    return ['Completed', 'Complete', 'Decided', 'Approved', 'Superseded'].includes(entity.status);
  }
}
```

---

## Restore Operations

```typescript
interface RestoreResult {
  success: boolean;
  restored_entities: { id: string; restored_path: string }[];
  errors: string[];
}

class RestoreManager {
  async restoreEntity(entityId: EntityId): Promise<RestoreResult> {
    const archiveInfo = await this.findInArchive(entityId);
    if (!archiveInfo) {
      return { success: false, restored_entities: [], errors: ['Not found in archive'] };
    }
    
    const content = await this.vault.adapter.read(archiveInfo.path);
    const entity = parseEntity(content);
    
    const restorePath = this.pathResolver.getEntityPath(entity);
    
    entity.archived = false;
    entity.vault_path = restorePath;
    entity.updated_at = new Date().toISOString();
    
    const result = await this.fileManager.execute({
      type: 'move',
      fromPath: archiveInfo.path,
      toPath: restorePath,
      updateContent: () => serializeEntity(entity),
    });
    
    if (result.success) {
      await this.addToCanvas(entity);
      await this.index.indexFile(restorePath);
    }
    
    return {
      success: result.success,
      restored_entities: result.success ? [{ id: entity.id, restored_path: restorePath }] : [],
      errors: result.error ? [result.error] : [],
    };
  }
}
```

---

## File Watching

```typescript
interface FileWatchConfig {
  watched_folders: string[];
  debounce_ms: number;
  ignore_patterns: RegExp[];
}

class EntityFileWatcher {
  private config: FileWatchConfig;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: ((event: FileChangeEvent) => void)[] = [];
  
  constructor(vault: Vault, config: FileWatchConfig) {
    this.config = config;
    vault.on('create', (file) => this.handle(file.path, 'create'));
    vault.on('modify', (file) => this.handle(file.path, 'modify'));
    vault.on('delete', (file) => this.handle(file.path, 'delete'));
    vault.on('rename', (file, oldPath) => this.emit({ type: 'rename', path: file.path, oldPath }));
  }
  
  private handle(path: string, type: 'create' | 'modify' | 'delete'): void {
    if (!this.shouldProcess(path)) return;
    
    const existing = this.debounceTimers.get(path);
    if (existing) clearTimeout(existing);
    
    const timer = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.emit({ type, path });
    }, this.config.debounce_ms);
    
    this.debounceTimers.set(path, timer);
  }
  
  private shouldProcess(path: string): boolean {
    const inFolder = this.config.watched_folders.some(f => path.startsWith(f + '/'));
    const ignored = this.config.ignore_patterns.some(p => p.test(basename(path)));
    return inFolder && !ignored;
  }
  
  private emit(event: FileChangeEvent): void {
    this.listeners.forEach(l => l(event));
  }
  
  onFileChange(listener: (event: FileChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }
}

interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string;
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2024-12-17 | Initial file operations specification |
