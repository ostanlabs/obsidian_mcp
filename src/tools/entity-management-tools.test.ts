/**
 * Tests for Entity Management Tools - validateRelationships function
 */

import { describe, it, expect } from 'vitest';
import { validateRelationships } from './entity-management-tools.js';
import type { EntityId, EntityType } from '../models/v2-types.js';

describe('validateRelationships', () => {
  // Mock dependencies
  const createMockDeps = (existingEntities: Map<EntityId, EntityType>) => ({
    entityExists: (id: EntityId) => existingEntities.has(id),
    getEntityType: (id: EntityId) => existingEntities.get(id) ?? null,
  });

  describe('Parent Validation', () => {
    it('should pass for story with existing milestone parent', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', { parent: 'M-001' }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should fail for story with non-existent parent', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('story', { parent: 'M-999' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('parent');
      expect(errors[0].message).toContain('does not exist');
    });

    it('should fail for story with task parent', () => {
      const entities = new Map<EntityId, EntityType>([
        ['T-001' as EntityId, 'task'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', { parent: 'T-001' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('parent');
      expect(errors[0].message).toContain('must be a milestone');
    });

    it('should pass for task with existing story parent', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('task', { parent: 'S-001' }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should fail for task with milestone parent', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('task', { parent: 'M-001' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('parent');
      expect(errors[0].message).toContain('must be a story');
    });
  });

  describe('depends_on Validation', () => {
    describe('Milestone depends_on', () => {
      it('should pass for milestone depending on milestone', () => {
        const entities = new Map<EntityId, EntityType>([
          ['M-002' as EntityId, 'milestone'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('milestone', { depends_on: ['M-002'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should pass for milestone depending on decision', () => {
        const entities = new Map<EntityId, EntityType>([
          ['DEC-001' as EntityId, 'decision'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('milestone', { depends_on: ['DEC-001'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should fail for milestone depending on story', () => {
        const entities = new Map<EntityId, EntityType>([
          ['S-001' as EntityId, 'story'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('milestone', { depends_on: ['S-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on story');
      });

      it('should fail for milestone depending on task', () => {
        const entities = new Map<EntityId, EntityType>([
          ['T-001' as EntityId, 'task'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('milestone', { depends_on: ['T-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on task');
      });

      it('should fail for milestone depending on document', () => {
        const entities = new Map<EntityId, EntityType>([
          ['DOC-001' as EntityId, 'document'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('milestone', { depends_on: ['DOC-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on document');
      });
    });

    describe('Story depends_on', () => {
      it('should pass for story depending on story', () => {
        const entities = new Map<EntityId, EntityType>([
          ['S-002' as EntityId, 'story'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('story', { depends_on: ['S-002'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should pass for story depending on decision', () => {
        const entities = new Map<EntityId, EntityType>([
          ['DEC-001' as EntityId, 'decision'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('story', { depends_on: ['DEC-001'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should pass for story depending on document', () => {
        const entities = new Map<EntityId, EntityType>([
          ['DOC-001' as EntityId, 'document'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('story', { depends_on: ['DOC-001'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should fail for story depending on milestone', () => {
        const entities = new Map<EntityId, EntityType>([
          ['M-001' as EntityId, 'milestone'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('story', { depends_on: ['M-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on milestone');
      });

      it('should fail for story depending on task', () => {
        const entities = new Map<EntityId, EntityType>([
          ['T-001' as EntityId, 'task'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('story', { depends_on: ['T-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on task');
      });
    });

    describe('Task depends_on', () => {
      it('should pass for task depending on task', () => {
        const entities = new Map<EntityId, EntityType>([
          ['T-002' as EntityId, 'task'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('task', { depends_on: ['T-002'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should pass for task depending on decision', () => {
        const entities = new Map<EntityId, EntityType>([
          ['DEC-001' as EntityId, 'decision'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('task', { depends_on: ['DEC-001'] }, deps);
        expect(errors).toHaveLength(0);
      });

      it('should fail for task depending on story', () => {
        const entities = new Map<EntityId, EntityType>([
          ['S-001' as EntityId, 'story'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('task', { depends_on: ['S-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on story');
      });

      it('should fail for task depending on milestone', () => {
        const entities = new Map<EntityId, EntityType>([
          ['M-001' as EntityId, 'milestone'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('task', { depends_on: ['M-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on milestone');
      });

      it('should fail for task depending on document', () => {
        const entities = new Map<EntityId, EntityType>([
          ['DOC-001' as EntityId, 'document'],
        ]);
        const deps = createMockDeps(entities);

        const errors = validateRelationships('task', { depends_on: ['DOC-001'] }, deps);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('depends_on');
        expect(errors[0].message).toContain('cannot depend on document');
      });
    });

    it('should fail for depends_on referencing non-existent entity', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('milestone', { depends_on: ['M-999'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('depends_on');
      expect(errors[0].message).toContain('does not exist');
    });

    it('should report multiple errors for multiple invalid dependencies', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('milestone', { depends_on: ['S-001', 'M-999'] }, deps);
      expect(errors).toHaveLength(2);
    });
  });

  describe('implements Validation', () => {
    it('should pass for story implementing document', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DOC-001' as EntityId, 'document'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', { implements: ['DOC-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should pass for milestone implementing document', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DOC-001' as EntityId, 'document'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('milestone', { implements: ['DOC-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should fail for story implementing decision', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DEC-001' as EntityId, 'decision'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', { implements: ['DEC-001'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('implements');
      expect(errors[0].message).toContain('only implement documents');
    });

    it('should fail for milestone implementing story', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('milestone', { implements: ['S-001'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('implements');
      expect(errors[0].message).toContain('only implement documents');
    });

    it('should fail for implementing non-existent document', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('story', { implements: ['DOC-999'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('implements');
      expect(errors[0].message).toContain('does not exist');
    });

    it('should pass for implementing multiple documents', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DOC-001' as EntityId, 'document'],
        ['DOC-002' as EntityId, 'document'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', { implements: ['DOC-001', 'DOC-002'] }, deps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Decision blocks Validation', () => {
    it('should pass for decision blocking story', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { blocks: ['S-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should pass for decision blocking task', () => {
      const entities = new Map<EntityId, EntityType>([
        ['T-001' as EntityId, 'task'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { blocks: ['T-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should pass for decision blocking document', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DOC-001' as EntityId, 'document'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { blocks: ['DOC-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should fail for decision blocking milestone', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { blocks: ['M-001'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('blocks');
      expect(errors[0].message).toContain('cannot block milestone');
    });

    it('should fail for decision blocking non-existent entity', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('decision', { blocks: ['S-999'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('blocks');
      expect(errors[0].message).toContain('does not exist');
    });

    it('should pass for decision blocking multiple valid entities', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
        ['T-001' as EntityId, 'task'],
        ['DOC-001' as EntityId, 'document'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { blocks: ['S-001', 'T-001', 'DOC-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should ignore blocks field for non-decision entities', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      // blocks field should be ignored for story type
      const errors = validateRelationships('story', { blocks: ['M-001'] }, deps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Document implemented_by Validation', () => {
    it('should pass for document implemented by story', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('document', { implemented_by: ['S-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should pass for document implemented by task', () => {
      const entities = new Map<EntityId, EntityType>([
        ['T-001' as EntityId, 'task'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('document', { implemented_by: ['T-001'] }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should fail for document implemented by milestone', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('document', { implemented_by: ['M-001'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('implemented_by');
      expect(errors[0].message).toContain('cannot be implemented by milestone');
    });

    it('should fail for document implemented by decision', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DEC-001' as EntityId, 'decision'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('document', { implemented_by: ['DEC-001'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('implemented_by');
      expect(errors[0].message).toContain('cannot be implemented by decision');
    });

    it('should fail for document implemented by non-existent entity', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('document', { implemented_by: ['S-999'] }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('implemented_by');
      expect(errors[0].message).toContain('does not exist');
    });

    it('should ignore implemented_by field for non-document entities', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      // implemented_by field should be ignored for story type
      const errors = validateRelationships('story', { implemented_by: ['M-001'] }, deps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Decision supersedes Validation', () => {
    it('should pass for decision superseding another decision', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DEC-002' as EntityId, 'decision'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { supersedes: 'DEC-002' }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should fail for decision superseding story', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { supersedes: 'S-001' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('supersedes');
      expect(errors[0].message).toContain('only supersede decisions');
    });

    it('should fail for decision superseding milestone', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { supersedes: 'M-001' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('supersedes');
      expect(errors[0].message).toContain('only supersede decisions');
    });

    it('should fail for decision superseding document', () => {
      const entities = new Map<EntityId, EntityType>([
        ['DOC-001' as EntityId, 'document'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('decision', { supersedes: 'DOC-001' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('supersedes');
      expect(errors[0].message).toContain('only supersede decisions');
    });

    it('should fail for decision superseding non-existent decision', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('decision', { supersedes: 'DEC-999' }, deps);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('supersedes');
      expect(errors[0].message).toContain('does not exist');
    });

    it('should ignore supersedes field for non-decision entities', () => {
      const entities = new Map<EntityId, EntityType>([
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      // supersedes field should be ignored for story type
      const errors = validateRelationships('story', { supersedes: 'S-001' }, deps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Batch ID Support', () => {
    it('should accept references to entities in the same batch', () => {
      const deps = createMockDeps(new Map());
      const batchIds = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);

      const errors = validateRelationships('story', { parent: 'M-001' }, deps, batchIds);
      expect(errors).toHaveLength(0);
    });

    it('should validate type constraints for batch entities', () => {
      const deps = createMockDeps(new Map());
      const batchIds = new Map<EntityId, EntityType>([
        ['T-001' as EntityId, 'task'],
      ]);

      // Story parent must be milestone, not task
      const errors = validateRelationships('story', { parent: 'T-001' }, deps, batchIds);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('parent');
    });

    it('should prefer cached entity type over batch type', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
      ]);
      const deps = createMockDeps(entities);
      const batchIds = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'task'], // Wrong type in batch
      ]);

      // Should use cached type (milestone), not batch type (task)
      const errors = validateRelationships('story', { parent: 'M-001' }, deps, batchIds);
      expect(errors).toHaveLength(0);
    });

    it('should validate depends_on with batch references', () => {
      const deps = createMockDeps(new Map());
      const batchIds = new Map<EntityId, EntityType>([
        ['DEC-001' as EntityId, 'decision'],
        ['M-002' as EntityId, 'milestone'],
      ]);

      const errors = validateRelationships('milestone', { depends_on: ['DEC-001', 'M-002'] }, deps, batchIds);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Combined Validations', () => {
    it('should validate all relationship fields together', () => {
      const entities = new Map<EntityId, EntityType>([
        ['M-001' as EntityId, 'milestone'],
        ['DOC-001' as EntityId, 'document'],
        ['DEC-001' as EntityId, 'decision'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', {
        parent: 'M-001',
        depends_on: ['DEC-001'],
        implements: ['DOC-001'],
      }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should report errors from multiple fields', () => {
      const entities = new Map<EntityId, EntityType>([
        ['T-001' as EntityId, 'task'],
        ['S-001' as EntityId, 'story'],
      ]);
      const deps = createMockDeps(entities);

      const errors = validateRelationships('story', {
        parent: 'T-001',        // Invalid: task instead of milestone
        depends_on: ['M-999'],  // Invalid: non-existent
        implements: ['S-001'],  // Invalid: story instead of document
      }, deps);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty arrays gracefully', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('story', {
        depends_on: [],
        implements: [],
      }, deps);
      expect(errors).toHaveLength(0);
    });

    it('should handle undefined fields gracefully', () => {
      const deps = createMockDeps(new Map());

      const errors = validateRelationships('story', {
        parent: undefined,
        depends_on: undefined,
        implements: undefined,
      }, deps);
      expect(errors).toHaveLength(0);
    });
  });
});

