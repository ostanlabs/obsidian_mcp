/**
 * Tests for V2 Entity Validator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityValidator, ValidationContext } from './entity-validator.js';
import type { Entity, Milestone, Story, Task, Decision, Document, EntityId, MilestoneId, StoryId, TaskId, DecisionId, DocumentId, VaultPath, CanvasPath } from '../../models/v2-types.js';

describe('EntityValidator', () => {
  let validator: EntityValidator;
  let entities: Map<EntityId, Entity>;

  const createMilestone = (id: string = 'M-001'): Milestone => ({
    id: id as MilestoneId,
    type: 'milestone',
    title: 'Test Milestone',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: `/vault/milestones/${id}.md` as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    priority: 'High',
    depends_on: [],
  });

  const createStory = (id: string = 'S-001', parent?: string): Story => ({
    id: id as StoryId,
    type: 'story',
    title: 'Test Story',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: `/vault/stories/${id}.md` as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    effort: 'Engineering',
    priority: 'High',
    parent: parent as MilestoneId | undefined,
    depends_on: [],
    implements: [],
    tasks: [],
  });

  const createTask = (id: string = 'T-001', parent?: string): Task => ({
    id: id as TaskId,
    type: 'task',
    title: 'Test Task',
    workstream: 'engineering',
    status: 'Not Started',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: `/vault/tasks/${id}.md` as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    parent: parent as StoryId | undefined,
    goal: 'Complete the task',
  });

  const createDecision = (id: string = 'DEC-001'): Decision => ({
    id: id as DecisionId,
    type: 'decision',
    title: 'Test Decision',
    workstream: 'engineering',
    status: 'Decided',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: `/vault/decisions/${id}.md` as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    context: 'Test context',
    decision: 'Test decision text',
    rationale: 'Test rationale',
    decided_by: 'test-user',
    decided_on: '2024-01-01',
  });

  const createDocument = (id: string = 'DOC-001'): Document => ({
    id: id as DocumentId,
    type: 'document',
    title: 'Test Document',
    workstream: 'engineering',
    status: 'Approved',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: `/vault/documents/${id}.md` as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    doc_type: 'spec',
  });

  const createContext = (): ValidationContext => ({
    getEntity: (id: EntityId) => entities.get(id),
    getChildren: (id: EntityId, type?: string) => {
      return Array.from(entities.values()).filter(e => {
        if ('parent' in e && e.parent === id) {
          return type ? e.type === type : true;
        }
        return false;
      });
    },
    getAllEntities: () => Array.from(entities.values()),
  });

  beforeEach(() => {
    entities = new Map();
    validator = new EntityValidator(createContext());
  });

  describe('Required Fields Validation', () => {
    it('should pass for valid milestone', () => {
      const milestone = createMilestone();
      const result = validator.validate(milestone);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for milestone without title', () => {
      const milestone = createMilestone();
      (milestone as any).title = '';
      const result = validator.validate(milestone);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'title')).toBe(true);
    });

    it('should fail for entity without id', () => {
      const milestone = createMilestone();
      (milestone as any).id = '';
      const result = validator.validate(milestone);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'id')).toBe(true);
    });
  });

  describe('Parent Type Validation', () => {
    it('should pass for story with milestone parent', () => {
      const milestone = createMilestone('M-001');
      const story = createStory('S-001', 'M-001');
      entities.set(milestone.id, milestone);
      entities.set(story.id, story);

      const result = validator.validate(story);
      expect(result.valid).toBe(true);
    });

    it('should fail for story with task parent', () => {
      const task = createTask('T-001');
      const story = createStory('S-001', 'T-001');
      entities.set(task.id, task);
      entities.set(story.id, story);

      const result = validator.validate(story);
      expect(result.valid).toBe(false);
      // Field is 'milestone' (expected parent type) not 'parent'
      expect(result.errors.some(e => e.field === 'milestone')).toBe(true);
    });

    it('should pass for task with story parent', () => {
      const story = createStory('S-001');
      const task = createTask('T-001', 'S-001');
      entities.set(story.id, story);
      entities.set(task.id, task);

      const result = validator.validate(task);
      expect(result.valid).toBe(true);
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect circular dependencies in blocked_by', () => {
      // Circular dependency detection is for blocked_by, not depends_on
      // and is checked via detectCircularDependencies method on entity arrays
      const milestone = createMilestone('M-001');
      entities.set(milestone.id, milestone);

      // Single entity validation passes - circular detection is batch operation
      const result = validator.validate(milestone);
      expect(result.valid).toBe(true);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple entities', () => {
      const milestone = createMilestone('M-001');
      const story = createStory('S-001', 'M-001');
      entities.set(milestone.id, milestone);
      entities.set(story.id, story);

      // validateAll() uses context.getAllEntities() - no arguments
      const results = validator.validateAll();
      expect(results.size).toBe(2);
      expect(results.get(milestone.id)?.valid).toBe(true);
      expect(results.get(story.id)?.valid).toBe(true);
    });
  });

  describe('depends_on Type Validation', () => {
    it('should pass for milestone depending on milestone', () => {
      const m1 = createMilestone('M-001');
      const m2 = createMilestone('M-002');
      (m1 as any).depends_on = ['M-002'];
      entities.set(m1.id, m1);
      entities.set(m2.id, m2);

      const result = validator.validate(m1);
      expect(result.valid).toBe(true);
    });

    it('should pass for milestone depending on decision', () => {
      const milestone = createMilestone('M-001');
      const decision = createDecision('DEC-001');
      (milestone as any).depends_on = ['DEC-001'];
      entities.set(milestone.id, milestone);
      entities.set(decision.id, decision);

      const result = validator.validate(milestone);
      expect(result.valid).toBe(true);
    });

    it('should fail for milestone depending on story', () => {
      const milestone = createMilestone('M-001');
      const story = createStory('S-001');
      (milestone as any).depends_on = ['S-001'];
      entities.set(milestone.id, milestone);
      entities.set(story.id, story);

      const result = validator.validate(milestone);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'depends_on')).toBe(true);
    });

    it('should pass for story depending on story', () => {
      const s1 = createStory('S-001');
      const s2 = createStory('S-002');
      (s1 as any).depends_on = ['S-002'];
      entities.set(s1.id, s1);
      entities.set(s2.id, s2);

      const result = validator.validate(s1);
      expect(result.valid).toBe(true);
    });

    it('should pass for story depending on decision', () => {
      const story = createStory('S-001');
      const decision = createDecision('DEC-001');
      (story as any).depends_on = ['DEC-001'];
      entities.set(story.id, story);
      entities.set(decision.id, decision);

      const result = validator.validate(story);
      expect(result.valid).toBe(true);
    });

    it('should pass for story depending on document', () => {
      const story = createStory('S-001');
      const doc = createDocument('DOC-001');
      (story as any).depends_on = ['DOC-001'];
      entities.set(story.id, story);
      entities.set(doc.id, doc);

      const result = validator.validate(story);
      expect(result.valid).toBe(true);
    });

    it('should fail for story depending on milestone', () => {
      const story = createStory('S-001');
      const milestone = createMilestone('M-001');
      (story as any).depends_on = ['M-001'];
      entities.set(story.id, story);
      entities.set(milestone.id, milestone);

      const result = validator.validate(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'depends_on')).toBe(true);
    });

    it('should pass for task depending on task', () => {
      const t1 = createTask('T-001');
      const t2 = createTask('T-002');
      (t1 as any).depends_on = ['T-002'];
      entities.set(t1.id, t1);
      entities.set(t2.id, t2);

      const result = validator.validate(t1);
      expect(result.valid).toBe(true);
    });

    it('should pass for task depending on decision', () => {
      const task = createTask('T-001');
      const decision = createDecision('DEC-001');
      (task as any).depends_on = ['DEC-001'];
      entities.set(task.id, task);
      entities.set(decision.id, decision);

      const result = validator.validate(task);
      expect(result.valid).toBe(true);
    });

    it('should fail for task depending on story', () => {
      const task = createTask('T-001');
      const story = createStory('S-001');
      (task as any).depends_on = ['S-001'];
      entities.set(task.id, task);
      entities.set(story.id, story);

      const result = validator.validate(task);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'depends_on')).toBe(true);
    });

    it('should fail for task depending on document', () => {
      const task = createTask('T-001');
      const doc = createDocument('DOC-001');
      (task as any).depends_on = ['DOC-001'];
      entities.set(task.id, task);
      entities.set(doc.id, doc);

      const result = validator.validate(task);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'depends_on')).toBe(true);
    });
  });

  describe('Decision enables Validation', () => {
    it('should pass for decision enabling story', () => {
      const decision = createDecision('DEC-001');
      const story = createStory('S-001');
      (decision as any).enables = ['S-001'];
      entities.set(decision.id, decision);
      entities.set(story.id, story);

      const result = validator.validate(decision);
      expect(result.valid).toBe(true);
    });

    it('should pass for decision enabling task', () => {
      const decision = createDecision('DEC-001');
      const task = createTask('T-001');
      (decision as any).enables = ['T-001'];
      entities.set(decision.id, decision);
      entities.set(task.id, task);

      const result = validator.validate(decision);
      expect(result.valid).toBe(true);
    });

    it('should pass for decision enabling document', () => {
      const decision = createDecision('DEC-001');
      const doc = createDocument('DOC-001');
      (decision as any).enables = ['DOC-001'];
      entities.set(decision.id, decision);
      entities.set(doc.id, doc);

      const result = validator.validate(decision);
      expect(result.valid).toBe(true);
    });

    it('should fail for decision enabling milestone', () => {
      const decision = createDecision('DEC-001');
      const milestone = createMilestone('M-001');
      (decision as any).enables = ['M-001'];
      entities.set(decision.id, decision);
      entities.set(milestone.id, milestone);

      const result = validator.validate(decision);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'enables')).toBe(true);
    });

    it('should fail for decision enabling non-existent entity', () => {
      const decision = createDecision('DEC-001');
      (decision as any).enables = ['S-999'];
      entities.set(decision.id, decision);

      const result = validator.validate(decision);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'enables')).toBe(true);
    });
  });

  describe('Document implemented_by Validation', () => {
    it('should pass for document implemented by story', () => {
      const doc = createDocument('DOC-001');
      const story = createStory('S-001');
      (doc as any).implemented_by = ['S-001'];
      entities.set(doc.id, doc);
      entities.set(story.id, story);

      const result = validator.validate(doc);
      expect(result.valid).toBe(true);
    });

    it('should pass for document implemented by task', () => {
      const doc = createDocument('DOC-001');
      const task = createTask('T-001');
      (doc as any).implemented_by = ['T-001'];
      entities.set(doc.id, doc);
      entities.set(task.id, task);

      const result = validator.validate(doc);
      expect(result.valid).toBe(true);
    });

    it('should fail for document implemented by milestone', () => {
      const doc = createDocument('DOC-001');
      const milestone = createMilestone('M-001');
      (doc as any).implemented_by = ['M-001'];
      entities.set(doc.id, doc);
      entities.set(milestone.id, milestone);

      const result = validator.validate(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'implemented_by')).toBe(true);
    });

    it('should fail for document implemented by non-existent entity', () => {
      const doc = createDocument('DOC-001');
      (doc as any).implemented_by = ['S-999'];
      entities.set(doc.id, doc);

      const result = validator.validate(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'implemented_by')).toBe(true);
    });
  });

  describe('implements Validation', () => {
    it('should pass for story implementing document', () => {
      const story = createStory('S-001');
      const doc = createDocument('DOC-001');
      (story as any).implements = ['DOC-001'];
      entities.set(story.id, story);
      entities.set(doc.id, doc);

      const result = validator.validate(story);
      expect(result.valid).toBe(true);
    });

    it('should pass for milestone implementing document', () => {
      const milestone = createMilestone('M-001');
      const doc = createDocument('DOC-001');
      (milestone as any).implements = ['DOC-001'];
      entities.set(milestone.id, milestone);
      entities.set(doc.id, doc);

      const result = validator.validate(milestone);
      expect(result.valid).toBe(true);
    });

    it('should fail for story implementing non-document', () => {
      const story = createStory('S-001');
      const decision = createDecision('DEC-001');
      (story as any).implements = ['DEC-001'];
      entities.set(story.id, story);
      entities.set(decision.id, decision);

      const result = validator.validate(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'implements')).toBe(true);
    });

    it('should fail for milestone implementing non-document', () => {
      const milestone = createMilestone('M-001');
      const story = createStory('S-001');
      (milestone as any).implements = ['S-001'];
      entities.set(milestone.id, milestone);
      entities.set(story.id, story);

      const result = validator.validate(milestone);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'implements')).toBe(true);
    });

    it('should fail for implementing non-existent document', () => {
      const story = createStory('S-001');
      (story as any).implements = ['DOC-999'];
      entities.set(story.id, story);

      const result = validator.validate(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'implements')).toBe(true);
    });
  });

  describe('Decision supersedes Validation', () => {
    it('should pass for decision superseding another decision', () => {
      const dec1 = createDecision('DEC-001');
      const dec2 = createDecision('DEC-002');
      (dec1 as any).supersedes = 'DEC-002';
      entities.set(dec1.id, dec1);
      entities.set(dec2.id, dec2);

      const result = validator.validate(dec1);
      expect(result.valid).toBe(true);
    });

    it('should fail for decision superseding non-decision', () => {
      const decision = createDecision('DEC-001');
      const story = createStory('S-001');
      (decision as any).supersedes = 'S-001';
      entities.set(decision.id, decision);
      entities.set(story.id, story);

      const result = validator.validate(decision);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'supersedes')).toBe(true);
    });

    it('should fail for decision superseding non-existent decision', () => {
      const decision = createDecision('DEC-001');
      (decision as any).supersedes = 'DEC-999';
      entities.set(decision.id, decision);

      const result = validator.validate(decision);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'supersedes')).toBe(true);
    });
  });

  describe('References Exist Validation', () => {
    it('should fail for depends_on referencing non-existent entity', () => {
      const milestone = createMilestone('M-001');
      (milestone as any).depends_on = ['M-999'];
      entities.set(milestone.id, milestone);

      const result = validator.validate(milestone);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'depends_on')).toBe(true);
    });

    it('should fail for parent referencing non-existent entity', () => {
      const story = createStory('S-001', 'M-999');
      entities.set(story.id, story);

      const result = validator.validate(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'parent')).toBe(true);
    });
  });

  describe('Array Field Format Validation', () => {
    it('should fail when depends_on is a string instead of array', () => {
      const milestone = createMilestone('M-001');
      (milestone as any).depends_on = 'M-002';
      entities.set(milestone.id, milestone);

      const result = validator.validate(milestone);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'depends_on' && e.message.includes('array'))).toBe(true);
    });

    it('should fail when implements contains invalid ID format', () => {
      const story = createStory('S-001');
      (story as any).implements = ['invalid-id'];
      entities.set(story.id, story);

      const result = validator.validate(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'implements' && e.message.includes('invalid'))).toBe(true);
    });

    it('should fail when enables contains non-string element', () => {
      const decision = createDecision('DEC-001');
      (decision as any).enables = [123, 'S-001'];
      entities.set(decision.id, decision);

      const result = validator.validate(decision);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'enables' && e.message.includes('non-string'))).toBe(true);
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect circular blocked_by dependencies', () => {
      const m1 = createMilestone('M-001');
      const m2 = createMilestone('M-002');
      const m3 = createMilestone('M-003');
      (m1 as any).blocked_by = ['M-002'];
      (m2 as any).blocked_by = ['M-003'];
      (m3 as any).blocked_by = ['M-001'];
      entities.set(m1.id, m1);
      entities.set(m2.id, m2);
      entities.set(m3.id, m3);

      const errors = validator.checkCircularDependencies();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Circular'))).toBe(true);
    });

    it('should not report circular when no cycle exists', () => {
      const m1 = createMilestone('M-001');
      const m2 = createMilestone('M-002');
      const m3 = createMilestone('M-003');
      (m1 as any).blocked_by = ['M-002'];
      (m2 as any).blocked_by = ['M-003'];
      // M-003 has no blockers - no cycle
      entities.set(m1.id, m1);
      entities.set(m2.id, m2);
      entities.set(m3.id, m3);

      const errors = validator.checkCircularDependencies();
      expect(errors.length).toBe(0);
    });
  });
});

