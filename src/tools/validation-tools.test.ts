/**
 * Tests for validation tools and rules.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  validateProject,
  runValidationForOverview,
  type ValidationDependencies,
} from './validation-tools.js';
import { VALIDATION_RULES, getRuleById, getRulesForEntityType } from './validation-rules.js';
import type {
  Entity,
  Document,
  Decision,
  Feature,
  DocumentId,
  DecisionId,
  FeatureId,
  StoryId,
  EntityId,
  VaultPath,
  CanvasPath,
} from '../models/v2-types.js';

// =============================================================================
// Test Helpers
// =============================================================================

const createDocument = (overrides: Partial<Document> = {}): Document => ({
  id: 'DOC-001' as DocumentId,
  type: 'document',
  title: 'Test Document',
  workstream: 'engineering',
  status: 'Draft',
  doc_type: 'spec',
  archived: false,
  created_at: '2024-01-01',
  updated_at: '2024-01-15',
  vault_path: '/vault/documents/DOC-001.md' as VaultPath,
  canvas_source: '/vault/canvas.canvas' as CanvasPath,
  cssclasses: [],
  ...overrides,
});

const createDecision = (overrides: Partial<Decision> = {}): Decision => ({
  id: 'DEC-001' as DecisionId,
  type: 'decision',
  title: 'Test Decision',
  workstream: 'engineering',
  status: 'Decided',
  archived: false,
  created_at: '2024-01-01',
  updated_at: '2024-01-15',
  vault_path: '/vault/decisions/DEC-001.md' as VaultPath,
  canvas_source: '/vault/canvas.canvas' as CanvasPath,
  cssclasses: [],
  context: 'Test context',
  decision: 'Test decision',
  rationale: 'Test rationale',
  decided_by: 'test-user',
  decided_on: '2024-01-01',
  ...overrides,
});

const createFeature = (overrides: Partial<Feature> = {}): Feature => ({
  id: 'F-001' as FeatureId,
  type: 'feature',
  title: 'Test Feature',
  workstream: 'engineering',
  status: 'Planned',
  user_story: 'As a user, I want to test features, so that I can verify functionality',
  tier: 'OSS',
  phase: 'MVP',
  archived: false,
  created_at: '2024-01-01',
  updated_at: '2024-01-15',
  vault_path: '/vault/features/F-001.md' as VaultPath,
  canvas_source: '/vault/canvas.canvas' as CanvasPath,
  cssclasses: [],
  ...overrides,
});

// Mock dependencies
const createMockDeps = (entities: Entity[]): ValidationDependencies => ({
  getAllEntities: async () => entities,
  getEntity: async (id) => entities.find(e => e.id === id) || null,
});

// =============================================================================
// Tests
// =============================================================================

describe('Validation Rules', () => {
  test('DOC_REQUIRES_IMPLEMENTATION: fails for document without implemented_by', () => {
    const rule = getRuleById('DOC_REQUIRES_IMPLEMENTATION');
    expect(rule).toBeDefined();

    const doc = createDocument({ implemented_by: [] });
    const result = rule!.validate(doc, { getEntity: async () => null, getEntityTypeFromId: () => null });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('no implementing');
  });

  test('DOC_REQUIRES_IMPLEMENTATION: passes for document with implemented_by', () => {
    const rule = getRuleById('DOC_REQUIRES_IMPLEMENTATION');
    const doc = createDocument({ implemented_by: ['S-001' as StoryId] });
    const result = rule!.validate(doc, { getEntity: async () => null, getEntityTypeFromId: () => null });

    expect(result.valid).toBe(true);
  });

  test('DEC_REQUIRES_DOCUMENT: fails for decision without document in affects', () => {
    const rule = getRuleById('DEC_REQUIRES_DOCUMENT');
    expect(rule).toBeDefined();

    const decision = createDecision({ affects: ['S-001' as EntityId] });
    const result = rule!.validate(decision, {
      getEntity: async () => null,
      getEntityTypeFromId: (id) => id.startsWith('S-') ? 'story' : null,
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('does not affect any document');
  });

  test('DEC_REQUIRES_DOCUMENT: passes for decision with document in affects', () => {
    const rule = getRuleById('DEC_REQUIRES_DOCUMENT');
    const decision = createDecision({ affects: ['DOC-001' as EntityId] });
    const result = rule!.validate(decision, {
      getEntity: async () => null,
      getEntityTypeFromId: (id) => id.startsWith('DOC-') ? 'document' : null,
    });

    expect(result.valid).toBe(true);
  });

  test('FEATURE_REQUIRES_COVERAGE: fails for feature without coverage', () => {
    const rule = getRuleById('FEATURE_REQUIRES_COVERAGE');
    expect(rule).toBeDefined();

    const feature = createFeature({ implemented_by: [], documented_by: [] });
    const result = rule!.validate(feature, { getEntity: async () => null, getEntityTypeFromId: () => null });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('no implementation or documentation');
  });

  test('FEATURE_REQUIRES_COVERAGE: passes with implemented_by', () => {
    const rule = getRuleById('FEATURE_REQUIRES_COVERAGE');
    const feature = createFeature({ implemented_by: ['S-001' as StoryId] });
    const result = rule!.validate(feature, { getEntity: async () => null, getEntityTypeFromId: () => null });

    expect(result.valid).toBe(true);
  });

  test('FEATURE_REQUIRES_COVERAGE: passes with documented_by', () => {
    const rule = getRuleById('FEATURE_REQUIRES_COVERAGE');
    const feature = createFeature({ documented_by: ['DOC-001' as DocumentId] });
    const result = rule!.validate(feature, { getEntity: async () => null, getEntityTypeFromId: () => null });

    expect(result.valid).toBe(true);
  });

  test('getRulesForEntityType returns correct rules', () => {
    const docRules = getRulesForEntityType('document');
    expect(docRules.some(r => r.id === 'DOC_REQUIRES_IMPLEMENTATION')).toBe(true);

    const decRules = getRulesForEntityType('decision');
    expect(decRules.some(r => r.id === 'DEC_REQUIRES_DOCUMENT')).toBe(true);

    const featureRules = getRulesForEntityType('feature');
    expect(featureRules.some(r => r.id === 'FEATURE_REQUIRES_COVERAGE')).toBe(true);
  });
});

describe('validateProject', () => {
  test('returns no violations when all entities comply', async () => {
    const entities: Entity[] = [
      createDocument({ implemented_by: ['S-001' as StoryId] }),
      createFeature({ implemented_by: ['S-001' as StoryId] }),
    ];

    const result = await validateProject({}, createMockDeps(entities));

    expect(result.total_violations).toBe(0);
    expect(result.summary).toContain('passed');
  });

  test('returns violations for non-compliant entities', async () => {
    const entities: Entity[] = [
      createDocument({ implemented_by: [] }),
      createFeature({ implemented_by: [], documented_by: [] }),
    ];

    const result = await validateProject({}, createMockDeps(entities));

    expect(result.total_violations).toBe(2);
    expect(result.violations.some(v => v.rule_id === 'DOC_REQUIRES_IMPLEMENTATION')).toBe(true);
    expect(result.violations.some(v => v.rule_id === 'FEATURE_REQUIRES_COVERAGE')).toBe(true);
  });

  test('filters by entity_types', async () => {
    const entities: Entity[] = [
      createDocument({ implemented_by: [] }),
      createFeature({ implemented_by: [], documented_by: [] }),
    ];

    const result = await validateProject({ entity_types: ['document'] }, createMockDeps(entities));

    expect(result.total_violations).toBe(1);
    expect(result.violations[0].rule_id).toBe('DOC_REQUIRES_IMPLEMENTATION');
  });

  test('filters by workstream', async () => {
    const entities: Entity[] = [
      createDocument({ workstream: 'engineering', implemented_by: [] }),
      createDocument({ id: 'DOC-002' as DocumentId, workstream: 'product', implemented_by: [] }),
    ];

    const mockDeps: ValidationDependencies = {
      getAllEntities: async (options) => {
        if (options?.workstream) {
          return entities.filter(e => e.workstream === options.workstream);
        }
        return entities;
      },
      getEntity: async (id) => entities.find(e => e.id === id) || null,
    };

    const result = await validateProject({ workstream: 'engineering' }, mockDeps);

    expect(result.total_violations).toBe(1);
    expect(result.violations[0].workstream).toBe('engineering');
  });
});

describe('runValidationForOverview', () => {
  test('returns undefined when no violations', async () => {
    const entities: Entity[] = [
      createDocument({ implemented_by: ['S-001' as StoryId] }),
    ];

    const result = await runValidationForOverview(entities, { getEntity: async () => null });

    expect(result).toBeUndefined();
  });

  test('returns summary with top violations', async () => {
    const entities: Entity[] = [
      createDocument({ implemented_by: [] }),
      createFeature({ implemented_by: [], documented_by: [] }),
    ];

    const result = await runValidationForOverview(entities, { getEntity: async () => null });

    expect(result).toBeDefined();
    expect(result!.total_violations).toBe(2);
    expect(result!.top_violations.length).toBeLessThanOrEqual(5);
    expect(result!.has_more).toBe(false);
  });
});

