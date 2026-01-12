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
  children?: StoryId[];            // Stories in this milestone (auto-synced from Story.parent)
  
  // === DEPENDENCIES ===
  depends_on?: (MilestoneId | DecisionId)[];  // Milestones or decisions this depends on
  blocks?: EntityId[];             // Entities blocked by this milestone (auto-synced)
  
  // === IMPLEMENTATION ===
  implements?: DocumentId[];       // Specs this milestone implements
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
  children?: string[];
  depends_on?: string[];
  blocks?: string[];
  implements?: string[];
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
children:
  - S-001
  - S-002
depends_on: []
blocks: []
implements:
  - DOC-001
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
  children?: TaskId[];             // Tasks in this story (auto-synced from Task.parent)
  
  // === DEPENDENCIES ===
  depends_on?: EntityId[];         // Entities this depends on
  blocks?: EntityId[];             // Entities blocked by this story (auto-synced)
  
  // === IMPLEMENTATION ===
  implements?: DocumentId[];       // Specs this story implements
  
  // === INLINE TASKS ===
  // Tasks are stored in the markdown body, not frontmatter
  // See InlineTask interface below
  
  // === ACCEPTANCE CRITERIA ===
  acceptance_criteria?: string[];  // Stored in frontmatter for easy querying
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
  children?: string[];
  depends_on?: string[];
  blocks?: string[];
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
children:
  - T-042
  - T-043
depends_on:
  - DEC-001
  - S-012
blocks: []
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
  depends_on?: DecisionId[];       // Decisions this depends on
  blocks?: EntityId[];             // Entities blocked by this task (auto-synced)
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
  blocks?: string[];
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
depends_on:
  - DEC-001
blocks: []
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
  
  // === DEPENDENCIES ===
  depends_on?: DecisionId[];       // Other decisions this depends on
  blocks?: EntityId[];             // Entities blocked by this decision (auto-synced)
  
  // === SUPERSESSION ===
  supersedes?: DecisionId;         // Previous decision this replaces
  superseded_by?: DecisionId;      // Decision that replaced this one (auto-synced)
  
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
  depends_on?: string[];
  blocks?: string[];
  supersedes?: string;
  superseded_by?: string;
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
depends_on: []
blocks:
  - S-015
  - DOC-005
supersedes: null
superseded_by: null
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
  version?: string;                // Version string
  owner?: UserRef;                 // Document owner

  // === DEPENDENCIES ===
  depends_on?: DecisionId[];       // Decisions this document depends on
  blocks?: EntityId[];             // Entities blocked by this document (auto-synced)

  // === VERSIONING ===
  previous_version?: DocumentId;   // Previous version of this document
  next_version?: DocumentId;       // Next version of this document (auto-synced)

  // === IMPLEMENTATION CONTEXT ===
  implementation_context?: string; // Context for implementation

  // === RELATIONSHIPS ===
  implemented_by?: (StoryId | MilestoneId)[];  // Stories/Milestones implementing this spec
}

// Frontmatter representation
interface DocumentFrontmatter {
  id: string;
  type: 'document';
  doc_type: DocumentType;
  title: string;
  status: DocumentStatus;
  workstream: string;
  version?: string;
  owner?: string;
  depends_on?: string[];
  blocks?: string[];
  previous_version?: string;
  next_version?: string;
  implementation_context?: string;
  implemented_by?: string[];
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
version: "2.0"
owner: "@tech-lead"
depends_on:
  - DEC-001
  - DEC-015
blocks: []
previous_version: DOC-004
next_version: null
implementation_context: "Requires understanding of Stripe API and feature flags"
implemented_by:
  - S-015
  - S-016
cssclasses:
  - canvas-document
  - canvas-status-approved
created_at: 2024-11-15T00:00:00Z
updated_at: 2024-12-17T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# DOC-005: Premium Features Technical Spec

> **Version:** 2.0  
> **Status:** Approved  
> **Previous Version:** [DOC-004](../documents/DOC-004.md)

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

### Design Philosophy

All relationships are **fully symmetric** - every forward relationship has a corresponding reverse field that is auto-synced. This ensures:
- Bidirectional navigation in Obsidian (Dataview queries work both ways)
- No orphaned references
- Clear relationship semantics

### Relationship Types

| Relationship | Semantic | Forward Field | Reverse Field | Auto-Sync |
|--------------|----------|---------------|---------------|:---------:|
| **Hierarchy** | "is part of" | `parent` | `children` | ✅ |
| **Dependency** | "must happen first" | `depends_on` | `blocks` | ✅ |
| **Implementation** | "delivers this spec" | `implements` | `implemented_by` | ✅ |
| **Supersession** | "replaces" | `supersedes` | `superseded_by` | ✅ |
| **Versioning** | "evolved into" | `previous_version` | `next_version` | ✅ |

### Relationship Fields by Entity Type

| Field | Milestone | Story | Task | Decision | Document |
|-------|:---------:|:-----:|:----:|:--------:|:--------:|
| **Hierarchy** |||||
| `parent` | ❌ | `MilestoneId?` | `StoryId?` | ❌ | ❌ |
| `children` | `StoryId[]` | `TaskId[]` | ❌ | ❌ | ❌ |
| **Dependency** |||||
| `depends_on` | `(MilestoneId\|DecisionId)[]` | `EntityId[]` | `DecisionId[]` | `DecisionId[]` | `DecisionId[]` |
| `blocks` | `EntityId[]` | `EntityId[]` | `EntityId[]` | `EntityId[]` | `EntityId[]` |
| **Implementation** |||||
| `implements` | `DocumentId[]` | `DocumentId[]` | ❌ | ❌ | ❌ |
| `implemented_by` | ❌ | ❌ | ❌ | ❌ | `(StoryId\|MilestoneId)[]` |
| **Supersession** |||||
| `supersedes` | ❌ | ❌ | ❌ | `DecisionId?` | ❌ |
| `superseded_by` | ❌ | ❌ | ❌ | `DecisionId?` | ❌ |
| **Versioning** |||||
| `previous_version` | ❌ | ❌ | ❌ | ❌ | `DocumentId?` |
| `next_version` | ❌ | ❌ | ❌ | ❌ | `DocumentId?` |

### Auto-Sync Rules

When a forward relationship is set, the reverse is automatically updated:

| When This Changes | Auto-Update |
|-------------------|-------------|
| `Story.parent = M-001` | Add `S-xxx` to `M-001.children` |
| `Task.parent = S-001` | Add `T-xxx` to `S-001.children` |
| `*.depends_on` includes `X` | Add `*` to `X.blocks` |
| `Story.implements = [DOC-001]` | Add `S-xxx` to `DOC-001.implemented_by` |
| `Decision.supersedes = DEC-001` | Set `DEC-001.superseded_by = DEC-xxx` |
| `Document.previous_version = DOC-001` | Set `DOC-001.next_version = DOC-xxx` |

### Relationship Semantics

#### Hierarchy (`parent` / `children`)
- **Purpose:** Containment - "what's in this milestone/story?"
- **Example:** `S-001.parent = M-001` → S-001 is part of milestone M-001
- **Query:** "Show all stories in M-001" → `M-001.children`

#### Dependency (`depends_on` / `blocks`)
- **Purpose:** Prerequisites/sequencing - "what must happen first?"
- **Example:** `S-002.depends_on = [DEC-001, S-001]` → S-002 can't start until DEC-001 is decided and S-001 is done
- **Query:** "What's blocking S-002?" → `S-002.depends_on`
- **Query:** "What does DEC-001 block?" → `DEC-001.blocks`
- **Use cases:**
  - Cross-hierarchy dependencies (story in M-002 depends on story in M-001)
  - Decision prerequisites (work waiting for a decision)
  - Sequential work within same parent

#### Implementation (`implements` / `implemented_by`)
- **Purpose:** Specification delivery - "what work delivers this spec?"
- **Example:** `S-015.implements = [DOC-005]` → S-015 implements the spec in DOC-005
- **Query:** "What implements DOC-005?" → `DOC-005.implemented_by`

#### Supersession (`supersedes` / `superseded_by`)
- **Purpose:** Replacement - "what replaced this decision?"
- **Example:** `DEC-015.supersedes = DEC-001` → DEC-015 replaces DEC-001
- **Query:** "Was DEC-001 superseded?" → `DEC-001.superseded_by`

#### Versioning (`previous_version` / `next_version`)
- **Purpose:** Document evolution - "what's the version history?"
- **Example:** `DOC-005.previous_version = DOC-004` → DOC-005 is the next version of DOC-004
- **Query:** "What came after DOC-004?" → `DOC-004.next_version`

### What Each Entity Can Reference

| Entity | Can Reference |
|--------|---------------|
| **Milestone** | Other Milestones (depends_on), Decisions (depends_on), Documents (implements), Stories (children) |
| **Story** | Milestones (parent), Any entity (depends_on), Documents (implements), Tasks (children) |
| **Task** | Stories (parent), Decisions (depends_on) |
| **Decision** | Other Decisions (depends_on, supersedes, superseded_by) |
| **Document** | Decisions (depends_on), Stories/Milestones (implemented_by), Other Documents (previous_version, next_version) |

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
