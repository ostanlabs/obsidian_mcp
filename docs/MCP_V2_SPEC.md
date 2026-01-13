# Obsidian Project Management MCP - V2 Specification

> **Version:** 2.0
> **Date:** December 2024 (Updated: January 2026)
> **Status:** ✅ IMPLEMENTED
> **Supersedes:** MCP_TECHNICAL_SPEC.md (V1)
>
> **Note:** Some tools documented below have been consolidated or deprecated. See [Tool Consolidation](#tool-consolidation) section for details.

---

## Executive Summary

V2 transforms the MCP from a simple accomplishment tracker into a comprehensive **AI-native product development system** supporting:

- **Hierarchical entities**: Milestones → Stories → Tasks
- **Cross-cutting concerns**: Decisions, Documents (Specs)
- **Workstream organization**: Engineering, Business, Marketing, etc.
- **Implementation handoff**: Package specs for implementing agents
- **Lifecycle management**: Archive completed work to manage context

---

## Table of Contents

1. [Entity Model](#entity-model)
2. [Tool Specification](#tool-specification)
3. [File Structure](#file-structure)
4. [Canvas Organization](#canvas-organization)
5. [Migration Plan](#migration-plan)
6. [Configuration](#configuration)

---

## Entity Model

### Entity Types

| Entity | Prefix | Purpose | Contains |
|--------|--------|---------|----------|
| **Milestone** | `M-xxx` | High-level goal with target date | Stories |
| **Story** | `S-xxx` | Deliverable unit of work | Tasks (inline) |
| **Task** | `T-xxx` | Atomic work item | — |
| **Decision** | `DEC-xxx` | Captured choice/direction | — |
| **Document** | `DOC-xxx` | Spec, ADR, Vision, Guide | — |

### Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RELATIONSHIP TYPES                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  HIERARCHY (parent → children)                                      │
│    Milestone ─contains─▶ Stories ─contains─▶ Tasks                  │
│                                                                     │
│  DEPENDENCY (blocker → blocked)                                     │
│    Any ─blocks─▶ Any  (cross-type, cross-workstream allowed)       │
│    Any ─depends_on─▶ Any  (reverse of blocks)                      │
│                                                                     │
│  IMPLEMENTATION (spec → work)                                       │
│    Document ─implemented_by─▶ Story                                 │
│    Story/Milestone ─implements─▶ Document                          │
│                                                                     │
│  VERSIONING (old → new)                                            │
│    Document ─superseded_by─▶ Document                               │
│    Decision ─supersedes─▶ Decision                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Common Fields (All Entities)

```yaml
id: string              # Unique identifier (M-001, S-015, DEC-003, etc.)
title: string           # Display name
type: enum              # milestone | story | task | decision | document
status: string          # Type-specific status
workstream: string      # Engineering | Business | Marketing | etc.
created_at: datetime    # ISO 8601
updated_at: datetime    # ISO 8601
archived: boolean       # Soft-delete flag
canvas_source: string   # Parent canvas file path
cssclasses: string[]    # Visual styling classes
```

### Milestone Schema

```yaml
---
id: M-001
type: milestone
title: Q1 Product Launch
status: In Progress           # Not Started | In Progress | Completed | Blocked
workstream: engineering
priority: Critical
target_date: 2025-03-31
owner: "@founder"
depends_on: []                # Other milestone IDs
cssclasses:
  - canvas-milestone
  - canvas-effort-business
  - canvas-status-in-progress
created_at: 2024-12-01T00:00:00Z
updated_at: 2024-12-17T00:00:00Z
archived: false
canvas_source: projects/main.canvas
---

# M-001: Q1 Product Launch

## Objective
Launch MVP to first 100 beta users.

## Success Criteria
- [ ] Core features deployed
- [ ] User onboarding flow complete
- [ ] Payment integration live

## Notes
...
```

### Story Schema

```yaml
---
id: S-015
type: story
title: Implement Premium Features
status: Not Started           # Not Started | In Progress | Completed | Blocked
effort: Engineering           # Engineering | Business | Infra | Research | etc.
priority: High
workstream: engineering
parent: M-001                 # Milestone ID
depends_on:                   # Other story/decision IDs
  - DEC-001
  - S-012
implements:                   # Document IDs this story implements
  - DOC-005
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
- [ ] Stripe integration complete
- [ ] Premium feature flags working
- [ ] Upgrade flow tested

## Tasks

### Task 1: Setup Stripe SDK
- **Goal:** Stripe SDK integrated and configured
- **Status:** Open
- **Estimate:** 4h

### Task 2: Implement Subscription Logic
- **Goal:** Users can subscribe/unsubscribe
- **Status:** Open
- **Estimate:** 8h

## Notes
...
```

### Task Schema (Standalone)

```yaml
---
id: T-042
type: task
title: Setup PostgreSQL Database
status: Open                  # Open | InProgress | Complete | OnHold
parent: S-015                 # Story ID
workstream: engineering
estimate_hrs: 4
actual_hrs: 0
assignee: "@jane"
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
...

## Technical Notes
...

## Notes
...
```

### Decision Schema

```yaml
---
id: DEC-001
type: decision
title: Premium Feature Set Definition
status: Decided               # Pending | Decided | Superseded
workstream: business
decided_by: "@founder"
decided_on: 2024-12-10
supersedes: null              # Previous decision ID if any
blocks:                       # What this decision blocks (entities waiting on this)
  - S-015
  - DOC-005
  - MKT-003
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

## Consequences
- Engineering can proceed with S-015
- Marketing can finalize pricing page
- Need to update documentation

## Alternatives Considered
1. **All features free, charge for usage** — Rejected: harder to predict revenue
2. **Feature-based pricing** — Rejected: too complex for MVP
```

### Document Schema

```yaml
---
id: DOC-005
type: document
doc_type: spec               # spec | adr | vision | guide | research
title: Premium Features Technical Spec
status: Approved             # Draft | Review | Approved | Superseded
workstream: engineering
version: 2
supersedes_decision: DEC-015  # Decision that caused this version
previous_versions:
  - version: 1
    date: 2024-11-15
    superseded_by: DEC-015
owner: "@tech-lead"
implementation_context:
  required:                   # Must include in implementation package
    - DOC-001                 # System Architecture
    - DEC-001                 # Premium Feature Set
  reference:                  # Include summary, not full content
    - DOC-002                 # API Guidelines
  assumes:                    # List for awareness, don't include content
    - AUTH-SPEC               # Auth system (separate)
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

## Overview
...

## Requirements
...

## Technical Design
...

## API Contracts
...

## Acceptance Criteria
- [ ] All premium endpoints protected
- [ ] Subscription state synced with Stripe
- [ ] Feature flags respect subscription tier
```

---

## Tool Specification

### Category 1: Entity Management

#### `create_entity`

Create a new entity with optional dependencies and relationships.

```typescript
create_entity({
  type: 'milestone' | 'story' | 'task' | 'decision' | 'document',
  data: {
    title: string,
    workstream: string,
    // Type-specific fields...
    parent?: string,              // Parent entity ID (hierarchy, auto-syncs children)
    depends_on?: string[],        // Blocker IDs (auto-syncs blocks on target)
    implements?: string[],        // Document IDs (auto-syncs implemented_by)
    blocks?: string[],            // Entity IDs this blocks (auto-syncs depends_on)
  },
  options?: {
    canvas_source?: string,       // Default: env.DEFAULT_CANVAS
    add_to_canvas?: boolean,      // Default: true
  }
})

// Returns:
{
  id: string,
  entity: EntityFull,
  dependencies_created: number,
  canvas_node_added: boolean,
}
```

#### `update_entity`

Update entity fields and/or modify relationships. All bidirectional relationships auto-sync.

```typescript
update_entity({
  id: string,
  data?: {
    title?: string,
    status?: string,
    // Any field updates...
  },
  add_dependencies?: string[],    // Add new blockers (auto-syncs blocks on target)
  remove_dependencies?: string[], // Remove blockers
  add_to?: {                      // Add relationships
    implements?: string[],        // Auto-syncs implemented_by
    blocks?: string[],            // Auto-syncs depends_on on target
  },
  remove_from?: {                 // Remove relationships
    implements?: string[],
    blocks?: string[],
  },
})

// Returns:
{
  id: string,
  entity: EntityFull,
  dependencies_added: number,
  dependencies_removed: number,
}
```

#### `update_entity_status`

Dedicated status update with optional note.

```typescript
update_entity_status({
  id: string,
  status: string,                 // Type-appropriate status
  note?: string,                  // Reason for change (logged)
  cascade?: boolean,              // If completing, check if parent should complete
})

// Returns:
{
  id: string,
  old_status: string,
  new_status: string,
  cascaded_updates: string[],     // IDs of entities auto-updated
}
```

#### `archive_milestone`

Archive a milestone and all its children.

```typescript
archive_milestone({
  milestone_id: string,
  archive_folder?: string,        // Default: "{year}-Q{quarter}"
})

// Returns:
{
  milestone_id: string,
  archived_entities: {
    milestones: string[],
    stories: string[],
    tasks: string[],
  },
  total_archived: number,
  archive_path: string,
}
```

#### `archive_entity`

Archive a single entity.

```typescript
archive_entity({
  id: string,
  force?: boolean,                // Required if entity has children
})

// Returns:
{
  id: string,
  archived: boolean,
  archive_path: string,
}
```

#### `restore_from_archive`

Restore an archived entity.

```typescript
restore_from_archive({
  id: string,
  restore_children?: boolean,     // For milestones
})

// Returns:
{
  id: string,
  restored: boolean,
  restored_children: string[],
}
```

### Category 2: Batch Operations

#### `batch_operations`

Create multiple entities with relationships in one call.

```typescript
batch_operations({
  entities: [
    {
      type: string,
      data: {
        title: string,
        parent?: string | "$0" | "$1",      // $N references previous entity
        depends_on?: (string | "$N")[],
        // ...other fields
      }
    },
    // ...more entities
  ],
  dependencies?: [                          // Additional explicit dependencies
    { from: string | "$N", to: string | "$N", type: 'blocks' },
  ],
  options?: {
    atomic?: boolean,                       // All or nothing (default: true)
    add_to_canvas?: boolean,
    canvas_source?: string,
  }
})

// Returns:
{
  created: [
    { ref: "$0", id: "M-005", type: "milestone" },
    { ref: "$1", id: "S-030", type: "story" },
    // ...
  ],
  dependencies_created: number,
  canvas_nodes_added: number,
}
```

#### `batch_update_status`

Update status of multiple entities.

```typescript
batch_update_status({
  updates: [
    { id: string, status: string, note?: string },
    // ...
  ],
  options?: {
    auto_cascade?: boolean,       // Auto-complete parents if all children done
  }
})

// Returns:
{
  updated: string[],
  cascaded: string[],
  failed: { id: string, error: string }[],
}
```

#### `batch_archive`

Archive multiple milestones/entities.

```typescript
batch_archive({
  milestone_ids?: string[],
  entity_ids?: string[],
  options?: {
    archive_folder?: string,
    remove_from_canvas?: boolean,
  }
})

// Returns:
{
  archived: {
    milestones: string[],
    stories: string[],
    tasks: string[],
    decisions: string[],
    documents: string[],
  },
  total_archived: number,
}
```

### Category 3: Project Understanding

#### `get_project_overview`

High-level project status.

```typescript
get_project_overview({
  include_completed?: boolean,    // Default: true (grayed in counts)
  include_archived?: boolean,     // Default: false
  canvas_source?: string,
})

// Returns:
{
  summary: {
    milestones: { total, completed, in_progress, blocked },
    stories: { total, completed, in_progress, blocked },
    tasks: { total, completed, in_progress, blocked },
    decisions: { total, pending, decided },
    documents: { total, draft, approved },
  },
  workstreams: {
    [name]: {
      health: 'healthy' | 'at_risk' | 'blocked',
      progress_percent: number,
      blocked_count: number,
    }
  },
  pending_decisions: number,
  ready_for_implementation: number,
}
```

#### `get_workstream_status`

Detailed view of a single workstream.

```typescript
get_workstream_status({
  workstream: string,
  include_completed?: boolean,
  group_by?: 'status' | 'type' | 'priority',
})

// Returns:
{
  workstream: string,
  summary: {
    total: number,
    by_status: Record<string, number>,
    by_type: Record<string, number>,
    blocked_count: number,
    cross_workstream_dependencies: number,
  },
  groups: [
    {
      group_key: string,
      entities: EntitySummary[],
    }
  ],
  blocking_other_workstreams: EntitySummary[],
  blocked_by_other_workstreams: EntitySummary[],
}
```

#### `analyze_project_state`

Comprehensive analysis with blockers and suggested actions.

```typescript
analyze_project_state({
  workstream?: string,            // Filter to workstream
  focus?: 'blockers' | 'actions' | 'both',
  depth?: 'summary' | 'detailed',
})

// Returns:
{
  health: {
    overall: 'healthy' | 'at_risk' | 'blocked',
    workstreams: {
      [name]: {
        status: string,
        progress: number,
        blocker_count: number,
      }
    }
  },
  
  blockers: {
    critical_path: [
      {
        blocker: EntitySummary,
        impact: {
          directly_blocks: string[],
          cascade_blocks: string[],
          total_blocked: number,
          workstreams_affected: string[],
        },
        suggested_resolution: string,
        days_blocked: number,
      }
    ],
    by_type: {
      pending_decisions: EntitySummary[],
      incomplete_specs: EntitySummary[],
      external_dependencies: EntitySummary[],
    },
    stale_items: EntitySummary[],
  },
  
  suggested_actions: [
    {
      priority: number,
      action: string,
      reason: string,
      effort: 'low' | 'medium' | 'high',
      owner_hint: string,
    }
  ],
  
  stats: {
    decisions_pending: number,
    specs_ready: number,
    items_blocked: number,
    items_completed_this_week: number,
  }
}
```

### Category 4: Search & Navigation

#### `search_entities`

Full-text search with filters.

```typescript
search_entities({
  query: string,
  filters?: {
    type?: string[],
    status?: string[],
    workstream?: string[],
    effort?: string[],
    archived?: boolean,           // Default: false
  },
  limit?: number,                 // Default: 20
  include_content?: boolean,      // Default: false
})

// Returns:
{
  results: [
    {
      id: string,
      type: string,
      title: string,
      status: string,
      workstream: string,
      relevance_score: number,
      snippet: string,            // Matching excerpt
      parent?: string,
      path: string,
    }
  ],
  total_matches: number,
}
```

#### `get_entity_summary`

Quick overview without full content.

```typescript
get_entity_summary({
  id: string,
})

// Returns:
{
  id: string,
  type: string,
  title: string,
  status: string,
  workstream: string,
  effort?: string,
  priority?: string,
  parent?: { id: string, title: string },
  children_count: number,
  dependencies: {
    blocks: string[],
    blocked_by: string[],
  },
  task_progress?: {
    total: number,
    completed: number,
  },
  last_updated: string,
}
```

#### `get_entity_full`

Complete entity with content and relationships.

```typescript
get_entity_full({
  id: string,
  include_children?: boolean,     // Include child summaries
  include_dependencies?: boolean, // Include dependency details
  depth?: number,                 // Traversal depth (default: 1)
})

// Returns:
{
  // All summary fields plus:
  content: string,                // Full markdown content
  acceptance_criteria?: string[],
  tasks?: TaskInfo[],             // For stories
  children?: EntitySummary[],
  dependency_details?: {
    blocks: EntitySummary[],
    blocked_by: EntitySummary[],
  },
  implementation_context?: {      // For documents
    required: EntitySummary[],
    reference: EntitySummary[],
    assumes: string[],
  },
}
```

#### `navigate_hierarchy`

Traverse entity tree.

```typescript
navigate_hierarchy({
  from_id: string,
  direction: 'up' | 'down' | 'siblings' | 'dependencies',
  depth?: number,
  include_content?: boolean,
})

// Returns:
{
  origin: EntitySummary,
  results: EntitySummary[],
  path_description: string,       // "M-001 → S-015 → T-042"
}
```

### Category 5: Decision & Document Management

#### `create_decision`

Log a decision.

```typescript
create_decision({
  title: string,
  context: string,
  decision: string,               // The actual decision made
  rationale: string,
  workstream: string,
  decided_by: string,
  blocks?: string[],              // What this blocks (entities waiting on this)
  supersedes?: string,            // Previous decision ID (auto-syncs superseded_by)
  affects_documents?: string[],   // Documents that may need updating
})

// Returns:
{
  id: string,
  decision: DecisionFull,
  blocked_count: number,
  stale_documents: string[],      // Docs that reference old decisions
}
```

#### `get_decision_history`

Query decisions by topic.

```typescript
get_decision_history({
  topic?: string,                 // Search term
  workstream?: string,
  include_superseded?: boolean,   // Default: false
  include_archived?: boolean,     // Default: true (decisions are reference)
})

// Returns:
{
  decisions: [
    {
      id: string,
      title: string,
      status: string,
      decided_on: string,
      blocks: string[],
      superseded_by?: string,
    }
  ],
  decision_chains: [              // Linked decisions
    {
      current: string,
      history: string[],
    }
  ],
}
```

#### `supersede_document`

Replace a document with a new version.

```typescript
supersede_document({
  document_id: string,
  decision_id: string,            // Decision that triggered this
  new_content: string,            // New document content
  change_summary: string,
})

// Returns:
{
  document_id: string,
  new_version: number,
  decision_id: string,
  previous_version_ref: string,   // Git commit or archive reference
}
```

#### `get_document_history`

Get version history of a document.

```typescript
get_document_history({
  document_id: string,
})

// Returns:
{
  document_id: string,
  current_version: number,
  history: [
    {
      version: number,
      date: string,
      supersedes_decision?: string,
      change_summary: string,
      git_ref?: string,
    }
  ],
}
```

#### `check_document_freshness`

Check if document needs updating.

```typescript
check_document_freshness({
  document_id: string,
})

// Returns:
{
  document_id: string,
  is_fresh: boolean,
  stale_reasons: [
    {
      type: 'newer_decision' | 'referenced_doc_changed' | 'todo_items',
      detail: string,
      entity_id?: string,
    }
  ],
  suggested_updates: string[],
}
```

### Category 6: Implementation Handoff

#### `get_ready_for_implementation`

Find specs ready for implementing agents.

```typescript
get_ready_for_implementation({
  workstream?: string,
  priority?: string[],
})

// Returns:
{
  ready: [
    {
      id: string,
      title: string,
      type: string,
      readiness_score: 100,
      checklist: {
        all_decisions_made: boolean,
        no_blocking_dependencies: boolean,
        acceptance_criteria_defined: boolean,
        no_open_todos: boolean,
        status_approved: boolean,
      },
      implementation_estimate: string,
      suggested_start: string,
    }
  ],
  almost_ready: [
    {
      id: string,
      title: string,
      readiness_score: number,
      blockers: [
        { type: string, id?: string, detail: string }
      ],
      what_to_resolve: string,
    }
  ],
  not_ready_count: number,
}
```

#### `generate_implementation_package`

Create context bundle for implementing agent.

```typescript
generate_implementation_package({
  spec_id: string,
})

// Returns:
{
  primary_spec: {
    id: string,
    title: string,
    content: string,              // Full spec content
  },
  required_context: [             // Full content of required docs
    {
      id: string,
      title: string,
      content: string,
      relevance: string,          // Why this is included
    }
  ],
  reference_links: [              // Summaries only
    {
      id: string,
      title: string,
      summary: string,
      path: string,
    }
  ],
  related_systems: string[],      // Names only (assumes section)
  decisions: [                    // Relevant decisions
    {
      id: string,
      title: string,
      decision: string,
      rationale: string,
    }
  ],
  acceptance_criteria: string[],
  constraints: string[],          // Extracted constraints
  open_items: [                   // Things to watch out for
    {
      type: 'pending_decision' | 'assumption' | 'risk',
      detail: string,
    }
  ],
}
```

#### `validate_spec_completeness`

Check if spec is ready for handoff.

```typescript
validate_spec_completeness({
  spec_id: string,
})

// Returns:
{
  spec_id: string,
  is_complete: boolean,
  score: number,                  // 0-100
  checks: {
    has_acceptance_criteria: boolean,
    all_todos_resolved: boolean,
    dependencies_met: boolean,
    decisions_made: boolean,
    status_approved: boolean,
    implementation_context_defined: boolean,
  },
  issues: [
    {
      severity: 'error' | 'warning',
      check: string,
      detail: string,
      suggestion: string,
    }
  ],
}
```

---

## Tool Consolidation

> **Updated:** January 2026

The following tools have been consolidated or deprecated to simplify the API:

### Deprecated Tools → Replacements

| Deprecated Tool | Replacement | Notes |
|-----------------|-------------|-------|
| `batch_operations` | `batch_update` | Use `ops` array with `op: 'create'` |
| `batch_update_status` | `batch_update` | Use `ops` array with `op: 'update'` and `payload: { status: ... }` |
| `batch_archive` | `batch_update` | Use `ops` array with `op: 'archive'` |
| `get_entity_summary` | `get_entity` | Use `fields` parameter to select summary fields |
| `get_entity_full` | `get_entity` | Use `fields` parameter to select all fields |
| `navigate_hierarchy` | `search_entities` | Use `from_id` and `direction` parameters |
| `create_decision` | `create_entity` | Use `type: 'decision'` |
| `get_workstream_status` | `get_project_overview` | Consolidated into project overview |

### Removed Tools (Category 6: Implementation Handoff)

The following tools were removed as the full implementation handoff algorithm was not completed:

- `get_ready_for_implementation` - REMOVED
- `generate_implementation_package` - REMOVED
- `validate_spec_completeness` - REMOVED

See `IMPLEMENTATION_PACKAGE_SPEC.md` for the original design if this functionality is needed in the future.

### Current Active Tools

**Category 1: Entity Management**
- `create_entity` - Create any entity type
- `update_entity` - Update entity fields and relationships
- `update_entity_status` - Dedicated status update
- `archive_milestone` - Archive milestone with children
- `archive_entity` - Archive single entity
- `restore_from_archive` - Restore archived entity

**Category 2: Batch Operations**
- `batch_update` - Unified batch operations (create, update, archive)

**Category 3: Project Understanding**
- `get_project_overview` - High-level project status
- `analyze_project_state` - Comprehensive analysis with blockers

**Category 4: Search & Navigation**
- `search_entities` - Full-text search with filters and hierarchy navigation
- `get_entity` - Get entity with configurable field selection

**Category 5: Decision & Document Management**
- `get_decision_history` - Query decisions by topic
- `supersede_document` - Replace document with new version
- `get_document_history` - Get version history
- `check_document_freshness` - Check if document needs updating
- `manage_documents` - Consolidated document management operations

**Utility Tools**
- `read_docs` - Read documentation files
- `update_doc` - Update documentation files
- `list_workspaces` - List available workspaces
- `list_files` - List files in a directory

---

## File Structure

### Active Entities

```
vault/
├── accomplishments/
│   ├── milestones/
│   │   └── M-001_Q1_Launch.md
│   ├── stories/
│   │   └── S-015_Premium_Features.md
│   ├── tasks/
│   │   └── T-042_Setup_DB.md
│   ├── decisions/
│   │   └── DEC-001_Pricing_Model.md
│   └── documents/
│       └── DOC-005_Premium_Spec.md
│
├── archive/
│   └── 2024-Q4/
│       ├── M-001_MVP_Launch/
│       │   ├── _milestone.md
│       │   ├── stories/
│       │   └── tasks/
│       └── decisions/
│
└── projects/
    └── main.canvas
```

### Naming Convention

- **Files:** `{Title_Underscored}.md` (ID is stored in frontmatter, not filename)
- **Archive folders:** `{Year}-Q{Quarter}/` or `{Year}-{Month}/`
- **Milestone archives:** Include all children in milestone subfolder


## Canvas Organization

### Visual Differentiation Strategy

Canvas nodes are visually differentiated through **CSS classes** applied via markdown frontmatter, not through canvas groups. This approach is simpler and more flexible.

**Entity Type** → Border thickness and node size
**Workstream/Effort** → Border color (via CSS classes)
**Status** → Visual indicators (opacity, badges, animations)

### Canvas Layout

Nodes are positioned based on:
1. **Dependency depth** — blockers to the left, blocked items to the right
2. **Workstream clustering** — items of the same workstream positioned near each other
3. **Dependency edges** — arrows showing relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐         ┌─────────┐            │
│   │ DEC-001 │───▶│ S-001   │───▶│ S-002   │────────▶│ S-003   │            │
│   │ (purple)│    │ (blue)  │    │ (blue)  │         │ (blue)  │            │
│   └─────────┘    └─────────┘    └─────────┘         └─────────┘            │
│                       │                                   │                 │
│                       ▼                                   ▼                 │
│                  ┌─────────┐                         ┌─────────┐            │
│                  │ T-001   │                         │ T-002   │            │
│                  │ (blue)  │                         │ (blue)  │            │
│                  └─────────┘                         └─────────┘            │
│                                                                              │
│   Border colors indicate workstream:                                         │
│   Blue = Engineering, Purple = Business, Orange = Infra, etc.               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Canvas JSON Structure

```json
{
  "nodes": [
    {
      "id": "node-s001",
      "type": "file",
      "file": "accomplishments/stories/S-001_Auth.md",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 150
    },
    {
      "id": "node-s002", 
      "type": "file",
      "file": "accomplishments/stories/S-002_API.md",
      "x": 350,
      "y": 100,
      "width": 200,
      "height": 150
    }
  ],
  "edges": [
    {
      "id": "edge-s001-s002",
      "fromNode": "node-s001",
      "toNode": "node-s002",
      "fromSide": "right",
      "toSide": "left"
    }
  ]
}
```

> **Note:** Canvas groups (`type: "group"`) are supported by Obsidian but not required for this workflow. Visual differentiation is achieved through CSS styling of individual nodes based on their frontmatter `cssclasses`.


}
```

---

## Migration Plan

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MIGRATION PHASES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 0: Preparation                                                        │
│  ├── Backup vault                                                           │
│  ├── Document current state                                                 │
│  └── Install V2 MCP alongside V1                                            │
│                                                                              │
│  Phase 1: Schema Migration                                                   │
│  ├── Add new fields to existing accomplishments                             │
│  ├── Assign workstreams                                                     │
│  └── Add cssclasses                                                         │
│                                                                              │
│  Phase 2: Entity Reorganization                                              │
│  ├── Convert top-level accomplishments → Milestones                         │
│  ├── Convert dependent accomplishments → Stories                            │
│  ├── Create folder structure                                                │
│  └── Update canvas node positions                                           │
│                                                                              │
│  Phase 3: Tool Migration                                                     │
│  ├── Deprecate V1 tools                                                     │
│  ├── Enable V2 tools                                                        │
│  └── Update any integrations                                                │
│                                                                              │
│  Phase 4: New Features                                                       │
│  ├── Create initial Decisions from existing notes                           │
│  ├── Create initial Documents (specs)                                       │
│  └── Set up archive structure                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 0: Preparation

#### Step 0.1: Backup

```bash
# Backup entire vault
cp -r /path/to/vault /path/to/vault-backup-$(date +%Y%m%d)

# Export current state via MCP
mcp call get_project_status > project_state_backup.json
mcp call list_accomplishments > accomplishments_backup.json
```

#### Step 0.2: Audit Current State

Run migration audit tool:

```typescript
// New tool for migration
audit_for_migration({})

// Returns:
{
  accomplishment_count: number,
  with_dependencies: number,
  without_dependencies: number,
  suggested_milestones: string[],    // ACC-IDs with no dependencies
  suggested_stories: string[],       // ACC-IDs with dependencies
  workstream_hints: {
    // Based on effort field
    engineering: string[],
    business: string[],
    // ...
  },
  canvas_files: string[],
  estimated_migration_time: string,
}
```

### Phase 1: Schema Migration

#### Step 1.1: Add New Fields

Migration tool updates each accomplishment:

```typescript
migrate_entity_schema({
  entity_id: string,
  workstream: string,              // User provides
  convert_to?: 'milestone' | 'story',
})

// Transforms:
// BEFORE (V1):
{
  type: "accomplishment",
  id: "ACC-001",
  effort: "Engineering",
  // ...
}

// AFTER (V2):
{
  type: "story",                   // or "milestone"
  id: "S-001",                     // Re-prefixed
  effort: "Engineering",
  workstream: "engineering",
  parent: null,                    // or milestone ID
  cssclasses: [
    "canvas-story",
    "canvas-effort-engineering",
    "canvas-status-not-started"
  ],
  // ... preserved fields
}
```

#### Step 1.2: Batch Migration

```typescript
batch_migrate_schema({
  mappings: [
    { old_id: "ACC-001", new_type: "milestone", workstream: "engineering" },
    { old_id: "ACC-002", new_type: "story", workstream: "engineering", parent: "ACC-001" },
    { old_id: "ACC-003", new_type: "story", workstream: "business", parent: null },
    // ...
  ],
  options: {
    dry_run: boolean,              // Preview changes
    backup_originals: boolean,     // Keep ACC-xxx files
  }
})

// Returns:
{
  migrated: [
    { old_id: "ACC-001", new_id: "M-001", new_path: "milestones/M-001_..." },
    { old_id: "ACC-002", new_id: "S-001", new_path: "stories/S-001_..." },
  ],
  id_mapping: {
    "ACC-001": "M-001",
    "ACC-002": "S-001",
  },
  dependency_updates: number,      // References updated
  canvas_updates: number,          // Nodes updated
}
```

### Phase 2: Entity Reorganization

#### Step 2.1: Create Folder Structure

```typescript
create_v2_folder_structure({
  vault_path: string,
})

// Creates:
// accomplishments/milestones/
// accomplishments/stories/
// accomplishments/tasks/
// accomplishments/decisions/
// accomplishments/documents/
// archive/
```

#### Step 2.2: Move Files

```typescript
reorganize_files({
  id_mapping: Record<string, string>,  // From batch_migrate_schema
})

// Moves files to appropriate folders
// Updates canvas node file references
// Updates all internal links
```

#### Step 2.3: Update Canvas Structure

```typescript
migrate_canvas_to_v2({
  canvas_source: string,
  workstream_layout: {
    engineering: { y_start: 200 },
    business: { y_start: 800 },
    marketing: { y_start: 1400 },
  }
})

// Creates workstream groups
// Repositions nodes within groups
// Preserves dependency edges
```

### Phase 3: Tool Migration

#### Step 3.1: Tool Deprecation

V1 tools that map to V2:

| V1 Tool | V2 Replacement | Notes |
|---------|----------------|-------|
| `manage_accomplishment` | `create_entity`, `update_entity` | Type-aware |
| `manage_dependency` | `update_entity` (add_dependencies) | Integrated |
| `manage_task` | `update_entity` | Tasks inline or separate |
| `set_work_focus` | `update_entity_status` | Simplified |
| `get_accomplishment` | `get_entity_full` | Richer data |
| `list_accomplishments` | `search_entities` | More filters |
| `get_current_work` | `analyze_project_state` | More context |
| `get_blocked_items` | `analyze_project_state` | Unified |
| `get_ready_to_start` | `get_ready_for_implementation` | Spec-aware |
| `get_project_status` | `get_project_overview` | Workstream-aware |
| `batch_operations` | `batch_operations` | Extended |

#### Step 3.2: Deprecation Period

```typescript
// V1 tools emit deprecation warning but still work
{
  warning: "manage_accomplishment is deprecated. Use create_entity or update_entity.",
  result: { /* normal result */ }
}
```

### Phase 4: New Features

#### Step 4.1: Create Initial Decisions

Review existing notes/comments for implicit decisions:

```typescript
suggest_decisions({
  scan_notes: boolean,            // Scan Notes sections
  scan_comments: boolean,         // Scan for decision-like text
})

// Returns suggestions for decisions to create
```

#### Step 4.2: Create Initial Documents

For existing specs/docs:

```typescript
import_as_document({
  source_path: string,            // Existing markdown file
  doc_type: 'spec' | 'adr' | 'vision' | 'guide',
  workstream: string,
  implementation_context: {
    required: string[],
    reference: string[],
  }
})
```

### Migration Rollback

If issues arise:

```typescript
rollback_migration({
  to_backup: string,              // Backup timestamp
})

// Restores from backup
// Reverts canvas changes
// Re-enables V1 tools
```

---

## Configuration

### Environment Variables

```json
{
  "mcpServers": {
    "obsidian-project": {
      "command": "node",
      "args": ["path/to/server-v2.js"],
      "env": {
        "VAULT_PATH": "/path/to/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

Note: Entity folders (milestones/, stories/, tasks/, decisions/, documents/, archive/) are expected to exist in the vault root.

### workspaces.json (Extended)

```json
{
  "accomplishments": {
    "path": "/vault/accomplishments",
    "description": "Project entities (milestones, stories, tasks)",
    "entity_types": ["milestone", "story", "task", "decision", "document"]
  },
  "docs": {
    "path": "/vault/docs",
    "description": "Reference documentation"
  },
  "archive": {
    "path": "/vault/archive",
    "description": "Archived completed work",
    "read_only": true
  }
}
```

### settings.json (Plugin Settings)

```json
{
  "effortTypes": [
    { "id": "engineering", "label": "Engineering", "color": "#3B82F6" },
    { "id": "business", "label": "Business", "color": "#9333EA" },
    { "id": "infra", "label": "Infra", "color": "#F97316" },
    { "id": "research", "label": "Research", "color": "#22C55E" },
    { "id": "design", "label": "Design", "color": "#EC4899" },
    { "id": "marketing", "label": "Marketing", "color": "#EAB308" }
  ],
  "workstreams": [
    "engineering",
    "business", 
    "marketing",
    "operations"
  ],
  "nodeSizes": {
    "milestone": { "width": 280, "height": 200 },
    "story": { "width": 200, "height": 150 },
    "task": { "width": 160, "height": 100 },
    "decision": { "width": 180, "height": 120 },
    "document": { "width": 200, "height": 150 }
  },
  "autoArchive": {
    "enabled": false,
    "completedAfterDays": 30
  }
}
```

---

## Appendix: Type Definitions

```typescript
// Entity Types
type EntityType = 'milestone' | 'story' | 'task' | 'decision' | 'document';

// Status by Type
type MilestoneStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
type StoryStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
type TaskStatus = 'Open' | 'InProgress' | 'Complete' | 'OnHold';
type DecisionStatus = 'Pending' | 'Decided' | 'Superseded';
type DocumentStatus = 'Draft' | 'Review' | 'Approved' | 'Superseded';

// Priority
type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

// Document Types
type DocumentType = 'spec' | 'adr' | 'vision' | 'guide' | 'research';

// Summary vs Full entities
interface EntitySummary {
  id: string;
  type: EntityType;
  title: string;
  status: string;
  workstream: string;
  parent?: { id: string; title: string };
  last_updated: string;
}

interface EntityFull extends EntitySummary {
  content: string;
  // ... all type-specific fields
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0-draft | 2024-12-17 | Initial V2 specification |
