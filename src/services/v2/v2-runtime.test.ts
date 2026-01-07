/**
 * Tests for V2 Runtime
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { V2Runtime, getV2Runtime, resetV2Runtime } from './v2-runtime.js';
import type { V2Config, Entity, Milestone, Story, Task, Decision, Document, EntityId, EntityType, VaultPath, ISODateTime, CanvasPath, MilestoneId, StoryId, TaskId, DecisionId, DocumentId } from '../../models/v2-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('V2Runtime', () => {
  let tempDir: string;
  let config: V2Config;
  let runtime: V2Runtime;

  beforeEach(async () => {
    // Reset singleton
    resetV2Runtime();

    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v2-runtime-test-'));

    // Create entity folders
    const entitiesFolder = 'accomplishments';
    await fs.mkdir(path.join(tempDir, entitiesFolder, 'milestones'), { recursive: true });
    await fs.mkdir(path.join(tempDir, entitiesFolder, 'stories'), { recursive: true });
    await fs.mkdir(path.join(tempDir, entitiesFolder, 'tasks'), { recursive: true });
    await fs.mkdir(path.join(tempDir, entitiesFolder, 'decisions'), { recursive: true });
    await fs.mkdir(path.join(tempDir, entitiesFolder, 'documents'), { recursive: true });
    await fs.mkdir(path.join(tempDir, entitiesFolder, 'archive'), { recursive: true });

    config = {
      vaultPath: tempDir,
      entitiesFolder,
      archiveFolder: `${entitiesFolder}/archive`,
      canvasFolder: entitiesFolder,
      defaultCanvas: 'canvas.canvas',
      workspaces: {},
    };

    runtime = new V2Runtime(config);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    resetV2Runtime();
  });

  // Helper to create a milestone file
  async function createMilestoneFile(id: string, title: string, workstream: string = 'engineering'): Promise<void> {
    const content = `---
id: ${id}
title: ${title}
workstream: ${workstream}
status: In Progress
archived: false
---
# ${title}

## Objective
Test objective.`;
    await fs.writeFile(
      path.join(tempDir, config.entitiesFolder, 'milestones', `${id} ${title}.md`),
      content,
      'utf-8'
    );
  }

  // Helper to create a story file
  async function createStoryFile(id: string, title: string, parent: string, workstream: string = 'engineering'): Promise<void> {
    const content = `---
id: ${id}
title: ${title}
workstream: ${workstream}
status: In Progress
parent: ${parent}
archived: false
---
# ${title}

## Outcome
Test outcome.`;
    await fs.writeFile(
      path.join(tempDir, config.entitiesFolder, 'stories', `${id} ${title}.md`),
      content,
      'utf-8'
    );
  }

  // Helper to create a task file
  async function createTaskFile(id: string, title: string, parent: string, workstream: string = 'engineering'): Promise<void> {
    const content = `---
id: ${id}
title: ${title}
workstream: ${workstream}
status: In Progress
parent: ${parent}
goal: Test goal
archived: false
---
# ${title}

## Description
Test description.`;
    await fs.writeFile(
      path.join(tempDir, config.entitiesFolder, 'tasks', `${id} ${title}.md`),
      content,
      'utf-8'
    );
  }

  // Helper to create a decision file
  async function createDecisionFile(id: string, title: string, workstream: string = 'engineering'): Promise<void> {
    const content = `---
id: ${id}
title: ${title}
workstream: ${workstream}
status: Decided
archived: false
---
# ${title}

## Context
Test context.`;
    await fs.writeFile(
      path.join(tempDir, config.entitiesFolder, 'decisions', `${id} ${title}.md`),
      content,
      'utf-8'
    );
  }

  // Helper to create a document file
  async function createDocumentFile(id: string, title: string, workstream: string = 'engineering'): Promise<void> {
    const content = `---
id: ${id}
title: ${title}
workstream: ${workstream}
status: Draft
doc_type: spec
archived: false
---
# ${title}

## Content
Test content.`;
    await fs.writeFile(
      path.join(tempDir, config.entitiesFolder, 'documents', `${id} ${title}.md`),
      content,
      'utf-8'
    );
  }

  describe('initialize', () => {
    it('should initialize and scan vault', async () => {
      await createMilestoneFile('M-001', 'Test Milestone');
      await createStoryFile('S-001', 'Test Story', 'M-001');

      await runtime.initialize();

      const milestone = await runtime.getEntity('M-001' as EntityId);
      expect(milestone).not.toBeNull();
      expect(milestone?.title).toBe('Test Milestone');

      const story = await runtime.getEntity('S-001' as EntityId);
      expect(story).not.toBeNull();
      expect(story?.title).toBe('Test Story');
    });

    it('should handle empty vault', async () => {
      await runtime.initialize();

      const entities = await runtime.getAllEntities();
      expect(entities).toEqual([]);
    });

    it('should detect duplicate IDs', async () => {
      // Create two files with the same ID
      await createMilestoneFile('M-001', 'First Milestone');
      const content = `---
id: M-001
title: Duplicate Milestone
workstream: engineering
status: In Progress
---
# Duplicate`;
      await fs.writeFile(
        path.join(tempDir, config.entitiesFolder, 'milestones', 'M-001 Duplicate.md'),
        content,
        'utf-8'
      );

      await runtime.initialize();

      expect(runtime.hasDuplicateIds()).toBe(true);
      const duplicates = runtime.getDuplicateIds();
      expect(duplicates.has('M-001' as EntityId)).toBe(true);
    });
  });

  describe('getEntity', () => {
    it('should return entity by ID', async () => {
      await createMilestoneFile('M-001', 'Test Milestone');
      await runtime.initialize();

      const entity = await runtime.getEntity('M-001' as EntityId);
      expect(entity).not.toBeNull();
      expect(entity?.id).toBe('M-001');
      expect(entity?.type).toBe('milestone');
    });

    it('should return null for non-existent entity', async () => {
      await runtime.initialize();

      const entity = await runtime.getEntity('M-999' as EntityId);
      expect(entity).toBeNull();
    });
  });

  describe('getAllEntities', () => {
    it('should return all entities', async () => {
      await createMilestoneFile('M-001', 'Milestone 1');
      await createMilestoneFile('M-002', 'Milestone 2');
      await createStoryFile('S-001', 'Story 1', 'M-001');
      await runtime.initialize();

      const entities = await runtime.getAllEntities({ includeCompleted: true });
      expect(entities.length).toBe(3);
    });

    it('should filter by type', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await createStoryFile('S-001', 'Story', 'M-001');
      await runtime.initialize();

      const milestones = await runtime.getAllEntities({ types: ['milestone'], includeCompleted: true });
      expect(milestones.length).toBe(1);
      expect(milestones[0].type).toBe('milestone');
    });

    it('should filter by workstream', async () => {
      await createMilestoneFile('M-001', 'Engineering Milestone', 'engineering');
      await createMilestoneFile('M-002', 'Design Milestone', 'design');
      await runtime.initialize();

      const entities = await runtime.getAllEntities({ workstream: 'engineering', includeCompleted: true });
      expect(entities.length).toBe(1);
      expect(entities[0].id).toBe('M-001');
    });

    it('should exclude archived by default', async () => {
      await createMilestoneFile('M-001', 'Active Milestone');
      const archivedContent = `---
id: M-002
title: Archived Milestone
workstream: engineering
status: Completed
archived: true
---
# Archived`;
      await fs.writeFile(
        path.join(tempDir, config.entitiesFolder, 'milestones', 'M-002 Archived.md'),
        archivedContent,
        'utf-8'
      );
      await runtime.initialize();

      const entities = await runtime.getAllEntities({ includeCompleted: true });
      expect(entities.length).toBe(1);
      expect(entities[0].id).toBe('M-001');
    });

    it('should include archived when requested', async () => {
      await createMilestoneFile('M-001', 'Active Milestone');
      const archivedContent = `---
id: M-002
title: Archived Milestone
workstream: engineering
status: Completed
archived: true
---
# Archived`;
      await fs.writeFile(
        path.join(tempDir, config.entitiesFolder, 'milestones', 'M-002 Archived.md'),
        archivedContent,
        'utf-8'
      );
      await runtime.initialize();

      const entities = await runtime.getAllEntities({ includeArchived: true, includeCompleted: true });
      expect(entities.length).toBe(2);
    });
  });

  describe('getNextId', () => {
    it('should generate sequential IDs for milestones', async () => {
      await runtime.initialize();

      // First call returns M-001 (no existing milestones)
      const id1 = await runtime.getNextId('milestone');
      expect(id1).toBe('M-001');

      // Without writing an entity, calling again returns the same ID
      // because the vault scan finds no existing entities
      const id2 = await runtime.getNextId('milestone');
      expect(id2).toBe('M-001');
    });

    it('should generate sequential IDs for stories', async () => {
      await runtime.initialize();

      // First call returns S-001 (no existing stories)
      const id1 = await runtime.getNextId('story');
      expect(id1).toBe('S-001');

      // Without writing an entity, calling again returns the same ID
      const id2 = await runtime.getNextId('story');
      expect(id2).toBe('S-001');
    });

    it('should generate sequential IDs for tasks', async () => {
      await runtime.initialize();

      const id1 = await runtime.getNextId('task');
      expect(id1).toBe('T-001');
    });

    it('should generate sequential IDs for decisions', async () => {
      await runtime.initialize();

      const id1 = await runtime.getNextId('decision');
      expect(id1).toBe('DEC-001');
    });

    it('should generate sequential IDs for documents', async () => {
      await runtime.initialize();

      const id1 = await runtime.getNextId('document');
      expect(id1).toBe('DOC-001');
    });

    it('should continue from highest existing ID', async () => {
      await createMilestoneFile('M-005', 'Existing Milestone');
      await runtime.initialize();

      const nextId = await runtime.getNextId('milestone');
      expect(nextId).toBe('M-006');
    });
  });

  describe('entityExists', () => {
    it('should return true for existing entity', async () => {
      await createMilestoneFile('M-001', 'Test');
      await runtime.initialize();

      expect(runtime.entityExists('M-001' as EntityId)).toBe(true);
    });

    it('should return false for non-existent entity', async () => {
      await runtime.initialize();

      expect(runtime.entityExists('M-999' as EntityId)).toBe(false);
    });
  });

  describe('getEntityTypeFromCache', () => {
    it('should return entity type', async () => {
      await createMilestoneFile('M-001', 'Test');
      await createStoryFile('S-001', 'Story', 'M-001');
      await runtime.initialize();

      expect(runtime.getEntityTypeFromCache('M-001' as EntityId)).toBe('milestone');
      expect(runtime.getEntityTypeFromCache('S-001' as EntityId)).toBe('story');
    });

    it('should return null for non-existent entity', async () => {
      await runtime.initialize();

      expect(runtime.getEntityTypeFromCache('M-999' as EntityId)).toBeNull();
    });
  });

  describe('writeEntity', () => {
    it('should write entity to file', async () => {
      await runtime.initialize();

      const milestone: Milestone = {
        id: 'M-001' as MilestoneId,
        type: 'milestone',
        title: 'New Milestone',
        workstream: 'engineering',
        status: 'In Progress',
        archived: false,
        created_at: new Date().toISOString() as ISODateTime,
        updated_at: new Date().toISOString() as ISODateTime,
        canvas_source: '' as CanvasPath,
        cssclasses: [],
        vault_path: '' as VaultPath,
        priority: 'High',
        depends_on: [],
      };

      await runtime.writeEntity(milestone);

      const retrieved = await runtime.getEntity('M-001' as EntityId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('New Milestone');
    });
  });

  describe('getChildren', () => {
    it('should return children of milestone', async () => {
      await createMilestoneFile('M-001', 'Parent Milestone');
      await createStoryFile('S-001', 'Child Story 1', 'M-001');
      await createStoryFile('S-002', 'Child Story 2', 'M-001');
      await runtime.initialize();

      const children = await runtime.getChildren('M-001' as EntityId);
      expect(children.length).toBe(2);
      expect(children.map(c => c.id)).toContain('S-001');
      expect(children.map(c => c.id)).toContain('S-002');
    });

    it('should return children of story', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await createStoryFile('S-001', 'Story', 'M-001');
      await createTaskFile('T-001', 'Task 1', 'S-001');
      await createTaskFile('T-002', 'Task 2', 'S-001');
      await runtime.initialize();

      const children = await runtime.getChildren('S-001' as EntityId);
      expect(children.length).toBe(2);
    });

    it('should return empty array for entity without children', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await runtime.initialize();

      const children = await runtime.getChildren('M-001' as EntityId);
      expect(children).toEqual([]);
    });
  });

  describe('getParent', () => {
    it('should return parent of story', async () => {
      await createMilestoneFile('M-001', 'Parent');
      await createStoryFile('S-001', 'Child', 'M-001');
      await runtime.initialize();

      const parent = await runtime.getParent('S-001' as EntityId);
      expect(parent).not.toBeNull();
      expect(parent?.id).toBe('M-001');
    });

    it('should return parent of task', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await createStoryFile('S-001', 'Story', 'M-001');
      await createTaskFile('T-001', 'Task', 'S-001');
      await runtime.initialize();

      const parent = await runtime.getParent('T-001' as EntityId);
      expect(parent).not.toBeNull();
      expect(parent?.id).toBe('S-001');
    });

    it('should return null for milestone (no parent)', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await runtime.initialize();

      const parent = await runtime.getParent('M-001' as EntityId);
      expect(parent).toBeNull();
    });

    it('should return null for non-existent entity', async () => {
      await runtime.initialize();

      const parent = await runtime.getParent('M-999' as EntityId);
      expect(parent).toBeNull();
    });
  });

  describe('getSiblings', () => {
    it('should return siblings of story', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await createStoryFile('S-001', 'Story 1', 'M-001');
      await createStoryFile('S-002', 'Story 2', 'M-001');
      await createStoryFile('S-003', 'Story 3', 'M-001');
      await runtime.initialize();

      const siblings = await runtime.getSiblings('S-001' as EntityId);
      expect(siblings.length).toBe(2);
      expect(siblings.map(s => s.id)).toContain('S-002');
      expect(siblings.map(s => s.id)).toContain('S-003');
      expect(siblings.map(s => s.id)).not.toContain('S-001');
    });

    it('should return same-type entities for top-level entities', async () => {
      await createMilestoneFile('M-001', 'Milestone 1');
      await createMilestoneFile('M-002', 'Milestone 2');
      await runtime.initialize();

      const siblings = await runtime.getSiblings('M-001' as EntityId);
      expect(siblings.length).toBe(1);
      expect(siblings[0].id).toBe('M-002');
    });
  });

  describe('toEntitySummary', () => {
    it('should convert entity to summary', async () => {
      await createMilestoneFile('M-001', 'Test Milestone');
      await runtime.initialize();

      const entity = await runtime.getEntity('M-001' as EntityId);
      const summary = runtime.toEntitySummary(entity!);

      expect(summary.id).toBe('M-001');
      expect(summary.type).toBe('milestone');
      expect(summary.title).toBe('Test Milestone');
      expect(summary.status).toBe('In Progress');
      expect(summary.workstream).toBe('engineering');
    });
  });

  describe('toEntityFull', () => {
    it('should convert entity to full representation', async () => {
      await createMilestoneFile('M-001', 'Test Milestone');
      await createStoryFile('S-001', 'Child Story', 'M-001');
      await runtime.initialize();

      const entity = await runtime.getEntity('M-001' as EntityId);
      const full = await runtime.toEntityFull(entity!);

      expect(full.id).toBe('M-001');
      expect(full.children_count).toBe(1);
      expect(full.children?.length).toBe(1);
      expect(full.children?.[0].id).toBe('S-001');
    });
  });

  describe('searchEntities', () => {
    it('should search entities by query', async () => {
      await createMilestoneFile('M-001', 'Authentication Feature');
      await createMilestoneFile('M-002', 'Database Migration');
      await runtime.initialize();

      const results = await runtime.searchEntities('authentication');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.id).toBe('M-001');
    });

    it('should filter search by type', async () => {
      await createMilestoneFile('M-001', 'Auth Milestone');
      await createStoryFile('S-001', 'Auth Story', 'M-001');
      await runtime.initialize();

      const results = await runtime.searchEntities('auth', { types: ['story'] });
      expect(results.every(r => r.entity.type === 'story')).toBe(true);
    });
  });

  describe('getTaskProgress', () => {
    it('should return task progress for story', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await createStoryFile('S-001', 'Story', 'M-001');
      await createTaskFile('T-001', 'Task 1', 'S-001');
      await createTaskFile('T-002', 'Task 2', 'S-001');
      await runtime.initialize();

      const progress = await runtime.getTaskProgress('S-001' as EntityId);
      expect(progress.total).toBe(2);
      expect(progress.completed).toBe(0);
    });
  });

  describe('getAllDecisions', () => {
    it('should return all decisions', async () => {
      await createDecisionFile('DEC-001', 'Decision 1');
      await createDecisionFile('DEC-002', 'Decision 2');
      await runtime.initialize();

      const decisions = await runtime.getAllDecisions();
      expect(decisions.length).toBe(2);
    });

    it('should filter by workstream', async () => {
      await createDecisionFile('DEC-001', 'Engineering Decision', 'engineering');
      await createDecisionFile('DEC-002', 'Design Decision', 'design');
      await runtime.initialize();

      const decisions = await runtime.getAllDecisions({ workstream: 'engineering' });
      expect(decisions.length).toBe(1);
      expect(decisions[0].id).toBe('DEC-001');
    });
  });

  describe('getAllDocuments', () => {
    it('should return all documents', async () => {
      await createDocumentFile('DOC-001', 'Document 1');
      await createDocumentFile('DOC-002', 'Document 2');
      await runtime.initialize();

      const documents = await runtime.getAllDocuments();
      expect(documents.length).toBe(2);
    });
  });

  describe('getAllStories', () => {
    it('should return all stories', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await createStoryFile('S-001', 'Story 1', 'M-001');
      await createStoryFile('S-002', 'Story 2', 'M-001');
      await runtime.initialize();

      const stories = await runtime.getAllStories();
      expect(stories.length).toBe(2);
    });
  });

  describe('createDecision', () => {
    it('should create a new decision', async () => {
      await runtime.initialize();

      const decision = await runtime.createDecision({
        title: 'Use TypeScript',
        context: 'Need to choose a language',
        decision: 'Use TypeScript',
        rationale: 'Type safety',
        workstream: 'engineering',
        decided_by: 'tech-lead',
      });

      expect(decision.id).toBe('DEC-001');
      expect(decision.title).toBe('Use TypeScript');
      expect(decision.status).toBe('Decided');
    });
  });

  describe('updateDocument', () => {
    it('should update document', async () => {
      await createDocumentFile('DOC-001', 'Original Title');
      await runtime.initialize();

      const updated = await runtime.updateDocument('DOC-001' as EntityId, {
        title: 'Updated Title',
      });

      expect(updated.title).toBe('Updated Title');
    });

    it('should throw for non-existent document', async () => {
      await runtime.initialize();

      await expect(runtime.updateDocument('DOC-999' as EntityId, { title: 'Test' }))
        .rejects.toThrow('Document not found');
    });
  });

  describe('generateId', () => {
    it('should generate decision ID', async () => {
      await runtime.initialize();

      const id = await runtime.generateId('decision');
      expect(id).toBe('DEC-001');
    });

    it('should generate document ID', async () => {
      await runtime.initialize();

      const id = await runtime.generateId('document');
      expect(id).toBe('DOC-001');
    });
  });

  describe('hasOpenTodos', () => {
    it('should detect open TODOs in entity content fields', async () => {
      // hasOpenTodos checks getEntityContent() which returns field values
      // For tasks: [goal, description, technical_notes, notes]
      // So we need to put TODO in one of those fields
      const content = `---
id: T-001
title: Task with TODO
workstream: engineering
status: In Progress
parent: S-001
goal: Complete the feature - TODO add error handling
---
# Task`;
      await fs.writeFile(
        path.join(tempDir, config.entitiesFolder, 'tasks', 'T-001 Task.md'),
        content,
        'utf-8'
      );
      await runtime.initialize();

      const hasTodos = await runtime.hasOpenTodos('T-001' as EntityId);
      expect(hasTodos).toBe(true);
    });

    it('should return false when no TODOs', async () => {
      await createTaskFile('T-001', 'Task', 'S-001');
      await runtime.initialize();

      const hasTodos = await runtime.hasOpenTodos('T-001' as EntityId);
      expect(hasTodos).toBe(false);
    });
  });

  describe('getAcceptanceCriteria', () => {
    it('should return acceptance criteria for story', async () => {
      const content = `---
id: S-001
title: Story with AC
workstream: engineering
status: In Progress
parent: M-001
acceptance_criteria:
  - User can log in
  - User can log out
---
# Story`;
      await fs.writeFile(
        path.join(tempDir, config.entitiesFolder, 'stories', 'S-001 Story.md'),
        content,
        'utf-8'
      );
      await runtime.initialize();

      const criteria = await runtime.getAcceptanceCriteria('S-001' as EntityId);
      expect(criteria).toEqual(['User can log in', 'User can log out']);
    });

    it('should return empty array for non-story', async () => {
      await createMilestoneFile('M-001', 'Milestone');
      await runtime.initialize();

      const criteria = await runtime.getAcceptanceCriteria('M-001' as EntityId);
      expect(criteria).toEqual([]);
    });
  });

  describe('searchContent', () => {
    it('should find pattern in entity content', async () => {
      const content = `---
id: T-001
title: Task
workstream: engineering
status: In Progress
parent: S-001
goal: Implement authentication
---
# Task

## Description
This task involves implementing OAuth2 authentication.`;
      await fs.writeFile(
        path.join(tempDir, config.entitiesFolder, 'tasks', 'T-001 Task.md'),
        content,
        'utf-8'
      );
      await runtime.initialize();

      const found = await runtime.searchContent('T-001' as EntityId, 'oauth2');
      expect(found).toBe(true);
    });

    it('should return false when pattern not found', async () => {
      await createTaskFile('T-001', 'Task', 'S-001');
      await runtime.initialize();

      const found = await runtime.searchContent('T-001' as EntityId, 'nonexistent');
      expect(found).toBe(false);
    });
  });

  describe('getV2Runtime singleton', () => {
    it('should return same instance', async () => {
      const runtime1 = await getV2Runtime(config);
      const runtime2 = await getV2Runtime(config);

      expect(runtime1).toBe(runtime2);
    });

    it('should reset singleton', async () => {
      const runtime1 = await getV2Runtime(config);
      resetV2Runtime();
      const runtime2 = await getV2Runtime(config);

      expect(runtime1).not.toBe(runtime2);
    });
  });

  describe('dependency providers', () => {
    it('should provide entity management deps', async () => {
      await runtime.initialize();

      const deps = runtime.getEntityManagementDeps();
      expect(deps.getEntity).toBeDefined();
      expect(deps.getNextId).toBeDefined();
      expect(deps.writeEntity).toBeDefined();
    });

    it('should provide batch operations deps', async () => {
      await runtime.initialize();

      const deps = runtime.getBatchOperationsDeps();
      expect(deps.createEntity).toBeDefined();
      expect(deps.getEntity).toBeDefined();
    });

    it('should provide project understanding deps', async () => {
      await runtime.initialize();

      const deps = runtime.getProjectUnderstandingDeps();
      expect(deps.getAllEntities).toBeDefined();
      expect(deps.toEntitySummary).toBeDefined();
    });

    it('should provide search navigation deps', async () => {
      await runtime.initialize();

      const deps = runtime.getSearchNavigationDeps();
      expect(deps.searchEntities).toBeDefined();
      expect(deps.getEntity).toBeDefined();
    });

    it('should provide decision document deps', async () => {
      await runtime.initialize();

      const deps = runtime.getDecisionDocumentDeps();
      expect(deps.createDecision).toBeDefined();
      expect(deps.getAllDecisions).toBeDefined();
    });

    it('should provide implementation handoff deps', async () => {
      await runtime.initialize();

      const deps = runtime.getImplementationHandoffDeps();
      expect(deps.getAllStories).toBeDefined();
      expect(deps.getRelatedDecisions).toBeDefined();
    });

  });
});
