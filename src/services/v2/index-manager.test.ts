/**
 * Tests for V2 Index Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexManager } from './index-manager.js';
import type {
  EntityId,
  MilestoneId,
  StoryId,
  TaskId,
  DecisionId,
  DocumentId,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  VaultPath,
  CanvasPath,
} from '../../models/v2-types.js';

describe('IndexManager', () => {
  let manager: IndexManager;

  // Helper to create mock entities - using 'as Milestone' to bypass strict type checking in tests
  const createMilestone = (overrides: Partial<Milestone> = {}): Milestone => ({
    id: 'M-001' as MilestoneId,
    type: 'milestone',
    title: 'Test Milestone',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    vault_path: '/vault/accomplishments/milestones/M-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    objective: 'Complete the project',
    priority: 'High',
    depends_on: [],
    cssclasses: [],
    ...overrides,
  } as Milestone);

  const createStory = (overrides: Partial<Story> = {}): Story => ({
    id: 'S-001' as StoryId,
    type: 'story',
    title: 'Test Story',
    workstream: 'engineering',
    status: 'Not Started',
    archived: false,
    vault_path: '/vault/accomplishments/stories/S-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    parent: 'M-001' as MilestoneId,
    outcome: 'User can login',
    effort: 'Engineering',
    priority: 'High',
    depends_on: [],
    cssclasses: [],
    ...overrides,
  } as Story);

  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'T-001' as TaskId,
    type: 'task',
    title: 'Test Task',
    workstream: 'engineering',
    status: 'Not Started',
    archived: false,
    vault_path: '/vault/accomplishments/tasks/T-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    parent: 'S-001' as StoryId,
    goal: 'Implement feature',
    cssclasses: [],
    ...overrides,
  } as Task);

  const createDecision = (overrides: Partial<Decision> = {}): Decision => ({
    id: 'DEC-001' as DecisionId,
    type: 'decision',
    title: 'Test Decision',
    workstream: 'engineering',
    status: 'Draft',
    archived: false,
    vault_path: '/vault/accomplishments/decisions/DEC-001.md' as VaultPath,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    context: 'We need to choose a database',
    decision: 'Use PostgreSQL',
    rationale: 'Better for our use case',
    cssclasses: [],
    ...overrides,
  } as Decision);

  const createDocument = (overrides: Partial<Document> = {}): Document => ({
    id: 'DOC-001' as DocumentId,
    type: 'document',
    title: 'Test Document',
    workstream: 'engineering',
    status: 'Draft',
    archived: false,
    vault_path: '/vault/accomplishments/documents/DOC-001.md' as VaultPath,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    content: 'This is the document content',
    doc_type: 'spec',
    cssclasses: [],
    ...overrides,
  } as Document);

  beforeEach(() => {
    manager = new IndexManager();
  });

  afterEach(() => {
    manager.stop();
  });

  describe('Constructor and Lifecycle', () => {
    it('should create with default options', () => {
      const stats = manager.getStats();
      expect(stats.entityCount).toBe(0);
    });

    it('should start auto-rebuild timer when configured', () => {
      vi.useFakeTimers();
      const autoManager = new IndexManager({ autoRebuildInterval: 1000 });

      // Index an entity
      autoManager.indexEntity(createMilestone(), Date.now());

      // Advance time - timer should fire without error
      vi.advanceTimersByTime(1000);

      autoManager.stop();
      vi.useRealTimers();
    });

    it('should stop auto-rebuild timer', () => {
      vi.useFakeTimers();
      const autoManager = new IndexManager({ autoRebuildInterval: 1000 });
      autoManager.stop();

      // Should not throw when advancing time after stop
      vi.advanceTimersByTime(2000);
      vi.useRealTimers();
    });
  });

  describe('indexEntity', () => {
    it('should index a milestone', () => {
      const milestone = createMilestone();
      manager.indexEntity(milestone, Date.now());

      expect(manager.hasEntity('M-001' as EntityId)).toBe(true);
      expect(manager.getMetadata('M-001' as EntityId)?.title).toBe(milestone.title);
    });

    it('should index a story with parent relationship', () => {
      const milestone = createMilestone();
      const story = createStory();

      manager.indexEntity(milestone, Date.now());
      manager.indexEntity(story, Date.now());

      expect(manager.hasEntity('S-001' as EntityId)).toBe(true);
      const children = manager.getChildren('M-001' as EntityId);
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe('S-001');
    });

    it('should index a task with parent relationship', () => {
      const story = createStory();
      const task = createTask();

      manager.indexEntity(story, Date.now());
      manager.indexEntity(task, Date.now());

      const children = manager.getChildren('S-001' as EntityId);
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe('T-001');
    });

    it('should index a decision', () => {
      const decision = createDecision();
      manager.indexEntity(decision, Date.now());

      expect(manager.hasEntity('DEC-001' as EntityId)).toBe(true);
      const metadata = manager.getMetadata('DEC-001' as EntityId);
      expect(metadata?.type).toBe('decision');
    });

    it('should index a document', () => {
      const document = createDocument();
      manager.indexEntity(document, Date.now());

      expect(manager.hasEntity('DOC-001' as EntityId)).toBe(true);
    });

    it('should index dependency relationships', () => {
      const story1 = createStory({ id: 'S-001' as StoryId });
      const story2 = createStory({
        id: 'S-002' as StoryId,
        depends_on: ['S-001' as StoryId]
      });

      manager.indexEntity(story1, Date.now());
      manager.indexEntity(story2, Date.now());

      const blocked = manager.getRelated('S-001' as StoryId, 'blocks');
      expect(blocked).toContain('S-002');
    });

    it('should index implements relationships', () => {
      const doc = createDocument({ id: 'DOC-001' as DocumentId });
      const story = createStory({
        id: 'S-001' as StoryId,
        implements: ['DOC-001' as DocumentId]
      });

      manager.indexEntity(doc, Date.now());
      manager.indexEntity(story, Date.now());

      const implementing = manager.getRelated('S-001' as StoryId, 'implements');
      expect(implementing).toContain('DOC-001');
    });

    it('should index supersedes relationships for decisions', () => {
      const oldDecision = createDecision({ id: 'DEC-001' as DecisionId });
      const newDecision = createDecision({
        id: 'DEC-002' as DecisionId,
        supersedes: 'DEC-001' as DecisionId
      });

      manager.indexEntity(oldDecision, Date.now());
      manager.indexEntity(newDecision, Date.now());

      const superseding = manager.getRelated('DEC-002' as DecisionId, 'supersedes');
      expect(superseding).toContain('DEC-001');
    });
  });

  describe('removeEntity', () => {
    it('should remove entity from all indexes', () => {
      const milestone = createMilestone();
      manager.indexEntity(milestone, Date.now());

      manager.removeEntity('M-001' as EntityId);

      expect(manager.hasEntity('M-001' as EntityId)).toBe(false);
      expect(manager.getMetadata('M-001' as EntityId)).toBeUndefined();
    });
  });

  describe('clearAll', () => {
    it('should clear all indexes', () => {
      manager.indexEntity(createMilestone(), Date.now());
      manager.indexEntity(createStory(), Date.now());

      manager.clearAll();

      expect(manager.getStats().entityCount).toBe(0);
    });
  });



  describe('query', () => {
    beforeEach(() => {
      // Set up test data
      manager.indexEntity(createMilestone({
        id: 'M-001' as MilestoneId,
        status: 'In Progress',
        workstream: 'engineering',
        priority: 'High'
      }), Date.now());
      manager.indexEntity(createMilestone({
        id: 'M-002' as MilestoneId,
        status: 'Completed',
        workstream: 'product',
        priority: 'Medium'
      }), Date.now());
      manager.indexEntity(createStory({
        id: 'S-001' as StoryId,
        status: 'Not Started',
        workstream: 'engineering',
        effort: 'Engineering',
        priority: 'High'
      }), Date.now());
      manager.indexEntity(createTask({
        id: 'T-001' as TaskId,
        status: 'In Progress',
        archived: true
      }), Date.now());
    });

    it('should query by type', () => {
      const results = manager.query({ types: ['milestone'] });
      expect(results).toHaveLength(2);
    });

    it('should query by status', () => {
      const results = manager.query({ statuses: ['In Progress'] });
      expect(results).toHaveLength(2);
    });

    it('should query by workstream', () => {
      const results = manager.query({ workstreams: ['engineering'] });
      // M-001, S-001, and T-001 all have workstream 'engineering'
      expect(results).toHaveLength(3);
    });

    it('should query by effort', () => {
      const results = manager.query({ efforts: ['Engineering'] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('S-001');
    });

    it('should query by priority', () => {
      const results = manager.query({ priorities: ['High'] });
      expect(results).toHaveLength(2);
    });

    it('should query by archived status', () => {
      const results = manager.query({ archived: true });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('T-001');
    });

    it('should query by in_progress status', () => {
      const results = manager.query({ inProgress: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should apply pagination with limit', () => {
      const results = manager.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should apply pagination with offset', () => {
      const allResults = manager.query({});
      const offsetResults = manager.query({ offset: 2 });
      expect(offsetResults).toHaveLength(allResults.length - 2);
    });

    it('should combine multiple filters', () => {
      const results = manager.query({
        types: ['milestone'],
        statuses: ['In Progress'],
        workstreams: ['engineering']
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('M-001');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      manager.indexEntity(createMilestone({
        id: 'M-001' as MilestoneId,
        title: 'Authentication System',
        objective: 'Implement secure login'
      }), Date.now());
      manager.indexEntity(createStory({
        id: 'S-001' as StoryId,
        title: 'User Login Feature',
        outcome: 'Users can authenticate'
      }), Date.now());
    });

    it('should search by title', () => {
      const results = manager.search('Authentication');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should search by content', () => {
      const results = manager.search('login');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for no matches', () => {
      const results = manager.search('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('getByPath', () => {
    it('should get entity by vault path', () => {
      const milestone = createMilestone();
      manager.indexEntity(milestone, Date.now());

      const result = manager.getByPath(milestone.vault_path);
      expect(result?.id).toBe('M-001');
    });

    it('should return undefined for unknown path', () => {
      const result = manager.getByPath('/unknown/path.md' as VaultPath);
      expect(result).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      manager.indexEntity(createMilestone(), Date.now());
      manager.indexEntity(createStory(), Date.now());

      const stats = manager.getStats();

      expect(stats.entityCount).toBe(2);
      expect(stats.searchStats).toBeDefined();
      expect(stats.indexVersion).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metadata Creation', () => {
    it('should create metadata with priority for milestones', () => {
      const milestone = createMilestone({ priority: 'High' });
      manager.indexEntity(milestone, Date.now());

      const metadata = manager.getMetadata('M-001' as MilestoneId);
      expect(metadata?.priority).toBe('High');
    });

    it('should create metadata with effort for stories', () => {
      const story = createStory({ effort: 'Engineering' });
      manager.indexEntity(story, Date.now());

      const metadata = manager.getMetadata('S-001' as StoryId);
      expect(metadata?.effort).toBe('Engineering');
    });

    it('should track in_progress status correctly', () => {
      manager.indexEntity(createMilestone({ status: 'In Progress' }), Date.now());
      manager.indexEntity(createMilestone({
        id: 'M-002' as MilestoneId,
        status: 'Completed'
      }), Date.now());

      const m1 = manager.getMetadata('M-001' as MilestoneId);
      const m2 = manager.getMetadata('M-002' as MilestoneId);

      expect(m1?.in_progress).toBe(true);
      expect(m2?.in_progress).toBe(false);
    });
  });

  describe('Query by canvas path', () => {
    it('should query by canvas source', () => {
      const canvas1 = '/vault/canvas1.canvas' as CanvasPath;
      const canvas2 = '/vault/canvas2.canvas' as CanvasPath;

      manager.indexEntity(createMilestone({
        id: 'M-001' as MilestoneId,
        canvas_source: canvas1
      }), Date.now());
      manager.indexEntity(createMilestone({
        id: 'M-002' as MilestoneId,
        canvas_source: canvas2
      }), Date.now());

      const results = manager.query({ canvasPath: canvas1 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('M-001');
    });
  });

  describe('Query by parent', () => {
    it('should query by parent ID', () => {
      manager.indexEntity(createMilestone({ id: 'M-001' as MilestoneId }), Date.now());
      manager.indexEntity(createStory({
        id: 'S-001' as StoryId,
        parent: 'M-001' as MilestoneId
      }), Date.now());
      manager.indexEntity(createStory({
        id: 'S-002' as StoryId,
        parent: 'M-001' as MilestoneId
      }), Date.now());

      const results = manager.query({ parentId: 'M-001' as MilestoneId });
      expect(results).toHaveLength(2);
    });
  });
});

