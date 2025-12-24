/**
 * Tests for V2 Index Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectIndex } from './index-service.js';
import type { EntityMetadata, EntityId, VaultPath, CanvasPath } from '../../models/v2-types.js';

describe('ProjectIndex', () => {
  let index: ProjectIndex;

  const createMockMetadata = (overrides: Partial<EntityMetadata> = {}): EntityMetadata => ({
    id: 'M-001' as EntityId,
    type: 'milestone',
    title: 'Test Milestone',
    workstream: 'engineering',
    status: 'In Progress',
    archived: false,
    in_progress: true,
    parent_id: undefined,
    children_count: 0,
    vault_path: '/vault/accomplishments/milestones/M-001.md' as VaultPath,
    canvas_source: '/vault/canvas.canvas' as CanvasPath,
    updated_at: '2024-01-15T00:00:00Z',
    file_mtime: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    index = new ProjectIndex();
  });

  describe('Primary Index Operations', () => {
    it('should start empty', () => {
      expect(index.size).toBe(0);
      expect(index.getAllIds()).toEqual([]);
    });

    it('should add and retrieve metadata', () => {
      const metadata = createMockMetadata();
      index.set(metadata);

      expect(index.size).toBe(1);
      expect(index.has('M-001' as EntityId)).toBe(true);
      expect(index.get('M-001' as EntityId)).toEqual(metadata);
    });

    it('should update existing metadata', () => {
      const metadata1 = createMockMetadata({ title: 'Original' });
      const metadata2 = createMockMetadata({ title: 'Updated' });

      index.set(metadata1);
      index.set(metadata2);

      expect(index.size).toBe(1);
      expect(index.get('M-001' as EntityId)?.title).toBe('Updated');
    });

    it('should delete metadata', () => {
      const metadata = createMockMetadata();
      index.set(metadata);

      const deleted = index.delete('M-001' as EntityId);

      expect(deleted).toBe(true);
      expect(index.size).toBe(0);
      expect(index.has('M-001' as EntityId)).toBe(false);
    });

    it('should return false when deleting non-existent entity', () => {
      const deleted = index.delete('M-999' as EntityId);
      expect(deleted).toBe(false);
    });

    it('should clear all data', () => {
      index.set(createMockMetadata({ id: 'M-001' as EntityId }));
      index.set(createMockMetadata({ id: 'M-002' as EntityId }));

      index.clear();

      expect(index.size).toBe(0);
    });

    it('should increment version on changes', () => {
      const v0 = index.getVersion();
      index.set(createMockMetadata());
      const v1 = index.getVersion();
      index.delete('M-001' as EntityId);
      const v2 = index.getVersion();

      expect(v1).toBeGreaterThan(v0);
      expect(v2).toBeGreaterThan(v1);
    });
  });

  describe('Secondary Index Operations', () => {
    it('should index by type', () => {
      index.set(createMockMetadata({ id: 'M-001' as EntityId, type: 'milestone' }));
      index.set(createMockMetadata({ id: 'S-001' as EntityId, type: 'story' }));
      index.set(createMockMetadata({ id: 'M-002' as EntityId, type: 'milestone' }));

      const milestones = index.getByType('milestone');
      const stories = index.getByType('story');

      expect(milestones).toHaveLength(2);
      expect(stories).toHaveLength(1);
    });

    it('should index by status', () => {
      index.set(createMockMetadata({ id: 'M-001' as EntityId, status: 'In Progress' }));
      index.set(createMockMetadata({ id: 'M-002' as EntityId, status: 'Completed' }));

      const inProgress = index.getByStatus('In Progress');
      const completed = index.getByStatus('Completed');

      expect(inProgress).toHaveLength(1);
      expect(completed).toHaveLength(1);
    });

    it('should index by workstream', () => {
      index.set(createMockMetadata({ id: 'M-001' as EntityId, workstream: 'engineering' }));
      index.set(createMockMetadata({ id: 'M-002' as EntityId, workstream: 'product' }));

      const engineering = index.getByWorkstream('engineering');
      const product = index.getByWorkstream('product');

      expect(engineering).toHaveLength(1);
      expect(product).toHaveLength(1);
    });

    it('should track archived entities', () => {
      index.set(createMockMetadata({ id: 'M-001' as EntityId, archived: false }));
      index.set(createMockMetadata({ id: 'M-002' as EntityId, archived: true }));

      const archived = index.getArchived();

      expect(archived).toHaveLength(1);
      expect(archived[0].id).toBe('M-002');
    });

    it('should track in-progress entities', () => {
      index.set(createMockMetadata({ id: 'M-001' as EntityId, in_progress: true }));
      index.set(createMockMetadata({ id: 'M-002' as EntityId, in_progress: false }));

      const inProgress = index.getInProgress();

      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].id).toBe('M-001');
    });
  });
});

