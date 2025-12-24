/**
 * Tests for V2 Entity Serializer
 */

import { describe, it, expect } from 'vitest';
import { EntitySerializer, generateCssClasses } from './entity-serializer.js';
import type { Milestone, Story, Task, Decision, EntityId, MilestoneId, StoryId, TaskId, VaultPath, CanvasPath } from '../../models/v2-types.js';

describe('EntitySerializer', () => {
  const serializer = new EntitySerializer();

  const createMilestone = (): Milestone => ({
    id: 'M-001' as MilestoneId,
    type: 'milestone',
    title: 'Q1 Release',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: '/vault/milestones/M-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    target_date: '2024-03-31',
    owner: 'john',
    priority: 'High',
    depends_on: [],
  });

  const createStory = (): Story => ({
    id: 'S-001' as StoryId,
    type: 'story',
    title: 'User Authentication',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: '/vault/stories/S-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    effort: 'Engineering',
    priority: 'High',
    parent: 'M-001' as MilestoneId,
    depends_on: [],
    implements: [],
    tasks: [],
  });

  const createTask = (): Task => ({
    id: 'T-001' as TaskId,
    type: 'task',
    title: 'Implement login form',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-15',
    vault_path: '/vault/tasks/T-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    cssclasses: [],
    parent: 'S-001' as StoryId,
    goal: 'Create the login form UI',
    estimate_hrs: 4,
    actual_hrs: 2,
    assignee: 'jane',
  });

  describe('Basic Serialization', () => {
    it('should serialize a milestone with frontmatter', () => {
      const milestone = createMilestone();
      const result = serializer.serialize(milestone);

      expect(result).toContain('---');
      expect(result).toContain('id: M-001');
      expect(result).toContain('type: milestone');
      expect(result).toContain('title: Q1 Release');
      expect(result).toContain('status: In Progress');
      expect(result).toContain('target_date: 2024-03-31');
      expect(result).toContain('owner: john');
      expect(result).toContain('priority: High');
    });

    it('should serialize a story with frontmatter', () => {
      const story = createStory();
      const result = serializer.serialize(story);

      expect(result).toContain('id: S-001');
      expect(result).toContain('type: story');
      expect(result).toContain('effort: Engineering');
      expect(result).toContain('parent: M-001');
    });

    it('should serialize a task with frontmatter', () => {
      const task = createTask();
      const result = serializer.serialize(task);

      expect(result).toContain('id: T-001');
      expect(result).toContain('type: task');
      expect(result).toContain('parent: S-001');
      expect(result).toContain('goal: Create the login form UI');
      expect(result).toContain('estimate_hrs: 4');
      expect(result).toContain('actual_hrs: 2');
      expect(result).toContain('assignee: jane');
    });
  });

  describe('Serialization Options', () => {
    it('should exclude specified fields', () => {
      const milestone = createMilestone();
      const result = serializer.serialize(milestone, {
        excludeFields: ['vault_path', 'canvas_source'],
      });

      expect(result).not.toContain('vault_path');
      expect(result).not.toContain('canvas_source');
      expect(result).toContain('id: M-001');
    });

    it('should handle includeContent option', () => {
      const milestone = createMilestone();
      const resultWithContent = serializer.serialize(milestone, { includeContent: true });
      const resultWithoutContent = serializer.serialize(milestone, { includeContent: false });

      // Both should have frontmatter
      expect(resultWithContent).toContain('---');
      expect(resultWithoutContent).toContain('---');
    });
  });

  describe('Array Serialization', () => {
    it('should serialize arrays correctly', () => {
      const milestone = createMilestone();
      milestone.depends_on = ['M-002', 'M-003'] as MilestoneId[];
      const result = serializer.serialize(milestone);

      // Arrays are serialized in inline format [item1, item2]
      expect(result).toContain('depends_on:');
      expect(result).toContain('M-002');
      expect(result).toContain('M-003');
    });

    it('should handle empty arrays', () => {
      const milestone = createMilestone();
      milestone.depends_on = [];
      const result = serializer.serialize(milestone);

      // Empty arrays should either be omitted or serialized as []
      // Check that it doesn't cause errors
      expect(result).toContain('id: M-001');
    });
  });

  describe('Round-trip Compatibility', () => {
    it('should produce valid YAML frontmatter format', () => {
      const milestone = createMilestone();
      const result = serializer.serialize(milestone);

      // Should start and end with proper frontmatter delimiters
      expect(result.startsWith('---\n')).toBe(true);
      expect(result).toMatch(/---\n[\s\S]*---\n/);
    });
  });
});

describe('generateCssClasses', () => {
  it('should generate type class for milestone', () => {
    const milestone: Milestone = {
      id: 'M-001' as MilestoneId,
      type: 'milestone',
      title: 'Test Milestone',
      workstream: 'engineering',
      status: 'In Progress',
      archived: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-15',
      vault_path: '/vault/milestones/M-001.md' as VaultPath,
      canvas_source: '/vault/canvas.canvas' as CanvasPath,
      cssclasses: [],
      target_date: '2024-03-31',
      owner: 'john',
      priority: 'High',
      depends_on: [],
    };

    const classes = generateCssClasses(milestone);

    expect(classes).toContain('canvas-milestone');
    expect(classes).toContain('canvas-effort-engineering');
    expect(classes).toContain('canvas-status-in-progress');
    expect(classes).toContain('canvas-priority-high');
  });

  it('should generate effort class from story effort field', () => {
    const story: Story = {
      id: 'S-001' as StoryId,
      type: 'story',
      title: 'Test Story',
      workstream: 'engineering',
      status: 'Not Started',
      archived: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-15',
      vault_path: '/vault/stories/S-001.md' as VaultPath,
      canvas_source: '/vault/canvas.canvas' as CanvasPath,
      cssclasses: [],
      effort: 'Design',
      priority: 'Medium',
      parent: 'M-001' as MilestoneId,
      depends_on: [],
      implements: [],
      tasks: [],
    };

    const classes = generateCssClasses(story);

    expect(classes).toContain('canvas-story');
    expect(classes).toContain('canvas-effort-design');
    expect(classes).toContain('canvas-status-not-started');
    expect(classes).toContain('canvas-priority-medium');
  });

  it('should generate classes for task', () => {
    const task: Task = {
      id: 'T-001' as TaskId,
      type: 'task',
      title: 'Test Task',
      workstream: 'design',
      status: 'Not Started',
      archived: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-15',
      vault_path: '/vault/tasks/T-001.md' as VaultPath,
      canvas_source: '/vault/canvas.canvas' as CanvasPath,
      cssclasses: [],
      parent: 'S-001' as StoryId,
      goal: 'Test goal',
      estimate_hrs: 4,
      actual_hrs: 2,
      assignee: 'jane',
    };

    const classes = generateCssClasses(task);

    expect(classes).toContain('canvas-task');
    expect(classes).toContain('canvas-effort-design');
    expect(classes).toContain('canvas-status-not-started');
    // Tasks don't have priority
    expect(classes).not.toContain('canvas-priority');
  });

  it('should normalize status with spaces to hyphens', () => {
    const milestone: Milestone = {
      id: 'M-001' as MilestoneId,
      type: 'milestone',
      title: 'Test',
      workstream: 'engineering',
      status: 'In Progress',
      archived: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-15',
      vault_path: '/vault/milestones/M-001.md' as VaultPath,
      canvas_source: '/vault/canvas.canvas' as CanvasPath,
      cssclasses: [],
      target_date: '2024-03-31',
      owner: 'john',
      priority: 'High',
      depends_on: [],
    };

    const classes = generateCssClasses(milestone);

    expect(classes).toContain('canvas-status-in-progress');
    expect(classes).not.toContain('canvas-status-In Progress');
  });
});
