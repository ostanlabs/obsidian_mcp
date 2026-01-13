# Feature Entity Implementation Spec: Obsidian MCP

**Version:** 1.0  
**Status:** Draft  
**Created:** 2026-01-13  
**Purpose:** Specification for adding Feature (F-XXX) entity type to Obsidian MCP

---

## Overview

Add `feature` as a new first-class entity type with many-to-many relationships to existing entities (milestone, story, document, decision).

---

## 1. Entity Schema

### 1.1 Feature Entity Definition

```typescript
interface Feature {
  // Identity
  id: string;                    // Format: F-XXX (e.g., F-001, F-042)
  type: "feature";
  title: string;
  workstream: Workstream;        // engineering | business | product | infra
  
  // Feature-Specific Fields
  user_story: string;            // "As a [persona], I want [action], so that [benefit]"
  tier: FeatureTier;             // OSS | Premium
  phase: FeaturePhase;           // MVP | 0 | 1 | 2 | 3 | 4 | 5
  status: FeatureStatus;         // Planned | In Progress | Complete | Deferred
  priority: Priority;            // Low | Medium | High | Critical
  
  // Detailed Fields
  acceptance_criteria: string[]; // List of criteria for completion
  test_refs: string[];           // Test file references ["test_workflow.py"]
  personas: string[];            // Target personas ["OSS Developer", "Enterprise Architect"]
  
  // Content
  content: string;               // Markdown body (detailed description, notes)
  
  // Relationships (outgoing - Feature defines these)
  implemented_by: EntityId[];    // M-XXX[], S-XXX[] (milestones and stories)
  documented_by: EntityId[];     // DOC-XXX[]
  decided_by: EntityId[];        // DEC-XXX[]
  depends_on: EntityId[];        // F-XXX[] (feature dependencies)
  
  // Reverse Relationships (incoming - auto-synced)
  blocks: EntityId[];            // F-XXX[] (features this blocks)
  
  // Metadata
  last_updated: string;          // ISO timestamp
  created_at: string;            // ISO timestamp
}
```

### 1.2 Enums

```typescript
type FeatureTier = "OSS" | "Premium";

type FeaturePhase = "MVP" | "0" | "1" | "2" | "3" | "4" | "5";

type FeatureStatus = "Planned" | "In Progress" | "Complete" | "Deferred";

// Existing enums (unchanged)
type Workstream = "engineering" | "business" | "product" | "infra";
type Priority = "Low" | "Medium" | "High" | "Critical";
```

### 1.3 ID Generation

```
Pattern: F-XXX
Example: F-001, F-042, F-150

Auto-increment from highest existing F-XXX ID in vault.
```

---

## 2. Relationship Model

### 2.1 Bidirectional Relationships

| Feature Field | Target Entity | Reverse Field on Target |
|---------------|---------------|-------------------------|
| `implemented_by` | Milestone, Story | `implements` |
| `documented_by` | Document | `documents` |
| `decided_by` | Decision | `affects` |
| `depends_on` | Feature | `blocks` |

### 2.2 Relationship Rules

```typescript
// Feature → Milestone/Story (many-to-many)
// One feature can be implemented by multiple milestones/stories
// One milestone/story can implement multiple features
Feature.implemented_by: (MilestoneId | StoryId)[]
Milestone.implements: FeatureId[]
Story.implements: FeatureId[]

// Feature → Document (many-to-many)
// One feature can have multiple docs (spec, guide, reference)
// One document can cover multiple features
Feature.documented_by: DocumentId[]
Document.documents: FeatureId[]

// Feature → Decision (many-to-many)
// One feature can be shaped by multiple decisions
// One decision can affect multiple features
Feature.decided_by: DecisionId[]
Decision.affects: FeatureId[]

// Feature → Feature (many-to-many)
// Feature dependencies (F-002 requires F-001)
Feature.depends_on: FeatureId[]
Feature.blocks: FeatureId[]  // Auto-synced reverse
```

### 2.3 Auto-Sync Behavior

When `Feature.implemented_by` is updated:
```
ADD F-001.implemented_by = [M-012]
  → M-012.implements += [F-001]

REMOVE F-001.implemented_by = [M-012]  
  → M-012.implements -= [F-001]
```

Same pattern for all bidirectional relationships.

---

## 3. Tool Updates

### 3.1 create_entity

Add `feature` to allowed types:

```typescript
// Input
{
  type: "feature",  // NEW
  data: {
    title: string,           // Required
    workstream: Workstream,  // Required
    user_story?: string,
    tier?: FeatureTier,      // Default: "OSS"
    phase?: FeaturePhase,    // Default: "Planned"
    status?: FeatureStatus,  // Default: "Planned"
    priority?: Priority,     // Default: "Medium"
    acceptance_criteria?: string[],
    test_refs?: string[],
    personas?: string[],
    implemented_by?: EntityId[],
    documented_by?: EntityId[],
    decided_by?: EntityId[],
    depends_on?: EntityId[],
  }
}

// Output
{
  id: "F-042",
  type: "feature",
  // ... all fields
}
```

### 3.2 update_entity

Support all feature fields:

```typescript
// Input
{
  id: "F-001",
  data?: {
    title?: string,
    user_story?: string,
    tier?: FeatureTier,
    phase?: FeaturePhase,
    status?: FeatureStatus,
    priority?: Priority,
    acceptance_criteria?: string[],
    test_refs?: string[],
    personas?: string[],
    // Content updates
  },
  status?: FeatureStatus,  // Shorthand for status change
  
  // Relationship modifications
  add_to?: {
    implemented_by?: EntityId[],
    documented_by?: EntityId[],
    decided_by?: EntityId[],
    depends_on?: EntityId[],
  },
  remove_from?: {
    implemented_by?: EntityId[],
    documented_by?: EntityId[],
    decided_by?: EntityId[],
    depends_on?: EntityId[],
  },
}
```

### 3.3 get_entity

Add feature-specific fields to response:

```typescript
// Input
{
  id: "F-001",
  fields?: [
    "id", "type", "title", "status", "workstream", "last_updated",  // Summary
    "user_story", "tier", "phase", "priority",                       // Feature fields
    "acceptance_criteria", "test_refs", "personas",                  // Detail fields
    "implemented_by", "documented_by", "decided_by", "depends_on",   // Relationships
    "implementation_details",  // Expanded view of implementing entities
    "content",                 // Full markdown body
  ]
}

// New field: implementation_details
{
  implementation_details: {
    milestones: [
      { id: "M-012", title: "Workflow Engine", status: "Completed" }
    ],
    stories: [
      { id: "S-044", title: "Self-Config Tools", status: "Completed" }
    ],
    tasks_total: 15,
    tasks_completed: 15,
    progress_percent: 100
  }
}
```

### 3.4 search_entities

Add feature to searchable types:

```typescript
// Input
{
  query: "workflow execution",
  filters: {
    type: ["feature"],           // NEW
    workstream: ["engineering"],
    status: ["Complete", "In Progress"],
    // Feature-specific filters
    tier: ["OSS"],               // NEW
    phase: ["MVP", "1", "2"],    // NEW
  }
}
```

### 3.5 get_project_overview

Include features in summary:

```typescript
// Output
{
  summary: {
    milestones: { total: 38, completed: 20, ... },
    stories: { total: 32, completed: 8, ... },
    tasks: { total: 93, completed: 46, ... },
    decisions: { total: 3, pending: 0, decided: 3 },
    documents: { total: 53, draft: 53, approved: 0 },
    features: {                  // NEW
      total: 45,
      complete: 25,
      in_progress: 5,
      planned: 10,
      deferred: 5,
      by_tier: {
        OSS: 30,
        Premium: 15
      },
      by_phase: {
        MVP: 15,
        "0": 3,
        "1": 7,
        "2": 5,
        // ...
      }
    }
  }
}
```

### 3.6 New Tool: get_feature_coverage

```typescript
// Input
{
  phase?: FeaturePhase,    // Filter by phase
  tier?: FeatureTier,      // Filter by tier
  include_tests?: boolean, // Include test coverage analysis
}

// Output
{
  features: [
    {
      id: "F-001",
      title: "Workflow Execution",
      tier: "OSS",
      phase: "MVP",
      status: "Complete",
      implementation: {
        milestones: ["M-012"],
        stories: ["S-XXX"],
        progress_percent: 100
      },
      documentation: {
        specs: ["DOC-029"],
        guides: [],
        coverage: "partial"  // full | partial | none
      },
      testing: {
        test_refs: ["test_workflow_engine.py"],
        has_tests: true
      }
    }
  ],
  summary: {
    total: 45,
    implemented: 25,
    documented: 20,
    tested: 22,
    gaps: {
      missing_implementation: ["F-101", "F-102"],
      missing_docs: ["F-025", "F-026"],
      missing_tests: ["F-030", "F-031"]
    }
  }
}
```

---

## 4. Status Transitions

### 4.1 Valid Transitions

```
Planned → In Progress → Complete
Planned → Deferred
In Progress → Deferred
Deferred → Planned
Deferred → In Progress
```

### 4.2 Transition Rules

| From | To | Conditions |
|------|-----|------------|
| Planned | In Progress | At least one implementing entity exists |
| In Progress | Complete | All acceptance criteria marked complete OR manual override |
| Any | Deferred | Always allowed |
| Deferred | Planned | Always allowed |
| Deferred | In Progress | At least one implementing entity exists |

### 4.3 Auto-Status Derivation (Optional)

Feature status can optionally derive from implementing entities:

```typescript
function deriveFeatureStatus(feature: Feature): FeatureStatus {
  const implementors = [...feature.implemented_by];
  
  if (implementors.length === 0) return "Planned";
  
  const statuses = implementors.map(getEntityStatus);
  
  if (statuses.every(s => s === "Completed")) return "Complete";
  if (statuses.some(s => s === "In Progress")) return "In Progress";
  return "Planned";
}

// Configurable: auto-derive or manual management
feature.auto_status: boolean  // Default: false
```

---

## 5. File Format

### 5.1 Feature Markdown Structure

```markdown
---
id: F-001
type: feature
title: Workflow Execution
workstream: engineering
user_story: "As a developer, I want to define workflows in YAML, so that I can create reusable automation without writing code."
tier: OSS
phase: MVP
status: Complete
priority: High
personas:
  - OSS Developer
  - Team Lead
acceptance_criteria:
  - Workflows can be defined in YAML format
  - Steps execute sequentially by default
  - Variables are resolved via templating
  - Errors are captured and reported
test_refs:
  - tests/test_workflow_engine.py
  - tests/test_workflow_registry.py
implemented_by:
  - M-012
  - S-XXX
documented_by:
  - DOC-029
decided_by:
  - DEC-001
  - DEC-002
depends_on: []
blocks:
  - F-010
last_updated: 2026-01-13T12:00:00.000Z
---

# F-001: Workflow Execution

## Description

Core workflow execution capability that allows developers to define multi-step automations in YAML format.

## User Story

As a developer, I want to define workflows in YAML, so that I can create reusable automation without writing code.

## Acceptance Criteria

- [ ] Workflows can be defined in YAML format
- [ ] Steps execute sequentially by default
- [ ] Variables are resolved via templating
- [ ] Errors are captured and reported

## Implementation Notes

The workflow engine handles YAML parsing, step execution, and result aggregation.

## Related

- **Implements:** M-012 (Workflow Engine)
- **Spec:** DOC-029 (Workflow Engine Specification)
- **Decisions:** DEC-001 (Step Definition Model)
```

### 5.2 File Location

```
vault/
└── features/
    ├── F-001_Workflow_Execution.md
    ├── F-002_Tool_Invocation.md
    └── ...
```

---

## 6. Migration

### 6.1 Existing Entity Updates

Add `implements` field to Milestone and Story:

```typescript
// Milestone - add field
interface Milestone {
  // ... existing fields
  implements: FeatureId[];  // NEW - reverse of Feature.implemented_by
}

// Story - add field
interface Story {
  // ... existing fields
  implements: FeatureId[];  // NEW - reverse of Feature.implemented_by
}

// Document - add field
interface Document {
  // ... existing fields
  documents: FeatureId[];   // NEW - reverse of Feature.documented_by
}

// Decision - add field
interface Decision {
  // ... existing fields
  affects: FeatureId[];     // NEW - reverse of Feature.decided_by
}
```

### 6.2 Reconciliation

Add `feature` to reconcile_relationships tool:

```typescript
// Syncs:
// - Feature.implemented_by ↔ Milestone.implements
// - Feature.implemented_by ↔ Story.implements
// - Feature.documented_by ↔ Document.documents
// - Feature.decided_by ↔ Decision.affects
// - Feature.depends_on ↔ Feature.blocks
```

---

## 7. Indexing

### 7.1 Search Index Fields

```typescript
// Text search fields
- title (weight: high)
- user_story (weight: high)
- content (weight: medium)
- acceptance_criteria (weight: low)

// Filter fields
- type: "feature"
- tier: FeatureTier
- phase: FeaturePhase
- status: FeatureStatus
- workstream: Workstream
- priority: Priority
- personas: string[]
```

### 7.2 Relationship Index

```typescript
// Index for fast relationship queries
feature_implementations: Map<FeatureId, EntityId[]>
entity_features: Map<EntityId, FeatureId[]>
```

---

## 8. API Examples

### 8.1 Create Feature

```typescript
// Request
{
  "type": "feature",
  "data": {
    "title": "Plugin Framework",
    "workstream": "engineering",
    "user_story": "As a developer, I want to extend AEL with plugins, so that I can add custom functionality.",
    "tier": "OSS",
    "phase": "2",
    "status": "Planned",
    "priority": "High",
    "acceptance_criteria": [
      "Plugins can be loaded from directory",
      "Plugins can hook into execution lifecycle",
      "Plugins are isolated from each other"
    ],
    "implemented_by": ["M-024"]
  }
}

// Response
{
  "id": "F-081",
  "type": "feature",
  "title": "Plugin Framework",
  // ... all fields
}
```

### 8.2 Link Feature to Implementation

```typescript
// Request
{
  "id": "F-001",
  "add_to": {
    "implemented_by": ["S-044", "S-041"]
  }
}

// Result: 
// F-001.implemented_by now includes S-044, S-041
// S-044.implements now includes F-001
// S-041.implements now includes F-001
```

### 8.3 Query Features by Phase

```typescript
// Request
{
  "query": "*",
  "filters": {
    "type": ["feature"],
    "phase": ["2"],
    "tier": ["OSS"]
  }
}

// Response: All OSS features planned for Phase 2
```

---

## Related Documents

- [FEATURE_ENTITY_SPEC.md](../../obsidian_plugin/docs/FEATURE_ENTITY_SPEC.md) - Plugin implementation
