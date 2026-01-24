/**
 * V2 Entity Validator
 *
 * Validates entities against rules including required fields,
 * parent type constraints, and circular dependency detection.
 */

import {
  Entity,
  EntityId,
  EntityType,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
} from '../../models/v2-types.js';

// =============================================================================
// Validation Types
// =============================================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ValidationRule {
  name: string;
  validate: (entity: Entity, context: ValidationContext) => ValidationError[];
}

export interface ValidationContext {
  getEntity: (id: EntityId) => Entity | undefined;
  getChildren: (id: EntityId, type?: EntityType) => Entity[];
  getAllEntities: () => Entity[];
}

// =============================================================================
// Required Fields by Entity Type
// =============================================================================

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  milestone: ['id', 'title', 'status', 'type'],
  story: ['id', 'title', 'status', 'type'],
  task: ['id', 'title', 'status', 'type'],
  decision: ['id', 'title', 'status', 'type'],
  document: ['id', 'title', 'status', 'type'],
  feature: ['id', 'title', 'status', 'type', 'user_story'],
};

// =============================================================================
// Parent Type Constraints
// =============================================================================

const VALID_PARENT_TYPES: Record<EntityType, EntityType | null> = {
  milestone: null,
  story: 'milestone',
  task: 'story',
  decision: null,
  document: null,
  feature: null,
};

// =============================================================================
// Relationship Constraints
// =============================================================================

/**
 * Valid target types for Decision.affects field.
 * Decisions can affect: documents, stories, tasks (NOT milestones)
 */
const DECISION_AFFECTS_VALID_TYPES: EntityType[] = ['document', 'story', 'task'];

/**
 * Valid target types for Document.implemented_by field.
 * Documents can be implemented by: stories, tasks (NOT milestones)
 */
const DOCUMENT_IMPLEMENTED_BY_VALID_TYPES: EntityType[] = ['story', 'task'];

/**
 * Valid target types for Story.implements and Task.implements fields.
 * Stories/Tasks can implement: documents only
 */
const IMPLEMENTS_VALID_TYPES: EntityType[] = ['document'];

/**
 * Valid target types for depends_on fields by entity type.
 */
const DEPENDS_ON_VALID_TYPES: Record<EntityType, EntityType[]> = {
  milestone: ['milestone', 'decision'],
  story: ['story', 'decision', 'document'],
  task: ['task', 'decision'],
  decision: ['decision'],
  document: ['document', 'decision'],
  feature: ['feature', 'decision'],
};

// =============================================================================
// Entity Validator Class
// =============================================================================

/**
 * Validates entities against defined rules.
 */
export class EntityValidator {
  private rules: ValidationRule[] = [];
  private context: ValidationContext;

  constructor(context: ValidationContext) {
    this.context = context;
    this.initializeRules();
  }

  // ---------------------------------------------------------------------------
  // Validation Methods
  // ---------------------------------------------------------------------------

  /** Validate a single entity */
  validate(entity: Entity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (const rule of this.rules) {
      const ruleErrors = rule.validate(entity, this.context);
      for (const error of ruleErrors) {
        if (error.severity === 'error') {
          errors.push(error);
        } else {
          warnings.push(error);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /** Validate all entities */
  validateAll(): Map<EntityId, ValidationResult> {
    const results = new Map<EntityId, ValidationResult>();
    const entities = this.context.getAllEntities();

    for (const entity of entities) {
      results.set(entity.id, this.validate(entity));
    }

    return results;
  }

  /** Check for circular dependencies across all entities */
  checkCircularDependencies(): ValidationError[] {
    const errors: ValidationError[] = [];
    const entities = this.context.getAllEntities();

    for (const entity of entities) {
      if ('blocked_by' in entity && Array.isArray((entity as any).blocked_by)) {
        const blockers = (entity as any).blocked_by as EntityId[];
        const visited = new Set<EntityId>();
        const path: EntityId[] = [];

        if (this.hasCircularDependency(entity.id, blockers, visited, path)) {
          errors.push({
            field: 'blocked_by',
            message: `Circular dependency detected: ${path.join(' → ')} → ${entity.id}`,
            severity: 'error',
          });
        }
      }
    }

    return errors;
  }

  // ---------------------------------------------------------------------------
  // Rule Initialization
  // ---------------------------------------------------------------------------

  private initializeRules(): void {
    // Required fields rule
    this.rules.push({
      name: 'required_fields',
      validate: (entity) => this.validateRequiredFields(entity),
    });

    // Parent type rule
    this.rules.push({
      name: 'parent_type',
      validate: (entity) => this.validateParentType(entity),
    });

    // ID format rule
    this.rules.push({
      name: 'id_format',
      validate: (entity) => this.validateIdFormat(entity),
    });

    // Status validity rule
    this.rules.push({
      name: 'status_validity',
      validate: (entity) => this.validateStatus(entity),
    });

    // Parent exists rule
    this.rules.push({
      name: 'parent_exists',
      validate: (entity) => this.validateParentExists(entity),
    });

    // Blocker exists rule
    this.rules.push({
      name: 'blocker_exists',
      validate: (entity) => this.validateBlockersExist(entity),
    });

    // Decision affects relationship rule
    this.rules.push({
      name: 'decision_affects_types',
      validate: (entity) => this.validateDecisionAffects(entity),
    });

    // Document implemented_by relationship rule
    this.rules.push({
      name: 'document_implemented_by_types',
      validate: (entity) => this.validateDocumentImplementedBy(entity),
    });

    // Implements relationship rule
    this.rules.push({
      name: 'implements_types',
      validate: (entity) => this.validateImplements(entity),
    });

    // Depends_on relationship rule
    this.rules.push({
      name: 'depends_on_types',
      validate: (entity) => this.validateDependsOn(entity),
    });

    // Referenced entities exist rule
    this.rules.push({
      name: 'references_exist',
      validate: (entity) => this.validateReferencesExist(entity),
    });

    // Array field format rule
    this.rules.push({
      name: 'array_field_format',
      validate: (entity) => this.validateArrayFieldFormat(entity),
    });
  }

  // ---------------------------------------------------------------------------
  // Individual Validation Rules
  // ---------------------------------------------------------------------------

  private validateRequiredFields(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];
    const required = REQUIRED_FIELDS[entity.type];

    for (const field of required) {
      const value = (entity as any)[field];
      if (value === undefined || value === null || value === '') {
        errors.push({
          field,
          message: `Required field '${field}' is missing`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  private validateParentType(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];
    const expectedParentType = VALID_PARENT_TYPES[entity.type];

    if (expectedParentType === null) {
      // No parent expected
      return errors;
    }

    // Get parent ID based on entity type
    let parentId: EntityId | undefined;
    if (entity.type === 'story') {
      parentId = (entity as Story).parent;
    } else if (entity.type === 'task') {
      parentId = (entity as Task).parent;
    }

    if (parentId) {
      const parent = this.context.getEntity(parentId);
      if (parent && parent.type !== expectedParentType) {
        errors.push({
          field: expectedParentType,
          message: `Invalid parent type: expected '${expectedParentType}', got '${parent.type}'`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  private validateIdFormat(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefixes: Record<EntityType, string> = {
      milestone: 'M-',
      story: 'S-',
      task: 'T-',
      decision: 'DEC-',
      document: 'DOC-',
      feature: 'F-',
    };

    const expectedPrefix = prefixes[entity.type];
    if (!entity.id.startsWith(expectedPrefix)) {
      errors.push({
        field: 'id',
        message: `Invalid ID format: expected prefix '${expectedPrefix}', got '${entity.id}'`,
        severity: 'error',
      });
    }

    return errors;
  }

  private validateStatus(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];
    const validStatuses: Record<EntityType, string[]> = {
      milestone: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
      story: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
      task: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
      decision: ['Pending', 'Decided', 'Superseded'],
      document: ['Draft', 'Review', 'Approved', 'Superseded'],
      feature: ['Planned', 'In Progress', 'Complete', 'Deferred'],
    };

    const valid = validStatuses[entity.type];
    if (!valid.includes(entity.status)) {
      errors.push({
        field: 'status',
        message: `Invalid status '${entity.status}' for ${entity.type}`,
        severity: 'error',
      });
    }

    return errors;
  }

  private validateParentExists(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    if (entity.type === 'story') {
      const story = entity as Story;
      if (story.parent) {
        const parent = this.context.getEntity(story.parent);
        if (!parent) {
          errors.push({
            field: 'parent',
            message: `Parent milestone '${story.parent}' not found`,
            severity: 'error',
          });
        }
      }
    } else if (entity.type === 'task') {
      const task = entity as Task;
      if (task.parent) {
        const parent = this.context.getEntity(task.parent);
        if (!parent) {
          errors.push({
            field: 'parent',
            message: `Parent story '${task.parent}' not found`,
            severity: 'error',
          });
        }
      }
    }

    return errors;
  }

  private validateBlockersExist(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    if ('blocked_by' in entity && Array.isArray((entity as any).blocked_by)) {
      const blockers = (entity as any).blocked_by as EntityId[];
      for (const blockerId of blockers) {
        const blocker = this.context.getEntity(blockerId);
        if (!blocker) {
          errors.push({
            field: 'blocked_by',
            message: `Blocker '${blockerId}' not found`,
            severity: 'warning',
          });
        }
      }
    }

    return errors;
  }

  /** Validate Decision.affects targets only valid entity types */
  private validateDecisionAffects(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    if (entity.type !== 'decision') {
      return errors;
    }

    const decision = entity as Decision;
    if (!decision.affects || decision.affects.length === 0) {
      return errors;
    }

    for (const affectedId of decision.affects) {
      const affected = this.context.getEntity(affectedId);
      if (affected && !DECISION_AFFECTS_VALID_TYPES.includes(affected.type)) {
        errors.push({
          field: 'affects',
          message: `Decision cannot affect ${affected.type} '${affectedId}'. Valid types: ${DECISION_AFFECTS_VALID_TYPES.join(', ')}`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /** Validate Document.implemented_by targets only valid entity types */
  private validateDocumentImplementedBy(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    if (entity.type !== 'document') {
      return errors;
    }

    const doc = entity as Document;
    if (!doc.implemented_by || doc.implemented_by.length === 0) {
      return errors;
    }

    for (const implementerId of doc.implemented_by) {
      const implementer = this.context.getEntity(implementerId);
      if (implementer && !DOCUMENT_IMPLEMENTED_BY_VALID_TYPES.includes(implementer.type)) {
        errors.push({
          field: 'implemented_by',
          message: `Document cannot be implemented by ${implementer.type} '${implementerId}'. Valid types: ${DOCUMENT_IMPLEMENTED_BY_VALID_TYPES.join(', ')}`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /** Validate implements field targets only documents */
  private validateImplements(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    if (entity.type !== 'story' && entity.type !== 'milestone') {
      return errors;
    }

    const implementsField = (entity as Story | Milestone).implements;
    if (!implementsField || implementsField.length === 0) {
      return errors;
    }

    for (const docId of implementsField) {
      const doc = this.context.getEntity(docId);
      if (doc && !IMPLEMENTS_VALID_TYPES.includes(doc.type)) {
        errors.push({
          field: 'implements',
          message: `${entity.type} cannot implement ${doc.type} '${docId}'. Valid types: ${IMPLEMENTS_VALID_TYPES.join(', ')}`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /** Validate depends_on field targets only valid entity types for the source entity */
  private validateDependsOn(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    const dependsOn = (entity as any).depends_on as EntityId[] | undefined;
    if (!dependsOn || dependsOn.length === 0) {
      return errors;
    }

    const validTypes = DEPENDS_ON_VALID_TYPES[entity.type];
    for (const depId of dependsOn) {
      const dep = this.context.getEntity(depId);
      if (dep && !validTypes.includes(dep.type)) {
        errors.push({
          field: 'depends_on',
          message: `${entity.type} cannot depend on ${dep.type} '${depId}'. Valid types: ${validTypes.join(', ')}`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /** Validate array fields have proper format (not strings, not corrupted) */
  private validateArrayFieldFormat(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];
    const arrayFields = ['depends_on', 'blocked_by', 'implements', 'blocks', 'implemented_by'];
    const idPattern = /^(M-\d{3}|S-\d{3}|T-\d{3}|DEC-\d{3}|DOC-\d{3})$/;

    for (const field of arrayFields) {
      const value = (entity as any)[field];

      // Skip if field doesn't exist or is undefined
      if (value === undefined || value === null) continue;

      // Check if it's a string instead of array (corrupted)
      if (typeof value === 'string') {
        errors.push({
          field,
          message: `Field '${field}' should be an array but is a string: "${value}"`,
          severity: 'error',
        });
        continue;
      }

      // Check if it's an array
      if (!Array.isArray(value)) {
        errors.push({
          field,
          message: `Field '${field}' should be an array but is type: ${typeof value}`,
          severity: 'error',
        });
        continue;
      }

      // Validate each element in the array
      for (const element of value) {
        if (typeof element !== 'string') {
          errors.push({
            field,
            message: `Field '${field}' contains non-string element: ${JSON.stringify(element)}`,
            severity: 'error',
          });
        } else if (!idPattern.test(element)) {
          errors.push({
            field,
            message: `Field '${field}' contains invalid entity ID: "${element}"`,
            severity: 'error',
          });
        }
      }
    }

    return errors;
  }

  /** Validate all referenced entity IDs exist */
  private validateReferencesExist(entity: Entity): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check depends_on
    const dependsOn = (entity as any).depends_on as EntityId[] | undefined;
    if (dependsOn) {
      for (const depId of dependsOn) {
        if (!this.context.getEntity(depId)) {
          errors.push({
            field: 'depends_on',
            message: `Referenced entity '${depId}' not found`,
            severity: 'error',
          });
        }
      }
    }

    // Check implements
    const implementsField = (entity as any).implements as EntityId[] | undefined;
    if (implementsField) {
      for (const implId of implementsField) {
        if (!this.context.getEntity(implId)) {
          errors.push({
            field: 'implements',
            message: `Referenced document '${implId}' not found`,
            severity: 'error',
          });
        }
      }
    }

    // Check affects (for decisions)
    if (entity.type === 'decision') {
      const decision = entity as Decision;
      if (decision.affects) {
        for (const affectedId of decision.affects) {
          if (!this.context.getEntity(affectedId)) {
            errors.push({
              field: 'affects',
              message: `Referenced entity '${affectedId}' not found`,
              severity: 'error',
            });
          }
        }
      }
    }

    // Check implemented_by (for documents)
    if (entity.type === 'document') {
      const doc = entity as Document;
      if (doc.implemented_by) {
        for (const implById of doc.implemented_by) {
          if (!this.context.getEntity(implById)) {
            errors.push({
              field: 'implemented_by',
              message: `Referenced story '${implById}' not found`,
              severity: 'error',
            });
          }
        }
      }
    }

    // Check supersedes (for decisions)
    if (entity.type === 'decision') {
      const decision = entity as Decision;
      if (decision.supersedes) {
        const supersededEntity = this.context.getEntity(decision.supersedes);
        if (!supersededEntity) {
          errors.push({
            field: 'supersedes',
            message: `Referenced decision '${decision.supersedes}' not found`,
            severity: 'error',
          });
        } else if (supersededEntity.type !== 'decision') {
          errors.push({
            field: 'supersedes',
            message: `Can only supersede decisions, but '${decision.supersedes}' is a ${supersededEntity.type}`,
            severity: 'error',
          });
        }
      }
    }

    return errors;
  }

  // ---------------------------------------------------------------------------
  // Circular Dependency Detection
  // ---------------------------------------------------------------------------

  private hasCircularDependency(
    startId: EntityId,
    blockers: EntityId[],
    visited: Set<EntityId>,
    path: EntityId[]
  ): boolean {
    for (const blockerId of blockers) {
      if (blockerId === startId) {
        return true;
      }

      if (visited.has(blockerId)) {
        continue;
      }

      visited.add(blockerId);
      path.push(blockerId);

      const blocker = this.context.getEntity(blockerId);
      if (blocker && 'blocked_by' in blocker && Array.isArray((blocker as any).blocked_by)) {
        const nestedBlockers = (blocker as any).blocked_by as EntityId[];
        if (this.hasCircularDependency(startId, nestedBlockers, visited, path)) {
          return true;
        }
      }

      path.pop();
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Custom Rule Registration
  // ---------------------------------------------------------------------------

  /** Add a custom validation rule */
  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /** Remove a validation rule by name */
  removeRule(name: string): void {
    this.rules = this.rules.filter(r => r.name !== name);
  }
}
