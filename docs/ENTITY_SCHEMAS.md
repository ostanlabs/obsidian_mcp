# Entity Schemas - Shared Type Definitions

> **Version:** 2.0
> **Date:** December 2024
> **Scope:** Shared between Obsidian Plugin and MCP Server
> **Status:** Implementation Spec

---

## Overview

This document defines the TypeScript interfaces for all entity types in the V2 system. These schemas are the **single source of truth** for both the Obsidian Plugin and MCP Server implementations.

---

## Table of Contents

1. [Core Types](#core-types)
2. [Entity Base](#entity-base)
3. [Milestone](#milestone)
4. [Story](#story)
5. [Task](#task)
6. [Decision](#decision)
7. [Document](#document)
8. [Relationships](#relationships)
9. [Canvas Integration](#canvas-integration)
10. [Frontmatter Serialization](#frontmatter-serialization)

---

## Core Types

### Enums and Literals

```typescript
// === ENTITY TYPES ===
type EntityType = 'milestone' | 'story' | 'task' | 'decision' | 'document';

// === STATUS BY ENTITY TYPE ===
type MilestoneStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
type StoryStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
type TaskStatus = 'Open' | 'InProgress' | 'Complete' | 'OnHold';
type DecisionStatus = 'Pending' | 'Decided' | 'Superseded';
type DocumentStatus = 'Draft' | 'Review' | 'Approved' | 'Superseded';

// Union type for any status
type EntityStatus = MilestoneStatus | StoryStatus | TaskStatus | DecisionStatus | DocumentStatus;

// === PRIORITY ===
type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

// === EFFORT TYPES ===
// Default effort types (user-configurable via settings)
type DefaultEffortType = 'Engineering' | 'Business' | 'Infra' | 'Research' | 'Design' | 'Marketing';

// === DOCUMENT TYPES ===
type DocumentType = 'spec' | 'adr' | 'vision' | 'guide' | 'research';

// === RELATIONSHIP TYPES ===
type DependencyType = 'blocks' | 'implements' | 'enables' | 'references' | 'supersedes';
```

### ID Formats

```typescript
// ID format patterns
type MilestoneId = `M-${string}`;      // M-001, M-002, etc.
type StoryId = `S-${string}`;          // S-001, S-015, etc.
type TaskId = `T-${string}`;           // T-001, T-042, etc.
type DecisionId = `DEC-${string}`;     // DEC-001, DEC-015, etc.
type DocumentId = `DOC-${string}`;     // DOC-001, DOC-005, etc.

// Union type for any entity ID
type EntityId = MilestoneId | StoryId | TaskId | DecisionId | DocumentId;

// Inline task ID (tasks within stories)
type InlineTaskId = `${StoryId}:Task ${number}:${string}`;  // S-015:Task 1:Setup DB
```

### Utility Types

```typescript
// ISO 8601 datetime string
type ISODateTime = string;  // e.g., "2024-12-17T10:30:00Z"

// User reference (@ mention format)
type UserRef = `@${string}`;  // e.g., "@john", "@tech-lead"

// File path relative to vault
type VaultPath = string;  // e.g., "accomplishments/stories/S-015_Auth.md"

// Canvas file path
type CanvasPath = string;  // e.g., "projects/main.canvas"
```

---

## Entity Base

All entities share these common fields:

```typescript
interface EntityBase {
  // === IDENTITY ===
  id: EntityId;
  type: EntityType;
  title: string;
  
  // === ORGANIZATION ===
  workstream: string;              // "engineering", "business", etc.
  
  // === LIFECYCLE ===
  status: EntityStatus;
  archived: boolean;
  
  // === TIMESTAMPS ===
  created_at: ISODateTime;
  updated_at: ISODateTime;
  
  // === CANVAS ===
  canvas_source: CanvasPath;
  cssclasses: string[];            // For visual styling
  
  // === FILE ===
  vault_path: VaultPath;           // Path to .md file
}
```

### CSS Classes Convention

```typescript
// CSS class patterns for entities
interface CSSClassPatterns {
  // Type classes
  type: `canvas-${EntityType}`;                    // canvas-milestone, canvas-story, etc.
  
  // Effort classes (for stories/tasks)
  effort: `canvas-effort-${string}`;              // canvas-effort-engineering
  
  // Status classes
  status: `canvas-status-${string}`;              // canvas-status-completed
  
  // Priority classes (optional)
  priority: `canvas-priority-${string}`;          // canvas-priority-critical
}

// Example cssclasses array:
// ["canvas-story", "canvas-effort-engineering", "canvas-status-in-progress"]
```

---

## Milestone

```typescript
interface Milestone extends EntityBase {
  type: 'milestone';
  status: MilestoneStatus;
  
  // === MILESTONE-SPECIFIC ===
  priority: Priority;
  target_date?: ISODateTime;       // Optional deadline
  owner?: UserRef;                 // Accountable person
  
  // === HIERARCHY ===
  // Milestones don't have parents (they are top-level)
  // Children are tracked via Story.parent
  
  // === DEPENDENCIES ===
  depends_on: MilestoneId[];       // Other milestones this depends on
}

// Frontmatter representation
interface MilestoneFrontmatter {
  id: string;
  type: 'milestone';
  title: string;
  status: MilestoneStatus;
  workstream: string;
  priority: Priority;
  target_date?: string;
  owner?: string;
  depends_on: string[];
  cssclasses: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
  canvas_source: string;
}
```

### Milestone Markdown Template

```markdown
---
id: M-001
type: milestone
title: Q1 Product Launch
status: Not Started
workstream: engineering
priority: Critical
target_date: 2025-03-31
owner: "@founder"
depends_on: []
cssclasses:
  - canvas-milestone
  - canvas-status-not-started
created_at: 2024-12-01T00:00:00Z
updated_at: 2024-12-17T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# M-001: Q1 Product Launch

## Objective

[High-level goal description]

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Notes

[Additional context, risks, dependencies]
```

---

## Story

```typescript
interface Story extends EntityBase {
  type: 'story';
  status: StoryStatus;
  
  // === STORY-SPECIFIC ===
  effort: string;                  // Effort type (Engineering, Business, etc.)
  priority: Priority;
  
  // === HIERARCHY ===
  parent?: MilestoneId;            // Parent milestone (optional for orphan stories)
  
  // === DEPENDENCIES ===
  depends_on: (StoryId | DecisionId)[];  // Stories or decisions this depends on
  
  // === IMPLEMENTATION ===
  implements?: DocumentId[];        // Specs this story implements
  
  // === INLINE TASKS ===
  // Tasks are stored in the markdown body, not frontmatter
  // See InlineTask interface below
  
  // === ACCEPTANCE CRITERIA ===
  acceptance_criteria?: string[];   // Stored in frontmatter for easy querying
}

// Inline task (stored in markdown body, not frontmatter)
interface InlineTask {
  number: number;                  // Task 1, 2, 3...
  name: string;
  goal: string;
  description?: string;
  technical_notes?: string;
  estimate_hrs?: number;
  status: TaskStatus;
  notes?: string;
}

// Frontmatter representation
interface StoryFrontmatter {
  id: string;
  type: 'story';
  title: string;
  status: StoryStatus;
  effort: string;
  priority: Priority;
  workstream: string;
  parent?: string;
  depends_on: string[];
  implements?: string[];
  acceptance_criteria?: string[];
  cssclasses: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
  canvas_source: string;
}
```

### Story Markdown Template

```markdown
---
id: S-015
type: story
title: Implement Premium Features
status: Not Started
effort: Engineering
priority: High
workstream: engineering
parent: M-001
depends_on:
  - DEC-001
  - S-012
implements:
  - DOC-005
acceptance_criteria:
  - Users can upgrade to premium
  - Premium features are gated correctly
  - Stripe integration handles payments
cssclasses:
  - canvas-story
  - canvas-effort-engineering
  - canvas-status-not-started
created_at: 2024-12-15T00:00:00Z
updated_at: 2024-12-17T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# S-015: Implement Premium Features

## Outcome

Users can subscribe to premium tier and access exclusive features.

## Acceptance Criteria

- [ ] Users can upgrade to premium
- [ ] Premium features are gated correctly
- [ ] Stripe integration handles payments

## Tasks

### Task 1: Setup Stripe SDK
- **Goal:** Stripe SDK integrated and configured
- **Status:** Open
- **Estimate:** 4h
- **Description:** Install and configure Stripe SDK with test keys
- **Technical Notes:** Use stripe-node v14+, configure webhooks

### Task 2: Implement Subscription Logic
- **Goal:** Users can subscribe/unsubscribe
- **Status:** Open
- **Estimate:** 8h

### Task 3: Feature Flag Integration
- **Goal:** Premium features respect subscription state
- **Status:** Open
- **Estimate:** 4h

## Notes

[Additional context]
```

---

## Task (Standalone)

Standalone tasks exist as separate files, used when tasks need their own canvas node or when not associated with a story.

```typescript
interface Task extends EntityBase {
  type: 'task';
  status: TaskStatus;
  
  // === TASK-SPECIFIC ===
  goal: string;
  description?: string;
  technical_notes?: string;
  estimate_hrs?: number;
  actual_hrs?: number;
  assignee?: UserRef;
  
  // === HIERARCHY ===
  parent?: StoryId;                // Parent story (optional)
  
  // === DEPENDENCIES ===
  depends_on?: TaskId[];           // Other tasks this depends on
}

// Frontmatter representation
interface TaskFrontmatter {
  id: string;
  type: 'task';
  title: string;
  status: TaskStatus;
  workstream: string;
  goal: string;
  description?: string;
  technical_notes?: string;
  estimate_hrs?: number;
  actual_hrs?: number;
  assignee?: string;
  parent?: string;
  depends_on?: string[];
  cssclasses: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
  canvas_source: string;
}
```

### Task Markdown Template

```markdown
---
id: T-042
type: task
title: Setup PostgreSQL Database
status: Open
workstream: engineering
goal: PostgreSQL database running locally and in staging
estimate_hrs: 4
assignee: "@jane"
parent: S-015
depends_on: []
cssclasses:
  - canvas-task
  - canvas-effort-engineering
  - canvas-status-open
created_at: 2024-12-17T00:00:00Z
updated_at: 2024-12-17T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# T-042: Setup PostgreSQL Database

## Goal

PostgreSQL database running locally and in staging.

## Description

[Detailed task description]

## Technical Notes

[Implementation details, commands, references]

## Notes

[Progress updates, blockers, etc.]
```

---

## Decision

```typescript
interface Decision extends EntityBase {
  type: 'decision';
  status: DecisionStatus;
  
  // === DECISION-SPECIFIC ===
  context: string;                 // What problem we're solving
  decision: string;                // The actual decision made
  rationale: string;               // Why we made this choice
  decided_by?: UserRef;            // Who made the decision
  decided_on?: ISODateTime;        // When it was decided
  
  // === RELATIONSHIPS ===
  enables?: EntityId[];            // What this decision unblocks
  supersedes?: DecisionId;         // Previous decision this replaces
  affects_documents?: DocumentId[]; // Documents that may need updating
  
  // === ALTERNATIVES ===
  alternatives_considered?: Alternative[];
}

interface Alternative {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  rejected_reason?: string;
}

// Frontmatter representation
interface DecisionFrontmatter {
  id: string;
  type: 'decision';
  title: string;
  status: DecisionStatus;
  workstream: string;
  decided_by?: string;
  decided_on?: string;
  enables?: string[];
  supersedes?: string;
  affects_documents?: string[];
  cssclasses: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
  canvas_source: string;
}
```

### Decision Markdown Template

```markdown
---
id: DEC-001
type: decision
title: Premium Feature Set Definition
status: Decided
workstream: business
decided_by: "@founder"
decided_on: 2024-12-10T00:00:00Z
enables:
  - S-015
  - DOC-005
  - MKT-003
supersedes: null
affects_documents: []
cssclasses:
  - canvas-decision
  - canvas-status-decided
created_at: 2024-12-08T00:00:00Z
updated_at: 2024-12-10T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# DEC-001: Premium Feature Set Definition

## Context

Need to define which features are premium vs free before engineering can implement.

## Decision

Premium tier includes: Advanced Analytics, Team Collaboration, Priority Support.

## Rationale

- Market research shows these features have highest willingness-to-pay
- Aligns with competitor offerings
- Reasonable implementation scope for Q1

## Alternatives Considered

### Option A: All Features Free, Charge for Usage
**Pros:** Simple pricing model
**Cons:** Hard to predict revenue
**Rejected:** Too risky for MVP

### Option B: Feature-Based Pricing (Per Feature)
**Pros:** Flexible for users
**Cons:** Complex implementation, confusing UX
**Rejected:** Too complex for MVP

## Consequences

- Engineering can proceed with S-015
- Marketing can finalize pricing page
- Need to update documentation
```

---

## Document

```typescript
interface Document extends EntityBase {
  type: 'document';
  status: DocumentStatus;
  
  // === DOCUMENT-SPECIFIC ===
  doc_type: DocumentType;          // spec, adr, vision, guide, research
  version: number;                 // Version number (1, 2, 3...)
  owner?: UserRef;                 // Document owner
  
  // === VERSIONING ===
  supersedes_decision?: DecisionId;  // Decision that triggered this version
  previous_versions?: VersionInfo[];
  
  // === IMPLEMENTATION CONTEXT ===
  // Used by generate_implementation_package()
  implementation_context?: {
    required: DocumentId[];        // Must include full content
    reference: DocumentId[];       // Include summary only
    assumes: string[];             // List for awareness, no content
  };
  
  // === RELATIONSHIPS ===
  implemented_by?: StoryId[];      // Stories implementing this spec
  references?: EntityId[];         // Other entities this doc references
}

interface VersionInfo {
  version: number;
  date: ISODateTime;
  superseded_by?: DecisionId;
  change_summary?: string;
  git_ref?: string;                // Git commit hash for retrieval
}

// Frontmatter representation
interface DocumentFrontmatter {
  id: string;
  type: 'document';
  doc_type: DocumentType;
  title: string;
  status: DocumentStatus;
  workstream: string;
  version: number;
  owner?: string;
  supersedes_decision?: string;
  previous_versions?: Array<{
    version: number;
    date: string;
    superseded_by?: string;
    change_summary?: string;
  }>;
  implementation_context?: {
    required: string[];
    reference: string[];
    assumes: string[];
  };
  implemented_by?: string[];
  references?: string[];
  cssclasses: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
  canvas_source: string;
}
```

### Document Markdown Template

```markdown
---
id: DOC-005
type: document
doc_type: spec
title: Premium Features Technical Spec
status: Approved
workstream: engineering
version: 2
owner: "@tech-lead"
supersedes_decision: DEC-015
previous_versions:
  - version: 1
    date: 2024-11-15T00:00:00Z
    superseded_by: DEC-015
    change_summary: Initial spec - custom auth approach
implementation_context:
  required:
    - DOC-001
    - DEC-001
  reference:
    - DOC-002
  assumes:
    - AUTH-SPEC
implemented_by:
  - S-015
  - S-016
references:
  - DEC-001
  - DEC-012
cssclasses:
  - canvas-document
  - canvas-status-approved
created_at: 2024-11-15T00:00:00Z
updated_at: 2024-12-17T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# DOC-005: Premium Features Technical Spec

> **Version:** 2  
> **Status:** Approved  
> **Note:** This version supersedes v1 per [DEC-015](../decisions/DEC-015.md)

## Overview

[Spec overview]

## Requirements

### Functional Requirements

[Requirements list]

### Non-Functional Requirements

[Performance, security, etc.]

## Technical Design

[Architecture, data models, APIs]

## API Contracts

[Endpoint specifications]

## Acceptance Criteria

- [ ] All premium endpoints protected
- [ ] Subscription state synced with Stripe
- [ ] Feature flags respect subscription tier

## Open Questions

[Unresolved items - should be empty for Approved status]
```

---

## Relationships

### Dependency Graph Types

```typescript
// Edge in the dependency graph
interface DependencyEdge {
  from_id: EntityId;               // Blocker
  to_id: EntityId;                 // Blocked
  type: DependencyType;
  created_at: ISODateTime;
}

// Resolved dependency with entity details
interface ResolvedDependency {
  entity: EntitySummary;
  type: DependencyType;
  is_blocking: boolean;            // True if blocker is not complete
}

// Entity summary (for listings, not full content)
interface EntitySummary {
  id: EntityId;
  type: EntityType;
  title: string;
  status: EntityStatus;
  workstream: string;
  parent?: {
    id: EntityId;
    title: string;
  };
  last_updated: ISODateTime;
}
```

### Hierarchy Types

```typescript
// Parent-child relationship
interface HierarchyNode {
  entity: EntitySummary;
  children: HierarchyNode[];
  depth: number;
}

// Flatten hierarchy to list
interface HierarchyPath {
  path: EntitySummary[];           // [Milestone, Story, Task]
  depth: number;
}
```

## Canvas Integration

### Design Philosophy

Visual differentiation is achieved through **CSS classes on individual nodes**, not canvas groups. Each entity's markdown frontmatter includes `cssclasses` that control:
- **Border thickness** — entity type (milestone=4px, story=2px, task=1px)
- **Border color** — workstream/effort type
- **Visual state** — status indicators

### Canvas Node Types

```typescript
// Primary node type - file reference
interface CanvasFileNode {
  id: string;                      // UUID
  type: 'file';
  file: VaultPath;                 // Path to .md file
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;                  // Obsidian color (1-6) or hex - optional
}

// Group node - OPTIONAL, not required for visual differentiation
// Groups can be used for manual organization but the workflow
// does not depend on them. Visual differentiation comes from CSS classes.
interface CanvasGroupNode {
  id: string;
  type: 'group';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

// Edge representation - dependency arrows
interface CanvasEdge {
  id: string;
  fromNode: string;                // Node ID
  toNode: string;                  // Node ID
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  label?: string;                  // "blocks", "enables", etc.
}

// Full canvas structure
interface CanvasData {
  nodes: (CanvasFileNode | CanvasGroupNode)[];
  edges: CanvasEdge[];
}
```


  edges: CanvasEdge[];
}
```

### Node Sizing by Entity Type

```typescript
interface NodeSizeConfig {
  milestone: { width: 280; height: 200 };
  story: { width: 200; height: 150 };
  task: { width: 160; height: 100 };
  decision: { width: 180; height: 120 };
  document: { width: 200; height: 150 };
}

// Default sizes
const DEFAULT_NODE_SIZES: NodeSizeConfig = {
  milestone: { width: 280, height: 200 },
  story: { width: 200, height: 150 },
  task: { width: 160, height: 100 },
  decision: { width: 180, height: 120 },
  document: { width: 200, height: 150 },
};
```

---

## Frontmatter Serialization

### Parsing Functions

```typescript
// Parse frontmatter from markdown content
function parseFrontmatter(content: string): Record<string, unknown>;

// Serialize frontmatter to YAML string
function serializeFrontmatter(data: Record<string, unknown>): string;

// Parse entity from markdown file
function parseEntity<T extends EntityBase>(content: string, type: EntityType): T;

// Serialize entity to markdown content
function serializeEntity<T extends EntityBase>(entity: T, bodyContent: string): string;
```

### Type Guards

```typescript
// Type guards for entity types
function isMilestone(entity: EntityBase): entity is Milestone {
  return entity.type === 'milestone';
}

function isStory(entity: EntityBase): entity is Story {
  return entity.type === 'story';
}

function isTask(entity: EntityBase): entity is Task {
  return entity.type === 'task';
}

function isDecision(entity: EntityBase): entity is Decision {
  return entity.type === 'decision';
}

function isDocument(entity: EntityBase): entity is Document {
  return entity.type === 'document';
}

// ID type guards
function isMilestoneId(id: string): id is MilestoneId {
  return /^M-\d+$/.test(id);
}

function isStoryId(id: string): id is StoryId {
  return /^S-\d+$/.test(id);
}

function isTaskId(id: string): id is TaskId {
  return /^T-\d+$/.test(id);
}

function isDecisionId(id: string): id is DecisionId {
  return /^DEC-\d+$/.test(id);
}

function isDocumentId(id: string): id is DocumentId {
  return /^DOC-\d+$/.test(id);
}
```

### Validation

```typescript
// Validation result
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
}

interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Validate entity against schema
function validateEntity(entity: unknown, type: EntityType): ValidationResult;

// Validate frontmatter has required fields
function validateFrontmatter(frontmatter: Record<string, unknown>, type: EntityType): ValidationResult;
```

---

## Appendix: Complete Type Exports

```typescript
// Export all types for use in Plugin and MCP
export type {
  // Core types
  EntityType,
  EntityStatus,
  MilestoneStatus,
  StoryStatus,
  TaskStatus,
  DecisionStatus,
  DocumentStatus,
  Priority,
  DocumentType,
  DependencyType,
  
  // ID types
  EntityId,
  MilestoneId,
  StoryId,
  TaskId,
  DecisionId,
  DocumentId,
  InlineTaskId,
  
  // Utility types
  ISODateTime,
  UserRef,
  VaultPath,
  CanvasPath,
  
  // Entity types
  EntityBase,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  InlineTask,
  Alternative,
  VersionInfo,
  
  // Frontmatter types
  MilestoneFrontmatter,
  StoryFrontmatter,
  TaskFrontmatter,
  DecisionFrontmatter,
  DocumentFrontmatter,
  
  // Relationship types
  DependencyEdge,
  ResolvedDependency,
  EntitySummary,
  HierarchyNode,
  HierarchyPath,
  
  // Canvas types
  CanvasFileNode,
  CanvasGroupNode,
  CanvasEdge,
  CanvasData,
  NodeSizeConfig,
  
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,
};
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2024-12-17 | Initial V2 schema definition |
