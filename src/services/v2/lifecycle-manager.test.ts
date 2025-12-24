/**
 * Tests for V2 Lifecycle Manager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LifecycleManager } from './lifecycle-manager.js';
import type { Milestone, Story, Task, Decision, Document, EntityId, MilestoneId, StoryId, TaskId, VaultPath, CanvasPath } from '../../models/v2-types.js';

describe('LifecycleManager', () => {
  let manager: LifecycleManager;

  const createMilestone = (status: string = 'Not Started'): Milestone => ({
    id: 'M-001' as MilestoneId,
    type: 'milestone',
    title: 'Test Milestone',
    workstream: 'engineering',
    status: status as any,
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: '/vault/milestones/M-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    priority: 'High',
    depends_on: [],
  });

  const createStory = (status: string = 'Not Started'): Story => ({
    id: 'S-001' as StoryId,
    type: 'story',
    title: 'Test Story',
    workstream: 'engineering',
    status: status as any,
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: '/vault/stories/S-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    effort: 'Engineering',
    priority: 'High',
    depends_on: [],
    implements: [],
    tasks: [],
  });

  const createTask = (status: string = 'Not Started'): Task => ({
    id: 'T-001' as TaskId,
    type: 'task',
    title: 'Test Task',
    workstream: 'engineering',
    status: status as any,
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: '/vault/tasks/T-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    parent: 'S-001' as StoryId,
    goal: 'Complete the task',
  });

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  describe('Milestone Transitions', () => {
    it('should allow Not Started → In Progress', () => {
      const milestone = createMilestone('Not Started');
      const result = manager.canTransition(milestone, 'In Progress');
      expect(result.allowed).toBe(true);
    });

    it('should not allow Not Started → Completed directly', () => {
      const milestone = createMilestone('Not Started');
      const result = manager.canTransition(milestone, 'Completed');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid transition');
    });

    it('should allow In Progress → Completed when all stories complete', () => {
      const milestone = createMilestone('In Progress');
      // Set up callback to return no incomplete children
      manager.setChildrenCallback(() => []);
      const result = manager.canTransition(milestone, 'Completed');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Story Transitions', () => {
    it('should allow Not Started → In Progress', () => {
      const story = createStory('Not Started');
      const result = manager.canTransition(story, 'In Progress');
      expect(result.allowed).toBe(true);
    });

    it('should allow Completed → In Progress (reopen)', () => {
      const story = createStory('Completed');
      const result = manager.canTransition(story, 'In Progress');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Task Transitions', () => {
    it('should allow Not Started → In Progress', () => {
      const task = createTask('Not Started');
      const result = manager.canTransition(task, 'In Progress');
      expect(result.allowed).toBe(true);
    });

    it('should allow In Progress → Completed', () => {
      const task = createTask('In Progress');
      const result = manager.canTransition(task, 'Completed');
      expect(result.allowed).toBe(true);
    });

    it('should allow In Progress → Blocked', () => {
      const task = createTask('In Progress');
      const result = manager.canTransition(task, 'Blocked');
      expect(result.allowed).toBe(true);
    });

    it('should allow Completed → Not Started (reopen)', () => {
      const task = createTask('Completed');
      const result = manager.canTransition(task, 'Not Started');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Available Transitions', () => {
    it('should return available transitions for a milestone', () => {
      const milestone = createMilestone('Not Started');
      const available = manager.getAvailableTransitions(milestone);
      const statuses = available.map(t => t.to);
      expect(statuses).toContain('In Progress');
      // Blocked requires has_incomplete_blockers condition
    });

    it('should return available transitions for a task', () => {
      const task = createTask('Not Started');
      const available = manager.getAvailableTransitions(task);
      const statuses = available.map(t => t.to);
      expect(statuses).toContain('In Progress');
    });
  });

  describe('Transition Execution', () => {
    it('should execute a valid transition', async () => {
      const task = createTask('Not Started');
      const result = await manager.transition(task, 'In Progress');

      expect(result.old_status).toBe('Not Started');
      expect(result.new_status).toBe('In Progress');
      expect(task.status).toBe('In Progress');
    });

    it('should throw on invalid transition', async () => {
      const task = createTask('Not Started');
      await expect(manager.transition(task, 'Completed')).rejects.toThrow('Invalid transition');
    });
  });
});

