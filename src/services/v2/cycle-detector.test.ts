/**
 * Tests for Cycle Detector Service
 *
 * Tests cycle detection algorithm as specified in MCP_PLUGIN_ALIGNMENT.md Section 9.
 */

import { describe, it, expect } from 'vitest';
import { cycleDetector } from './cycle-detector.js';
import { Entity, EntityId, StoryId } from '../../models/v2-types.js';

// Helper to create a minimal story entity for testing
function createStory(id: string, dependsOn: string[] = []): Entity {
  return {
    id: id as StoryId,
    type: 'story',
    title: `Story ${id}`,
    workstream: 'default',
    status: 'Not Started',
    priority: 'Medium',
    depends_on: dependsOn as EntityId[],
    archived: false,
    canvas_source: '',
    vault_path: '',
    cssclasses: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Entity;
}

describe('CycleDetector', () => {
  describe('wouldCreateCycle', () => {
    it('should detect cycle when adding A→B would create A→B→A', () => {
      // B already depends on A
      // Adding A→B would create a cycle
      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-001' as EntityId];
        return [];
      };

      const result = cycleDetector.wouldCreateCycle(
        'S-001' as EntityId,
        'S-002' as EntityId,
        getDependencies
      );

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toBeDefined();
      expect(result.cyclePath).toContain('S-001');
      expect(result.cyclePath).toContain('S-002');
      expect(result.message).toContain('cycle');
    });

    it('should not detect cycle when no cycle would be created', () => {
      // A→B, B→C (no cycle)
      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-003' as EntityId];
        return [];
      };

      const result = cycleDetector.wouldCreateCycle(
        'S-001' as EntityId,
        'S-002' as EntityId,
        getDependencies
      );

      expect(result.hasCycle).toBe(false);
      expect(result.cyclePath).toBeUndefined();
    });

    it('should detect longer cycles A→B→C→A', () => {
      // B→C, C→A
      // Adding A→B would create A→B→C→A
      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-003' as EntityId];
        if (id === 'S-003') return ['S-001' as EntityId];
        return [];
      };

      const result = cycleDetector.wouldCreateCycle(
        'S-001' as EntityId,
        'S-002' as EntityId,
        getDependencies
      );

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath!.length).toBeGreaterThan(2);
    });

    it('should provide suggestions for breaking the cycle', () => {
      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-001' as EntityId];
        return [];
      };

      const result = cycleDetector.wouldCreateCycle(
        'S-001' as EntityId,
        'S-002' as EntityId,
        getDependencies
      );

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
      expect(result.suggestions![0].removeEdge).toBeDefined();
    });
  });

  describe('detectCycles', () => {
    it('should detect cycle in entity graph', () => {
      const entities = [
        createStory('S-001', ['S-002']),
        createStory('S-002', ['S-003']),
        createStory('S-003', ['S-001']), // Creates cycle
      ];

      const getDependencies = (id: EntityId): EntityId[] => {
        const entity = entities.find((e) => e.id === id);
        return (entity as any)?.depends_on || [];
      };

      const result = cycleDetector.detectCycles(entities, getDependencies);

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toBeDefined();
    });

    it('should not detect cycle in DAG (directed acyclic graph)', () => {
      const entities = [
        createStory('S-001', ['S-002', 'S-003']),
        createStory('S-002', ['S-004']),
        createStory('S-003', ['S-004']),
        createStory('S-004', []),
      ];

      const getDependencies = (id: EntityId): EntityId[] => {
        const entity = entities.find((e) => e.id === id);
        return (entity as any)?.depends_on || [];
      };

      const result = cycleDetector.detectCycles(entities, getDependencies);

      expect(result.hasCycle).toBe(false);
    });

    it('should handle empty entity list', () => {
      const result = cycleDetector.detectCycles([], () => []);

      expect(result.hasCycle).toBe(false);
    });

    it('should handle entities with no dependencies', () => {
      const entities = [
        createStory('S-001', []),
        createStory('S-002', []),
        createStory('S-003', []),
      ];

      const getDependencies = (_id: EntityId): EntityId[] => [];

      const result = cycleDetector.detectCycles(entities, getDependencies);

      expect(result.hasCycle).toBe(false);
    });
  });
});

