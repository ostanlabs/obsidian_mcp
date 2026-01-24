# MCP-Plugin Alignment Requirements

> **Version:** 1.0
> **Date:** January 2026
> **Purpose:** Required changes to align MCP server with Canvas Project Manager Plugin

---

## Executive Summary

The **Canvas Project Manager Plugin** is the source of truth for entity schemas, relationships, and behavior. This document outlines all changes required in the MCP server to achieve full alignment with the plugin's implementation.

**Key Principle:** Plugin documentation supersedes MCP decisions in all cases.

---

## Table of Contents

1. [Schema Changes](#1-schema-changes)
2. [Relationship Field Changes](#2-relationship-field-changes)
3. [Archive Structure Changes](#3-archive-structure-changes)
4. [Workstream Normalization](#4-workstream-normalization)
5. [Transitive Dependency Removal](#5-transitive-dependency-removal)
6. [CSS Class Changes](#6-css-class-changes)
7. [Cycle Detection Alignment](#7-cycle-detection-alignment)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. Schema Changes

### 1.1 Remove `effort` Field from Story Entity

**Current MCP Schema:**
```typescript
interface Story {
  // ... other fields
  effort: string;        // ❌ REMOVE
  workstream: string;    // ✅ KEEP
}
```

**Required Change:**
- **Remove** the `effort` field entirely from Story entity
- **Use** `workstream` field for all organizational grouping
- **Update** all Story creation/update logic to use `workstream` instead of `effort`

**Affected Files:**
- `src/models/v2-types.ts` - Story interface
- `src/services/v2/entity-parser.ts` - Story parsing logic (remove `validateEffort`)
- `obsidian_mcp/docs/ENTITY_SCHEMAS.md` - Story schema documentation
- `obsidian_mcp/docs/MCP_V2_SPEC.md` - Story examples

### 1.2 Ensure All Entities Have `workstream` Field

**Verification Required:**
- ✅ Milestone - has `workstream`
- ✅ Story - has `workstream` (after removing `effort`)
- ✅ Task - has `workstream`
- ✅ Decision - has `workstream`
- ✅ Document - has `workstream`
- ✅ Feature - has `workstream`

---

## 2. Relationship Field Changes

### 2.1 Decision: Change `blocks` → `affects`

**Current MCP Schema:**
```typescript
interface Decision {
  blocks?: EntityId[];  // ❌ INCORRECT
}
```

**Plugin Schema:**
```typescript
interface Decision {
  affects?: EntityId[];  // ✅ CORRECT
}
```

**Required Changes:**
1. **Rename field** `blocks` → `affects` in Decision entity
2. **Update documentation** to note that `enables` is deprecated → migrated to `affects`
3. **Migration note**: `enables` was the old name, `affects` is current, `blocks` was never correct

**Affected Files:**
- `src/models/v2-types.ts` - Decision interface
- `obsidian_mcp/docs/ENTITY_SCHEMAS.md` - Decision schema
- `obsidian_mcp/docs/MCP_V2_SPEC.md` - Decision examples
- All tool implementations that reference Decision.blocks

### 2.2 Verify All Relationship Fields Match Plugin

**From Plugin Documentation:**

| Entity | Field | Target Types | Notes |
|--------|-------|--------------|-------|
| Decision | `affects` | M, S, T, DOC, Decision | ✅ Use this (not `blocks` or `enables`) |
| Decision | `supersedes` | Decision | ✅ Correct |
| Decision | `superseded_by` | Decision | ✅ Auto-synced |
| Document | `documents` | Feature | ✅ Already implemented |
| Document | `implemented_by` | M, S, T | ✅ Correct |
| Feature | `implemented_by` | M, S, T | ✅ Correct |

---

## 3. Archive Structure Changes

### 3.1 Change to Flat Archive Structure

**Current MCP Structure (INCORRECT):**
```
archive/
  2024-Q4/
    M-001_MVP_Launch/
      stories/
        S-042_Premium_Features.md
      tasks/
        T-123_Setup_DB.md
```

**Plugin Structure (CORRECT):**
```
archive/
  milestones/
    M-001_MVP_Launch.md
  stories/
    S-042_Premium_Features.md
  tasks/
    T-123_Setup_DB.md
  decisions/
    DEC-001_Tech_Stack.md
  documents/
    DOC-001_API_Spec.md
  features/
    F-001_Premium_Tier.md
```

**Required Changes:**
1. **Update archive logic** to use flat structure by entity type
2. **Remove** quarter-based and milestone-based nesting
3. **Update** all archive-related tools and documentation

**Affected Files:**
- Archive creation logic in entity lifecycle handlers
- `obsidian_mcp/docs/ENTITY_LIFECYCLE_SPEC.md` - Archive structure examples
- `obsidian_mcp/docs/MCP_V2_SPEC.md` - File structure section


### 5.1 Algorithm Overview

**Purpose:** Remove redundant transitive dependencies from entity `depends_on` arrays.

**Example:**
```
C depends_on: [B, A]
B depends_on: [A]

→ Transitive path: C → B → A
→ Remove redundant: C depends_on: [B]  (remove A)
```

**Why:** Keeps dependency graphs clean and prevents visual clutter on canvas.

### 5.2 Algorithm from Plugin

**From `obsidian_plugin/docs/ENTITY_RELATIONSHIPS_AND_EDGES.md`:**

```
For each entity E:
  1. Build transitive closure of E's dependencies
  2. For each direct dependency D in E.depends_on:
     - Check if D is reachable through any OTHER direct dependency
     - If yes, D is transitive → remove from E.depends_on
  3. Update E's frontmatter with cleaned depends_on array
```

**Detailed Steps:**
1. **Build dependency graph** for all entities
2. **For each entity E** with `depends_on` array:
   - Let `direct_deps = E.depends_on`
   - For each `dep` in `direct_deps`:
     - Build set `reachable_from_others` = all entities reachable from `direct_deps - {dep}`
     - If `dep` is in `reachable_from_others`, mark `dep` as transitive
   - Remove all transitive dependencies from `E.depends_on`
3. **Save updated entities** back to vault

### 5.3 Implementation Requirements

**When to Run:**
- After creating/updating any entity with `depends_on` field
- As part of entity validation before saving
- Optionally: As a batch cleanup tool

**What to Return:**
- If dependencies were removed, inform the Agent:
  ```
  Entity S-042 updated successfully.
  Note: Removed 2 transitive dependencies (A, C) - they are reachable through B.
  ```

**Affected Files:**
- Create new file: `src/services/v2/transitive-dependency-remover.ts`
- Update: All entity creation/update tools
- Update: `src/services/v2/entity-writer.ts`

### 5.4 Edge Cases

**Cycles:**
- If cycle detected, skip transitive removal for entities in cycle
- Log warning about cycle

**Multiple Paths:**
- If A is reachable through both B and C, keep the dependency that appears first in `depends_on` array

---

## 6. CSS Class Changes

### 6.1 Change `canvas-effort-*` → `canvas-workstream-*`

**Current MCP:**
```yaml
cssclasses:
  - canvas-story
  - canvas-effort-engineering  # ❌ INCORRECT
  - canvas-status-in-progress
```

**Plugin Expectation:**
```yaml
cssclasses:
  - canvas-story
  - canvas-workstream-engineering  # ✅ CORRECT
  - canvas-status-in-progress
```

**Required Changes:**
1. Update CSS class generation logic to use `canvas-workstream-{workstream}` pattern
2. Remove all references to `canvas-effort-*` pattern
3. Update documentation examples

**Affected Files:**
- `src/services/v2/entity-writer.ts` - CSS class generation
- `obsidian_mcp/docs/ENTITY_SCHEMAS.md` - CSS class examples
- `obsidian_mcp/docs/MCP_V2_SPEC.md` - Frontmatter examples

### 6.2 CSS Class Pattern

**Complete Pattern:**
```typescript
cssclasses = [
  `canvas-${entity.type}`,              // canvas-milestone, canvas-story, etc.
  `canvas-workstream-${entity.workstream}`,  // canvas-workstream-engineering
  `canvas-status-${normalizeStatus(entity.status)}`,  // canvas-status-in-progress
]
```

---

## 7. Cycle Detection Alignment

### 7.1 Plugin's Cycle Detection Algorithm

**From Plugin Documentation:**

**Detection:**
1. Build directed graph from `depends_on` relationships
2. Run DFS (Depth-First Search) to detect back edges
3. Back edge = cycle detected

**Breaking Strategy:**
1. Identify all cycles in graph
2. For each cycle, find the edge with lowest priority:
   - Priority 1: `parent` relationships (never break)
   - Priority 2: `depends_on` relationships (break if needed)
   - Priority 3: `implements` relationships (break first)
3. Remove lowest-priority edge to break cycle
4. Log warning to user about broken edge

### 7.2 MCP Implementation

**Current State:** MCP may have basic cycle detection but not aligned with plugin's priority system.

**Required Changes:**
1. Implement same priority-based cycle breaking
2. When cycle detected during entity creation/update:
   - Return error to Agent with cycle details
   - Suggest which dependency to remove
   - Do NOT auto-break cycles (let Agent decide)

**Example Response:**
```
Error: Cycle detected in dependencies.
Cycle: S-042 → T-100 → DEC-005 → S-042
Suggestion: Remove one of these dependencies to break the cycle:
  - S-042.depends_on: [DEC-005] (lowest priority)
  - T-100.depends_on: [DEC-005]
```

**Affected Files:**
- Create new file: `src/services/v2/cycle-detector.ts`
- Update: All entity creation/update tools
- Update: Validation logic in entity writer

---

## 8. Implementation Checklist

### 8.1 High Priority (Breaking Changes)

- [ ] **Schema Changes**
  - [ ] Remove `effort` field from Story entity in `v2-types.ts`
  - [ ] Remove `validateEffort` from `entity-parser.ts`
  - [ ] Update Story schema in `ENTITY_SCHEMAS.md`
  - [ ] Update Story examples in `MCP_V2_SPEC.md`

- [ ] **Decision.blocks → Decision.affects**
  - [ ] Rename field in `v2-types.ts`
  - [ ] Update all tool implementations
  - [ ] Update schema documentation
  - [ ] Add migration note about `enables` → `affects`

- [ ] **Archive Structure**
  - [ ] Change to flat structure: `archive/{type}/`
  - [ ] Update archive creation logic
  - [ ] Update `ENTITY_LIFECYCLE_SPEC.md`
  - [ ] Update `MCP_V2_SPEC.md` file structure section

- [ ] **CSS Classes**
  - [ ] Change `canvas-effort-*` → `canvas-workstream-*`
  - [ ] Update CSS class generation in entity writer
  - [ ] Update all documentation examples

### 8.2 Medium Priority (New Features)

- [ ] **Workstream Normalization**
  - [ ] Create `workstream-normalizer.ts` service
  - [ ] Implement normalization mapping
  - [ ] Add normalization to entity creation/update
  - [ ] Return normalization messages to Agent
  - [ ] Add tests for normalization

- [ ] **Transitive Dependency Removal**
  - [ ] Create `transitive-dependency-remover.ts` service
  - [ ] Implement algorithm from plugin docs
  - [ ] Integrate into entity save workflow
  - [ ] Return removal messages to Agent
  - [ ] Add tests for transitive removal

- [ ] **Cycle Detection**
  - [ ] Create `cycle-detector.ts` service
  - [ ] Implement priority-based detection
  - [ ] Return helpful error messages
  - [ ] Add tests for cycle detection

### 8.3 Low Priority (Documentation)

- [ ] **Update All Documentation**
  - [ ] `ENTITY_SCHEMAS.md` - align all schemas
  - [ ] `MCP_V2_SPEC.md` - align all examples
  - [ ] `ENTITY_LIFECYCLE_SPEC.md` - align archive structure
  - [ ] Add reference to plugin docs as source of truth

- [ ] **Add Cross-References**
  - [ ] Link to plugin's `ENTITY_RELATIONSHIPS_AND_EDGES.md`
  - [ ] Link to plugin's `RELATIONSHIP_RULES.md`
  - [ ] Note which features are plugin-only (e.g., canvas positioning)

---

## 9. Testing Requirements

### 9.1 Schema Validation Tests

- [ ] Test Story creation without `effort` field
- [ ] Test Decision creation with `affects` field
- [ ] Test all entities have `workstream` field
- [ ] Test CSS class generation uses `canvas-workstream-*`

### 9.2 Workstream Normalization Tests

- [ ] Test "infrastructure" → "infra"
- [ ] Test "eng" → "engineering"
- [ ] Test canonical values pass through unchanged
- [ ] Test normalization message returned to Agent

### 9.3 Transitive Dependency Tests

- [ ] Test simple transitive removal (C→B→A, remove C→A)
- [ ] Test multiple transitive paths
- [ ] Test no removal when no transitive deps
- [ ] Test cycle handling (skip removal)

### 9.4 Cycle Detection Tests

- [ ] Test simple cycle detection (A→B→C→A)
- [ ] Test priority-based breaking suggestions
- [ ] Test no false positives on DAGs

---

## 10. Migration Notes

### 10.1 Existing Entities with `effort` Field

**Issue:** Existing Story entities in vault may have `effort` field.

**Solution:**
1. MCP should ignore `effort` field when reading entities
2. When updating entity, remove `effort` from frontmatter
3. Use `workstream` value (if `effort` exists but `workstream` doesn't, copy `effort` → `workstream`)

### 10.2 Existing Decisions with `blocks` Field

**Issue:** Existing Decision entities may have `blocks` field instead of `affects`.

**Solution:**
1. When reading Decision, check for both `blocks` and `affects`
2. If `blocks` exists, treat as `affects`
3. When updating Decision, rename `blocks` → `affects` in frontmatter

### 10.3 Existing Archive Structure

**Issue:** Archived entities may be in hierarchical structure.

**Solution:**
1. MCP should be able to read from both old and new structures
2. New archives use flat structure only
3. Optional: Provide migration tool to flatten existing archives

---

## 11. Open Questions

### 11.1 Workstream Normalization Mapping

**Question:** Should the normalization mapping be configurable by user, or hardcoded?

**Recommendation:** Start with hardcoded mapping, add configuration later if needed.

### 11.2 Transitive Dependency Removal Timing

**Question:** Should transitive removal run:
- A) On every entity save (automatic)
- B) Only when explicitly requested (manual)
- C) Both (automatic + manual cleanup tool)

**Recommendation:** Option C - automatic on save + manual cleanup tool for batch processing.

### 11.3 Cycle Detection Behavior

**Question:** Should MCP:
- A) Reject entity creation/update if cycle detected (strict)
- B) Allow creation but warn Agent (permissive)
- C) Auto-break cycle using priority rules (automatic)

**Recommendation:** Option A (strict) - reject with helpful error message. Let Agent fix the issue.

---

## 12. Summary

**Total Changes Required:**

| Category | Count | Priority |
|----------|-------|----------|
| Schema field changes | 2 | High |
| Relationship field renames | 1 | High |
| Archive structure change | 1 | High |
| CSS class pattern change | 1 | High |
| New services to implement | 3 | Medium |
| Documentation updates | 4 | Low |
| Test suites to add | 4 | Medium |

**Estimated Effort:** 2-3 days of development + testing

**Risk Level:** Medium (breaking changes to schema, but well-defined)

---

## 13. References

**Plugin Documentation (Source of Truth):**
- `obsidian_plugin/docs/ENTITY_RELATIONSHIPS_AND_EDGES.md`
- `obsidian_plugin/docs/RELATIONSHIP_RULES.md`

**MCP Documentation (To Be Updated):**
- `obsidian_mcp/docs/ENTITY_SCHEMAS.md`
- `obsidian_mcp/docs/MCP_V2_SPEC.md`
- `obsidian_mcp/docs/ENTITY_LIFECYCLE_SPEC.md`

---

**Document Status:** Draft v1.0
**Next Steps:** Review with team, prioritize implementation, create implementation tasks

### 4.1 Implement Implicit Workstream Name Normalization

**Requirement:** When creating or updating entities, MCP should normalize workstream names to prevent fragmentation.

**Example Issue:**
- Agent creates entity with `workstream: "infrastructure"`
- Existing entities use `workstream: "infra"`
- Result: Two separate workstreams instead of one

**Solution:** Implement normalization mapping with user feedback.

### 4.2 Normalization Rules

**Canonical Workstream Values:**
- `engineering`
- `business`
- `product`
- `infra`
- `research`
- `design`
- `marketing`

**Normalization Mapping:**
```typescript
const WORKSTREAM_NORMALIZATION: Record<string, string> = {
  // Infrastructure variants
  'infrastructure': 'infra',
  'ops': 'infra',
  'devops': 'infra',

  // Engineering variants
  'eng': 'engineering',
  'dev': 'engineering',
  'development': 'engineering',

  // Business variants
  'biz': 'business',

  // Product variants
  'prod': 'product',

  // Keep canonical values as-is
  'engineering': 'engineering',
  'business': 'business',
  'product': 'product',
  'infra': 'infra',
  'research': 'research',
  'design': 'design',
  'marketing': 'marketing',
};
```

### 4.3 Implementation Behavior

**When normalizing:**
1. Convert input to lowercase
2. Apply normalization mapping
3. Return normalized value
4. **Return message to Agent** indicating normalization occurred

**Example Response:**
```
Entity S-042 created successfully.
Note: Workstream "infrastructure" was normalized to "infra" to match existing convention.
```

**Affected Files:**
- Create new file: `src/services/v2/workstream-normalizer.ts`
- Update: All entity creation/update tools
- Update: `src/services/v2/entity-parser.ts`

---

## 5. Transitive Dependency Removal

