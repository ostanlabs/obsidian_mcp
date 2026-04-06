/**
 * Validation Rules
 *
 * Defines validation rules for project entity relationships.
 * Rules are extensible - add new rules to VALIDATION_RULES array.
 */

import type {
  Entity,
  EntityId,
  EntityType,
  Document,
  Decision,
  Feature,
} from '../models/v2-types.js';
import type { ValidationRule, ValidationSeverity } from './tool-types.js';

// =============================================================================
// Rule Types
// =============================================================================

export interface ValidationContext {
  getEntity: (id: EntityId) => Promise<Entity | null>;
  getEntityTypeFromId: (id: EntityId) => EntityType | null;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  suggestion?: string;
}

export interface RuleDefinition extends ValidationRule {
  validate: (entity: Entity, context: ValidationContext) => ValidationResult;
}

// =============================================================================
// Rule Definitions
// =============================================================================

export const VALIDATION_RULES: RuleDefinition[] = [
  {
    id: 'DOC_REQUIRES_IMPLEMENTATION',
    name: 'Document requires implementation',
    description: 'Documents should be linked to at least one story or task via implemented_by',
    severity: 'warning',
    entity_type: 'document',
    enabled: true,
    validate: (entity: Entity, _ctx: ValidationContext): ValidationResult => {
      const doc = entity as Document;
      const hasImplementation = Boolean(doc.implemented_by && doc.implemented_by.length > 0);
      return {
        valid: hasImplementation,
        message: hasImplementation ? undefined : 'Document has no implementing stories or tasks',
        suggestion: 'Add stories or tasks to the implemented_by field',
      };
    },
  },
  {
    id: 'DEC_REQUIRES_DOCUMENT',
    name: 'Decision requires document',
    description: 'Decisions should affect at least one document',
    severity: 'warning',
    entity_type: 'decision',
    enabled: true,
    validate: (entity: Entity, ctx: ValidationContext): ValidationResult => {
      const decision = entity as Decision;
      // Decisions use 'affects' to link to documents, stories, tasks
      const affects = decision.affects || [];
      const hasDocument = affects.some((id: EntityId) => ctx.getEntityTypeFromId(id) === 'document');
      return {
        valid: hasDocument,
        message: hasDocument ? undefined : 'Decision does not affect any document',
        suggestion: 'Add a document ID to the affects field',
      };
    },
  },
  {
    id: 'FEATURE_REQUIRES_COVERAGE',
    name: 'Feature requires coverage',
    description: 'Features should be covered by milestone/story (implemented_by) or document (documented_by)',
    severity: 'warning',
    entity_type: 'feature',
    enabled: true,
    validate: (entity: Entity, _ctx: ValidationContext): ValidationResult => {
      const feature = entity as Feature;
      const hasImplementation = Boolean(feature.implemented_by && feature.implemented_by.length > 0);
      const hasDocumentation = Boolean(feature.documented_by && feature.documented_by.length > 0);
      const hasCoverage = hasImplementation || hasDocumentation;
      return {
        valid: hasCoverage,
        message: hasCoverage ? undefined : 'Feature has no implementation or documentation coverage',
        suggestion: 'Add milestone/story to implemented_by or document to documented_by',
      };
    },
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a rule by ID.
 */
export function getRuleById(id: string): RuleDefinition | undefined {
  return VALIDATION_RULES.find(r => r.id === id);
}

/**
 * Get all enabled rules.
 */
export function getEnabledRules(): RuleDefinition[] {
  return VALIDATION_RULES.filter(r => r.enabled);
}

/**
 * Get rules for a specific entity type.
 */
export function getRulesForEntityType(entityType: EntityType): RuleDefinition[] {
  return VALIDATION_RULES.filter(r => r.enabled && r.entity_type === entityType);
}

/**
 * Convert RuleDefinition to ValidationRule (strips the validate function).
 */
export function toValidationRule(rule: RuleDefinition): ValidationRule {
  const { validate: _validate, ...rest } = rule;
  return rest;
}

