# Validate Project Entities Tool Specification

**Version:** 1.0  
**Status:** Draft  
**Created:** 2026-03-28  

## 1. Overview

### 1.1 Purpose
Create an MCP tool `validate_project_entities` that validates Obsidian project entities against a set of configurable rules and reports violations to the agent.

### 1.2 Goals
- Provide a validation mechanism for project entity relationships
- Support extensible rule definitions
- Enable rule configuration (enable/disable, severity levels)
- Return actionable violation reports
- Integrate validation summary into `get_project_overview` for visibility
- Implicitly sanitize frontmatter values (replace `:` with `-`) to prevent YAML issues

## 2. Tool Definition

### 2.1 Tool Registration

**Name:** `validate_project`  
**Category:** Project Understanding (Category 3)

```typescript
// In src/tools/index.ts
{
  name: 'validate_project',
  description: `Validate project entities against relationship rules.

Checks for violations such as:
- Documents without implementation links
- Decisions not linked to documents
- Features without coverage (milestone/document)

EXAMPLES:
- Validate all: { }
- Validate specific rules: { rules: ["DOC_REQUIRES_IMPLEMENTATION"] }
- Validate specific workstream: { workstream: "engineering" }
- Include archived: { include_archived: true }`,
  inputSchema: {
    type: 'object',
    properties: {
      rules: {
        type: 'array',
        items: { type: 'string' },
        description: 'Rule IDs to check. If not specified, runs all enabled rules.',
      },
      workstream: {
        type: 'string',
        description: 'Filter validation to specific workstream.',
      },
      entity_types: {
        type: 'array',
        items: { type: 'string', enum: ['document', 'decision', 'feature'] },
        description: 'Entity types to validate. Default: all applicable types.',
      },
      include_archived: {
        type: 'boolean',
        description: 'Include archived entities in validation. Default: false.',
      },
      severity_filter: {
        type: 'string',
        enum: ['error', 'warning', 'all'],
        description: 'Filter violations by severity. Default: all.',
      },
    },
  },
}
```

## 3. Type Definitions

### 3.1 Input/Output Types (in `src/tools/tool-types.ts`)

```typescript
// =============================================================================
// Category 9: Project Validation
// =============================================================================

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: ValidationSeverity;
  entity_type: EntityType;
  enabled: boolean;
}

export interface ValidationViolation {
  rule_id: string;
  rule_name: string;
  severity: ValidationSeverity;
  entity_id: EntityId;
  entity_type: EntityType;
  entity_title: string;
  workstream: string;
  message: string;
  suggestion: string;
}

export interface ValidateProjectInput {
  rules?: string[];
  workstream?: string;
  entity_types?: EntityType[];
  include_archived?: boolean;
  severity_filter?: 'error' | 'warning' | 'all';
}

export interface ValidateProjectOutput {
  total_entities_checked: number;
  total_violations: number;
  violations_by_severity: {
    error: number;
    warning: number;
  };
  violations_by_rule: Record<string, number>;
  violations: ValidationViolation[];
  rules_checked: ValidationRule[];
  summary: string;
}
```

## 4. Rule Definitions

### 4.1 Initial Rules

| Rule ID | Name | Entity Type | Severity | Validation Logic |
|---------|------|-------------|----------|------------------|
| `DOC_REQUIRES_IMPLEMENTATION` | Document requires implementation | document | warning | `implemented_by` must have ≥1 story or task |
| `DEC_REQUIRES_DOCUMENT` | Decision requires document | decision | warning | `blocks` must contain ≥1 document ID |
| `FEATURE_REQUIRES_COVERAGE` | Feature requires coverage | feature | warning | Must have `implemented_by` (milestone/story) OR `documented_by` |

### 4.2 Rule Registry (in `src/tools/validation-rules.ts`)

```typescript
import type { EntityType } from '../models/v2-types.js';
import type { ValidationRule, ValidationSeverity } from './tool-types.js';

export interface RuleDefinition extends ValidationRule {
  validate: (entity: Entity, context: ValidationContext) => ValidationResult;
}

export interface ValidationContext {
  getEntity: (id: EntityId) => Promise<Entity | null>;
  getEntityTypeFromId: (id: EntityId) => EntityType;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  suggestion?: string;
}

// Rule Registry
export const VALIDATION_RULES: RuleDefinition[] = [
  {
    id: 'DOC_REQUIRES_IMPLEMENTATION',
    name: 'Document requires implementation',
    description: 'Documents should be linked to at least one story or task via implemented_by',
    severity: 'warning',
    entity_type: 'document',
    enabled: true,
    validate: (entity, _ctx) => {
      const doc = entity as Document;
      const hasImplementation = doc.implemented_by && doc.implemented_by.length > 0;
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
    description: 'Decisions should block at least one document',
    severity: 'warning',
    entity_type: 'decision',
    enabled: true,
    validate: (entity, ctx) => {
      const decision = entity as Decision;
      const blocks = decision.blocks || [];
      const hasDocument = blocks.some(id => ctx.getEntityTypeFromId(id) === 'document');
      return {
        valid: hasDocument,
        message: hasDocument ? undefined : 'Decision does not block any document',
        suggestion: 'Add a document ID to the blocks field',
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
    validate: (entity, _ctx) => {
      const feature = entity as Feature;
      const hasImplementation = feature.implemented_by && feature.implemented_by.length > 0;
      const hasDocumentation = feature.documented_by && feature.documented_by.length > 0;
      const hasCoverage = hasImplementation || hasDocumentation;
      return {
        valid: hasCoverage,
        message: hasCoverage ? undefined : 'Feature has no implementation or documentation coverage',
        suggestion: 'Add milestone/story to implemented_by or document to documented_by',
      };
    },
  },
];
```

## 5. Implementation

### 5.1 File Structure

```
src/tools/
├── validation-rules.ts      # Rule definitions and registry
├── validation-tools.ts      # Tool implementation
└── tool-types.ts            # Add ValidateProject* types
```

### 5.2 Core Implementation (`src/tools/validation-tools.ts`)

```typescript
/**
 * Project Validation Tools
 *
 * Category 9: Project Validation
 * - validate_project: Validate entities against relationship rules
 */

import type { Entity, EntityId, EntityType, Document, Decision, Feature } from '../models/v2-types.js';
import type { ValidateProjectInput, ValidateProjectOutput, ValidationViolation } from './tool-types.js';
import { VALIDATION_RULES, type RuleDefinition, type ValidationContext } from './validation-rules.js';
import { getEntityTypeFromId } from '../models/v2-types.js';

export interface ValidationDependencies {
  getAllEntities: (options: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    workstream?: string;
  }) => Promise<Entity[]>;
  getEntity: (id: EntityId) => Promise<Entity | null>;
}

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

  // Build summary
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
    rules_checked: rulesToCheck.map(({ validate, ...rest }) => rest),
    summary,
  };
}
```

## 6. Integration

### 6.1 Register in `src/tools/index.ts`

```typescript
// Add to imports
import { validateProjectDefinition } from './validation-tools.js';

// Add to utilityToolDefinitions or create new category
export const validationToolDefinitions: Tool[] = [
  validateProjectDefinition as Tool,
];

// Add to allToolDefinitions array
```

### 6.2 Add Handler in `src/index.ts`

```typescript
// Add to imports
import { validateProject } from './tools/validation-tools.js';

// Add case in CallToolRequestSchema handler
case 'validate_project': {
  const runtime = getV2Runtime();
  result = await validateProject(
    args as unknown as ValidateProjectInput,
    {
      getAllEntities: runtime.getAllEntities.bind(runtime),
      getEntity: runtime.getEntity.bind(runtime),
    }
  );
  break;
}
```

## 7. Extensibility

### 7.1 Adding New Rules

To add a new rule, append to `VALIDATION_RULES` in `validation-rules.ts`:

```typescript
{
  id: 'NEW_RULE_ID',
  name: 'Human readable name',
  description: 'What this rule checks',
  severity: 'warning' | 'error',
  entity_type: 'milestone' | 'story' | 'task' | 'decision' | 'document' | 'feature',
  enabled: true,
  validate: (entity, ctx) => {
    // Validation logic
    return { valid: boolean, message?: string, suggestion?: string };
  },
}
```

### 7.2 Future Enhancements

1. **Rule configuration file** - External JSON/YAML for rule enable/disable
2. **Custom rule loading** - Load rules from vault configuration
3. **Fix suggestions with entity IDs** - Suggest specific entities to link
4. **Auto-fix capability** - Optionally apply fixes automatically
5. **Validation history** - Track violations over time

## 8. Example Usage

### 8.1 Validate All Entities

```json
// Request
{ }

// Response
{
  "total_entities_checked": 42,
  "total_violations": 3,
  "violations_by_severity": { "error": 0, "warning": 3 },
  "violations_by_rule": {
    "DOC_REQUIRES_IMPLEMENTATION": 2,
    "FEATURE_REQUIRES_COVERAGE": 1
  },
  "violations": [
    {
      "rule_id": "DOC_REQUIRES_IMPLEMENTATION",
      "rule_name": "Document requires implementation",
      "severity": "warning",
      "entity_id": "DOC-001",
      "entity_type": "document",
      "entity_title": "API Design Spec",
      "workstream": "engineering",
      "message": "Document has no implementing stories or tasks",
      "suggestion": "Add stories or tasks to the implemented_by field"
    }
  ],
  "rules_checked": [...],
  "summary": "⚠️ Found 3 violation(s) across 42 entities checked"
}
```

### 8.2 Validate Specific Workstream

```json
// Request
{ "workstream": "engineering", "rules": ["DOC_REQUIRES_IMPLEMENTATION"] }
```

## 9. Testing Requirements

### 9.1 Unit Tests (`src/tools/validation-tools.test.ts`)

- Test each rule individually with valid/invalid entities
- Test rule filtering
- Test workstream filtering
- Test severity filtering
- Test with empty entity set
- Test with all entities passing

### 9.2 Integration Tests

- End-to-end validation with test vault
- Verify correct entity relationship traversal

## 10. Integration with Project Overview

### 10.1 Motivation

The validation report should be visible as part of the project overview so agents can see validation status when checking project health.

### 10.2 Changes to `GetProjectOverviewOutput`

Add a `validation` field to `GetProjectOverviewOutput` in `src/tools/tool-types.ts`:

```typescript
export interface GetProjectOverviewOutput {
  summary: { ... };
  workstreams: { ... };
  pending_decisions: number;
  ready_for_implementation: number;
  workstream_detail?: { ... };
  pagination?: PaginationOutput;

  // NEW: Validation summary
  validation?: {
    total_violations: number;
    violations_by_severity: {
      error: number;
      warning: number;
    };
    violations_by_rule: Record<string, number>;
    /** Top N violations (limited to avoid bloating response) */
    top_violations: ValidationViolation[];
    /** Hint for agent to call validate_project for full details */
    has_more: boolean;
  };
}
```

### 10.3 Changes to `getProjectOverview` Function

In `src/tools/project-understanding-tools.ts`, add validation as part of the overview:

```typescript
export async function getProjectOverview(
  input: GetProjectOverviewInput,
  deps: ProjectUnderstandingDependencies
): Promise<GetProjectOverviewOutput> {
  // ... existing logic ...

  // Run validation (using same entities already fetched)
  const validationResult = await runValidation(entities, deps);

  // Limit violations in overview response (top 5)
  const MAX_VIOLATIONS_IN_OVERVIEW = 5;
  const topViolations = validationResult.violations.slice(0, MAX_VIOLATIONS_IN_OVERVIEW);

  const result: GetProjectOverviewOutput = {
    summary,
    workstreams,
    pending_decisions: pendingDecisions,
    ready_for_implementation: readyForImplementation,
    // NEW: Include validation summary
    validation: validationResult.total_violations > 0 ? {
      total_violations: validationResult.total_violations,
      violations_by_severity: validationResult.violations_by_severity,
      violations_by_rule: validationResult.violations_by_rule,
      top_violations: topViolations,
      has_more: validationResult.violations.length > MAX_VIOLATIONS_IN_OVERVIEW,
    } : undefined,
  };

  return result;
}
```

### 10.4 Input Parameter

Add optional `include_validation` parameter to `GetProjectOverviewInput` (default: `true`):

```typescript
export interface GetProjectOverviewInput extends PaginationInput {
  include_completed?: boolean;
  include_archived?: boolean;
  canvas_source?: string;
  workstream?: Workstream;
  group_by?: 'status' | 'type' | 'priority';
  // NEW: Include validation in response (default: true)
  include_validation?: boolean;
}
```

---

## 11. Frontmatter Colon Sanitization

### 11.1 Motivation

YAML frontmatter values containing colons (`:`) can cause parsing issues. The system should implicitly replace `:` with `-` in frontmatter string values to prevent malformed YAML.

### 11.2 Scope

Apply sanitization to **all string frontmatter values** except:
- `id` field (uses specific format like `DOC-001`)
- `title` field (already quoted, handled separately)
- Date fields (ISO format contains colons for time)
- Array/object values (handled recursively)

### 11.3 Implementation Location

In `src/services/v2/entity-serializer.ts`, add sanitization in the `valueToYaml` method:

```typescript
/** Sanitize string value by replacing colons with dashes */
private sanitizeColons(value: string): string {
  return value.replace(/:/g, '-');
}

/** Convert a value to YAML representation */
private valueToYaml(value: any, indent: number, fieldName?: string): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    // Skip sanitization for specific fields
    const skipSanitization = ['id', 'title', 'created_at', 'updated_at', 'decided_on', 'target_date'];
    const sanitized = skipSanitization.includes(fieldName || '')
      ? value
      : this.sanitizeColons(value);

    // Check if string needs quoting
    if (this.needsQuoting(sanitized)) {
      return `"${this.escapeString(sanitized)}"`;
    }
    return sanitized;
  }
  // ... rest of method
}
```

### 11.4 Alternative: Sanitize at Entity Creation/Update

Alternatively, sanitize values earlier in the pipeline at `createEntity` or `updateEntity`:

```typescript
// In src/tools/entity-management-tools.ts

/** Sanitize string fields to prevent YAML issues */
function sanitizeEntityData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const skipFields = ['id', 'title', 'created_at', 'updated_at', 'decided_on', 'target_date'];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && !skipFields.includes(key)) {
      sanitized[key] = value.replace(/:/g, '-');
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(v =>
        typeof v === 'string' && !skipFields.includes(key) ? v.replace(/:/g, '-') : v
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Apply in createEntity:
export async function createEntity(
  input: CreateEntityInput,
  deps: EntityManagementDependencies
): Promise<CreateEntityOutput> {
  const { type, data: rawData, options } = input;

  // Sanitize data before processing
  const data = sanitizeEntityData(rawData);

  // ... rest of function
}
```

### 11.5 Warning Log on Sanitization

When a colon is replaced, log a warning to help with debugging:

```typescript
/** Sanitize string fields to prevent YAML issues */
function sanitizeEntityData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const skipFields = ['id', 'title', 'created_at', 'updated_at', 'decided_on', 'target_date'];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && !skipFields.includes(key)) {
      if (value.includes(':')) {
        console.warn(
          `[sanitize] Replacing colon with dash in field '${key}': "${value}" → "${value.replace(/:/g, '-')}"`
        );
      }
      sanitized[key] = value.replace(/:/g, '-');
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(v => {
        if (typeof v === 'string' && !skipFields.includes(key) && v.includes(':')) {
          console.warn(
            `[sanitize] Replacing colon with dash in array field '${key}': "${v}" → "${v.replace(/:/g, '-')}"`
          );
          return v.replace(/:/g, '-');
        }
        return v;
      });
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
```

### 11.6 Recommendation

**Recommended approach**: Sanitize at entity creation/update (Section 11.4) because:
1. Data is cleaned early in the pipeline
2. Stored entities have consistent format
3. No surprises when reading back data
4. Easier to test

---

## 12. Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Include suggested entities in violations? | **No** | Agent (LLM) is better positioned to decide what to connect based on semantic understanding. Heuristic suggestions would be low quality without LLM involvement. |
| Strict mode (treat warnings as errors)? | **No** | Not needed for initial implementation. |
| Auto-validate on entity updates? | **No** | This is a project-level tool. Single entity updates should not trigger full validation. |
| Default for `include_validation`? | **`true`** | Validation visible by default in project overview. |
| Log on colon sanitization? | **Yes (warning)** | Helps with debugging when values are modified. |

## 13. Open Questions

_(None at this time)_

---

## Appendix A: Relationship Reference

| Relationship | Forward Field | Reverse Field | Used By |
|--------------|---------------|---------------|---------|
| Implementation | `implements` | `implemented_by` | story→doc, milestone→feature |
| Documentation | `documents` | `documented_by` | document→feature |
| Blocking | `blocks` | `depends_on` | decision→document/story/task |
| Affects | `affects` | `decided_by` | decision→feature |

