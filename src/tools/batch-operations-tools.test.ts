/**
 * Tests for Batch Operations Tools - ID Reservation Feature
 */

import { describe, it, expect, vi } from 'vitest';
import { batchUpdate, isValidIdForType, type BatchOperationsDependencies } from './batch-operations-tools.js';
import type { Entity, EntityId, EntityType } from '../models/v2-types.js';
import type { BatchUpdateInput, EntityFull } from './tool-types.js';

describe('isValidIdForType', () => {
  describe('Task IDs', () => {
    it('should return true for valid task ID format', () => {
      expect(isValidIdForType('T-001', 'task')).toBe(true);
      expect(isValidIdForType('T-691', 'task')).toBe(true);
      expect(isValidIdForType('T-1', 'task')).toBe(true);
    });

    it('should return false for task ID used with wrong entity type', () => {
      expect(isValidIdForType('T-001', 'story')).toBe(false);
      expect(isValidIdForType('T-001', 'milestone')).toBe(false);
    });

    it('should return false for invalid task ID formats', () => {
      expect(isValidIdForType('T-', 'task')).toBe(false);
      expect(isValidIdForType('T', 'task')).toBe(false);
      expect(isValidIdForType('T-abc', 'task')).toBe(false);
    });
  });

  describe('Other Entity Types', () => {
    it('should validate story IDs', () => {
      expect(isValidIdForType('S-001', 'story')).toBe(true);
      expect(isValidIdForType('S-001', 'task')).toBe(false);
    });

    it('should validate milestone IDs', () => {
      expect(isValidIdForType('M-001', 'milestone')).toBe(true);
      expect(isValidIdForType('M-001', 'task')).toBe(false);
    });

    it('should validate decision IDs', () => {
      expect(isValidIdForType('DEC-001', 'decision')).toBe(true);
      expect(isValidIdForType('DEC-001', 'task')).toBe(false);
    });

    it('should validate feature IDs', () => {
      expect(isValidIdForType('F-001', 'feature')).toBe(true);
      expect(isValidIdForType('F-001', 'task')).toBe(false);
    });

    it('should validate document IDs', () => {
      expect(isValidIdForType('DOC-001', 'document')).toBe(true);
      expect(isValidIdForType('DOC-001', 'task')).toBe(false);
    });
  });

  describe('Non-ID formats', () => {
    it('should return false for arbitrary strings', () => {
      expect(isValidIdForType('my-local-ref', 'task')).toBe(false);
      expect(isValidIdForType('new-task-1', 'task')).toBe(false);
      expect(isValidIdForType('', 'task')).toBe(false);
    });
  });
});

// Helper to create mock dependencies
function createMockDeps(
  existingIds: Set<EntityId> = new Set(),
  nextIdCounter: Record<EntityType, number> = { task: 1, story: 1, milestone: 1, decision: 1, feature: 1, document: 1 }
): BatchOperationsDependencies {
  const createdEntities = new Map<EntityId, Entity>();

  return {
    createEntity: vi.fn(async (type: EntityType, data: Record<string, unknown>, requestedId?: EntityId) => {
      let id: EntityId;
      let reservation: { id: EntityId; conflict: boolean; requestedId?: EntityId } | undefined;
      const prefix = type === 'task' ? 'T' : type === 'story' ? 'S' : type === 'milestone' ? 'M' :
        type === 'decision' ? 'DEC' : type === 'feature' ? 'F' : 'DOC';

      if (requestedId) {
        if (existingIds.has(requestedId) || createdEntities.has(requestedId)) {
          id = `${prefix}-${String(nextIdCounter[type]++).padStart(3, '0')}` as EntityId;
          reservation = { id, conflict: true, requestedId };
        } else {
          id = requestedId;
          reservation = { id, conflict: false };
        }
      } else {
        id = `${prefix}-${String(nextIdCounter[type]++).padStart(3, '0')}` as EntityId;
      }

      const entity: Entity = {
        id, type, title: data.title as string, workstream: data.workstream as string || 'engineering',
        status: 'Not Started', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
        archived: false, vault_path: `projects/${id}.md`,
      } as Entity;

      createdEntities.set(id, entity);
      existingIds.add(id);
      return { entity, reservation };
    }),
    getEntity: vi.fn(async (id: EntityId) => createdEntities.get(id) || null),
    entityExists: vi.fn((id: EntityId) => existingIds.has(id) || createdEntities.has(id)),
    getEntityType: vi.fn(() => null),
    updateEntityStatus: vi.fn(),
    writeEntity: vi.fn(),
    archiveEntity: vi.fn(),
    getChildren: vi.fn(async () => []),
    validateStatusTransition: vi.fn(() => ({ valid: true })),
    computeCascadeEffects: vi.fn(async () => []),
    getCurrentTimestamp: vi.fn(() => '2024-01-01T00:00:00Z'),
    toEntityFull: vi.fn(async (entity: Entity) => entity as unknown as EntityFull),
  };
}

describe('batchUpdate - ID Reservation', () => {
  describe('AC1: Successful ID Reservation', () => {
    it('should assign requested ID when slot is free', async () => {
      const deps = createMockDeps();
      const input: BatchUpdateInput = {
        ops: [{ client_id: 'T-691', op: 'create', type: 'task', payload: { title: 'Test Task', workstream: 'eng' } }],
      };
      const result = await batchUpdate(input, deps);
      expect(result.summary.succeeded).toBe(1);
      expect(result.results[0].id).toBe('T-691');
      expect(result.results[0].id_conflict).toBeUndefined();
    });

    it('should work for all entity types', async () => {
      const deps = createMockDeps();
      const input: BatchUpdateInput = {
        ops: [
          { client_id: 'T-100', op: 'create', type: 'task', payload: { title: 'Task', workstream: 'eng' } },
          { client_id: 'S-100', op: 'create', type: 'story', payload: { title: 'Story', workstream: 'eng' } },
          { client_id: 'M-100', op: 'create', type: 'milestone', payload: { title: 'Milestone', workstream: 'eng' } },
        ],
      };
      const result = await batchUpdate(input, deps);
      expect(result.results[0].id).toBe('T-100');
      expect(result.results[1].id).toBe('S-100');
      expect(result.results[2].id).toBe('M-100');
    });
  });



  describe('AC2: ID Conflict Handling', () => {
    it('should return id_conflict when requested ID already exists', async () => {
      const existingIds = new Set<EntityId>(['T-691' as EntityId]);
      const deps = createMockDeps(existingIds, { task: 692, story: 1, milestone: 1, decision: 1, feature: 1, document: 1 });
      const input: BatchUpdateInput = {
        ops: [{ client_id: 'T-691', op: 'create', type: 'task', payload: { title: 'Test Task', workstream: 'eng' } }],
      };
      const result = await batchUpdate(input, deps);
      expect(result.summary.succeeded).toBe(1);
      expect(result.results[0].id).not.toBe('T-691');
      expect(result.results[0].id_conflict).toBe(true);
      expect(result.results[0].requested_id).toBe('T-691');
    });
  });

  describe('AC3: Non-matching Format', () => {
    it('should use auto-assignment for non-ID format client_id', async () => {
      const deps = createMockDeps();
      const input: BatchUpdateInput = {
        ops: [{ client_id: 'my-local-ref', op: 'create', type: 'task', payload: { title: 'Test Task', workstream: 'eng' } }],
      };
      const result = await batchUpdate(input, deps);
      expect(result.results[0].id).toBe('T-001');
      expect(result.results[0].id_conflict).toBeUndefined();
    });
  });

  describe('AC4: Within-Batch Idempotency', () => {
    it('should return idempotent flag for duplicate client_id in same batch', async () => {
      const deps = createMockDeps();
      const input: BatchUpdateInput = {
        ops: [
          { client_id: 'T-691', op: 'create', type: 'task', payload: { title: 'Task 1', workstream: 'eng' } },
          { client_id: 'T-691', op: 'create', type: 'task', payload: { title: 'Task 2', workstream: 'eng' } },
        ],
      };
      const result = await batchUpdate(input, deps);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].id).toBe('T-691');
      expect(result.results[0].idempotent).toBeUndefined();
      expect(result.results[1].id).toBe('T-691');
      expect(result.results[1].idempotent).toBe(true);
    });

    it('should only create one entity for duplicate client_ids', async () => {
      const deps = createMockDeps();
      const input: BatchUpdateInput = {
        ops: [
          { client_id: 'my-ref', op: 'create', type: 'task', payload: { title: 'Task 1', workstream: 'eng' } },
          { client_id: 'my-ref', op: 'create', type: 'task', payload: { title: 'Task 2', workstream: 'eng' } },
        ],
      };
      const result = await batchUpdate(input, deps);
      expect(deps.createEntity).toHaveBeenCalledTimes(1);
      expect(result.results[1].idempotent).toBe(true);
    });
  });

  describe('AC6: Type Mismatch', () => {
    it('should use auto-assignment when client_id matches different entity type', async () => {
      const deps = createMockDeps();
      const input: BatchUpdateInput = {
        ops: [{ client_id: 'S-001', op: 'create', type: 'task', payload: { title: 'Test Task', workstream: 'eng' } }],
      };
      const result = await batchUpdate(input, deps);
      expect(result.results[0].id).toBe('T-001'); // Auto-assigned task ID, not S-001
      expect(result.results[0].id_conflict).toBeUndefined();
    });
  });
});
