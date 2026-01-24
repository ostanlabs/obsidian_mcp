/**
 * Tests for Transitive Dependency Remover Service
 *
 * Tests transitive removal algorithm as specified in MCP_PLUGIN_ALIGNMENT.md Section 9.
 */

import { describe, it, expect } from 'vitest';
import {
  TransitiveDependencyRemover,
  transitiveDependencyRemover,
} from './transitive-dependency-remover.js';
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

describe('TransitiveDependencyRemover', () => {
  describe('analyzeEntity', () => {
    it('should detect transitive dependency A→B→C when A also depends on C', () => {
      // A depends on B and C
      // B depends on C
      // Therefore A→C is transitive (reachable through B)
      const entityA = createStory('S-001', ['S-002', 'S-003']);

      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-003' as EntityId];
        return [];
      };

      const result = transitiveDependencyRemover.analyzeEntity(entityA, getDependencies);

      expect(result).not.toBeNull();
      expect(result!.removedDependencies).toContain('S-003');
      expect(result!.message).toContain('transitive');
    });

    it('should return null when no transitive dependencies exist', () => {
      // A depends on B and C
      // B and C are independent
      const entityA = createStory('S-001', ['S-002', 'S-003']);

      const getDependencies = (id: EntityId): EntityId[] => {
        return []; // No dependencies
      };

      const result = transitiveDependencyRemover.analyzeEntity(entityA, getDependencies);

      expect(result).toBeNull();
    });

    it('should return null when entity has fewer than 2 dependencies', () => {
      const entityA = createStory('S-001', ['S-002']);

      const getDependencies = (id: EntityId): EntityId[] => {
        return [];
      };

      const result = transitiveDependencyRemover.analyzeEntity(entityA, getDependencies);

      expect(result).toBeNull();
    });

    it('should handle multiple transitive dependencies', () => {
      // A depends on B, C, D
      // B depends on C and D
      // Therefore A→C and A→D are both transitive
      const entityA = createStory('S-001', ['S-002', 'S-003', 'S-004']);

      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-003' as EntityId, 'S-004' as EntityId];
        return [];
      };

      const result = transitiveDependencyRemover.analyzeEntity(entityA, getDependencies);

      expect(result).not.toBeNull();
      expect(result!.removedDependencies).toHaveLength(2);
      expect(result!.removedDependencies).toContain('S-003');
      expect(result!.removedDependencies).toContain('S-004');
    });

    it('should handle diamond dependency pattern', () => {
      // A depends on B, C, D
      // B depends on D
      // C depends on D
      // Therefore A→D is transitive (reachable through both B and C)
      const entityA = createStory('S-001', ['S-002', 'S-003', 'S-004']);

      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-004' as EntityId];
        if (id === 'S-003') return ['S-004' as EntityId];
        return [];
      };

      const result = transitiveDependencyRemover.analyzeEntity(entityA, getDependencies);

      expect(result).not.toBeNull();
      expect(result!.removedDependencies).toContain('S-004');
    });
  });

  describe('removeTransitiveDependencies', () => {
    it('should return modified entity with transitive dependencies removed', () => {
      const entityA = createStory('S-001', ['S-002', 'S-003']);

      const getDependencies = (id: EntityId): EntityId[] => {
        if (id === 'S-002') return ['S-003' as EntityId];
        return [];
      };

      const { entity, result } = transitiveDependencyRemover.removeTransitiveDependencies(
        entityA,
        getDependencies
      );

      expect(result).not.toBeNull();
      expect((entity as any).depends_on).toEqual(['S-002']);
      expect((entity as any).depends_on).not.toContain('S-003');
    });

    it('should not modify entity when no transitive dependencies exist', () => {
      const entityA = createStory('S-001', ['S-002', 'S-003']);

      const getDependencies = (id: EntityId): EntityId[] => {
        return [];
      };

      const { entity, result } = transitiveDependencyRemover.removeTransitiveDependencies(
        entityA,
        getDependencies
      );

      expect(result).toBeNull();
      expect((entity as any).depends_on).toEqual(['S-002', 'S-003']);
    });
  });
});

