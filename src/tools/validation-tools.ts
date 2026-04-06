/**
 * Project Validation Tools
 *
 * Category 9: Project Validation
 * - validate_project: Validate entities against relationship rules
 */

import type {
  Entity,
  EntityId,
  EntityType,
} from '../models/v2-types.js';
import { getEntityTypeFromId } from '../models/v2-types.js';
import type {
  ValidateProjectInput,
  ValidateProjectOutput,
  ValidationViolation,
  ValidationSummary,
} from './tool-types.js';
import {
  VALIDATION_RULES,
  toValidationRule,
  type ValidationContext,
} from './validation-rules.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

export interface ValidationDependencies {
  getAllEntities: (options: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    workstream?: string;
  }) => Promise<Entity[]>;
  getEntity: (id: EntityId) => Promise<Entity | null>;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum violations to include in project overview */
export const MAX_VIOLATIONS_IN_OVERVIEW = 5;

// =============================================================================
// Main Validation Function
// =============================================================================

/**
 * Validate project entities against relationship rules.
 */
export async function validateProject(
  input: ValidateProjectInput,
  deps: ValidationDependencies
): Promise<ValidateProjectOutput> {
  const {
    rules: ruleFilter,
    workstream,
    entity_types,
    include_archived = false,
    severity_filter = 'all',
  } = input;

  // Get enabled rules, optionally filtered
  let rulesToCheck = VALIDATION_RULES.filter(r => r.enabled);

  if (ruleFilter && ruleFilter.length > 0) {
    rulesToCheck = rulesToCheck.filter(r => ruleFilter.includes(r.id));
  }

  if (entity_types && entity_types.length > 0) {
    rulesToCheck = rulesToCheck.filter(r => entity_types.includes(r.entity_type));
  }

  // Get entities to validate
  const entities = await deps.getAllEntities({
    includeCompleted: true,
    includeArchived: include_archived,
    workstream,
  });

  // Build validation context
  const context: ValidationContext = {
    getEntity: deps.getEntity,
    getEntityTypeFromId,
  };

  // Run validation
  const violations: ValidationViolation[] = [];
  let entitiesChecked = 0;

  for (const entity of entities) {
    const applicableRules = rulesToCheck.filter(r => r.entity_type === entity.type);
    if (applicableRules.length === 0) continue;

    entitiesChecked++;

    for (const rule of applicableRules) {
      const result = rule.validate(entity, context);

      if (!result.valid) {
        // Apply severity filter
        if (severity_filter !== 'all' && rule.severity !== severity_filter) {
          continue;
        }

        violations.push({
          rule_id: rule.id,
          rule_name: rule.name,
          severity: rule.severity,
          entity_id: entity.id,
          entity_type: entity.type,
          entity_title: entity.title,
          workstream: entity.workstream || 'unassigned',
          message: result.message || 'Validation failed',
          suggestion: result.suggestion || '',
        });
      }
    }
  }

  // Build summary statistics
  const violationsByRule: Record<string, number> = {};
  const violationsBySeverity = { error: 0, warning: 0 };

  for (const v of violations) {
    violationsByRule[v.rule_id] = (violationsByRule[v.rule_id] || 0) + 1;
    violationsBySeverity[v.severity]++;
  }

  const summary = violations.length === 0
    ? `✅ All ${entitiesChecked} entities passed validation`
    : `⚠️ Found ${violations.length} violation(s) across ${entitiesChecked} entities checked`;

  return {
    total_entities_checked: entitiesChecked,
    total_violations: violations.length,
    violations_by_severity: violationsBySeverity,
    violations_by_rule: violationsByRule,
    violations,
    rules_checked: rulesToCheck.map(toValidationRule),
    summary,
  };
}

// =============================================================================
// Helper for Project Overview Integration
// =============================================================================

/**
 * Run validation on a set of entities and return a summary suitable for project overview.
 * This is an optimized version that doesn't re-fetch entities.
 */
export async function runValidationForOverview(
  entities: Entity[],
  deps: Pick<ValidationDependencies, 'getEntity'>
): Promise<ValidationSummary | undefined> {
  const rulesToCheck = VALIDATION_RULES.filter(r => r.enabled);

  const context: ValidationContext = {
    getEntity: deps.getEntity,
    getEntityTypeFromId,
  };

  const violations: ValidationViolation[] = [];

  for (const entity of entities) {
    const applicableRules = rulesToCheck.filter(r => r.entity_type === entity.type);
    if (applicableRules.length === 0) continue;

    for (const rule of applicableRules) {
      const result = rule.validate(entity, context);

      if (!result.valid) {
        violations.push({
          rule_id: rule.id,
          rule_name: rule.name,
          severity: rule.severity,
          entity_id: entity.id,
          entity_type: entity.type,
          entity_title: entity.title,
          workstream: entity.workstream || 'unassigned',
          message: result.message || 'Validation failed',
          suggestion: result.suggestion || '',
        });
      }
    }
  }

  // Return undefined if no violations
  if (violations.length === 0) {
    return undefined;
  }

  // Build summary statistics
  const violationsByRule: Record<string, number> = {};
  const violationsBySeverity = { error: 0, warning: 0 };

  for (const v of violations) {
    violationsByRule[v.rule_id] = (violationsByRule[v.rule_id] || 0) + 1;
    violationsBySeverity[v.severity]++;
  }

  return {
    total_violations: violations.length,
    violations_by_severity: violationsBySeverity,
    violations_by_rule: violationsByRule,
    top_violations: violations.slice(0, MAX_VIOLATIONS_IN_OVERVIEW),
    has_more: violations.length > MAX_VIOLATIONS_IN_OVERVIEW,
  };
}

