# Obsidian MCP API Improvements - Phase 2

**Issue ID:** OBSIDIAN-MCP-004  
**Priority:** High  
**Type:** Enhancement  
**Date:** 2026-01-14  
**Prerequisite:** OBSIDIAN-MCP-003 (Phase 1 - Completed)

---

## Executive Summary

Phase 1 improvements (OBSIDIAN-MCP-003) successfully implemented:
- ✅ `batch_update` with `include_entities` option
- ✅ `get_feature_coverage` with `summary_only`, `feature_ids`, and `fields` parameters

Phase 2 improvements implemented:
- ✅ Issue #3: `get_entities` bulk fetch tool
- ✅ Issue #5: `get_schema` introspection tool
- ✅ Issue #6: `update_entity` before/after diff (changes array)
- ✅ Issue #10: Pagination `offset` parameter
- ✅ Issue #11: `batch_update` dry_run mode
- ✅ Issue #12: `reconcile_relationships` detailed output
- ✅ BUG: Content duplication on update (fixed)

This document covers remaining improvements and newly discovered issues.

**Estimated Impact:**
- Additional ~15,000 token savings per session
- Reduced API calls by ~20%
- Better debugging experience

---

## P1 - High Priority

### Issue #3: No Bulk get_entity

**Problem:** Fetching multiple entities requires sequential calls.

**Current Behavior:**
```typescript
// To fetch 5 entities:
get_entity { id: "F-001" }  // Call 1
get_entity { id: "F-002" }  // Call 2
get_entity { id: "F-003" }  // Call 3
get_entity { id: "F-004" }  // Call 4
get_entity { id: "F-005" }  // Call 5
// 5 round-trips, ~2,500 tokens
```

**Proposed Fix:** Add `get_entities` tool (note: already documented in tool schema but returns UNKNOWN_TOOL)

```typescript
get_entities { 
  ids: ["F-001", "F-002", "F-003", "F-004", "F-005"],
  fields: ["id", "title", "phase", "status"]
}

// Response:
{
  "entities": {
    "F-001": { "id": "F-001", "title": "MCP Frontend", "phase": "MVP", "status": "Complete" },
    "F-002": { "id": "F-002", "title": "Workflow Engine", "phase": "MVP", "status": "Complete" },
    "F-003": { "id": "F-003", "title": "Tool Invoker", "phase": "MVP", "status": "Complete" },
    "F-004": { "id": "F-004", "title": "Python Exec Sandbox", "phase": "MVP", "status": "Complete" },
    "F-005": { "id": "F-005", "title": "Template Engine", "phase": "MVP", "status": "Complete" }
  },
  "not_found": []
}
// 1 round-trip, ~600 tokens
```

**Token Savings:** ~75% reduction for bulk fetches

**Implementation Notes:**
- Tool is already defined in schema but not wired up
- Should support same `fields` parameter as `get_entity`
- Return entities keyed by ID for easy lookup
- Include `not_found` array for missing IDs

**Effort:** Low (tool defined, needs wiring)  
**Impact:** High

---

### Issue #4: search_entities `fields` Parameter Not Working

**Problem:** The `fields` parameter is accepted but ignored.

**Current Behavior:**
```typescript
// Request
search_entities { 
  filters: { type: ["feature"] },
  fields: ["id", "title", "phase"],  // Ignored!
  limit: 5
}

// Response - always returns default fields
{
  "results": [
    {
      "id": "F-028",
      "type": "feature",
      "title": "Advanced Retry",
      "status": "Planned",
      "workstream": "engineering"
      // Missing: phase (requested)
      // Extra: type, status, workstream (not requested)
    }
  ]
}
```

**Expected Behavior:**
```typescript
{
  "results": [
    {
      "id": "F-028",
      "title": "Advanced Retry",
      "phase": "4"
    }
  ]
}
```

**Implementation Notes:**
- Parameter exists in tool definition
- Need to filter response fields based on input
- Should work like `get_feature_coverage` fields parameter (which works)

**Effort:** Low  
**Impact:** Medium

---

## P2 - Medium Priority

### Issue #5: No Schema Introspection

**Problem:** No way to discover entity schemas without reading source code.

**Current Workaround:**
```typescript
// Have to read TypeScript source
filesystem:read_text_file { path: "src/models/v2-types.ts" }
// ~3,000 tokens just to learn field names
```

**Proposed Fix:** Add `get_schema` tool

```typescript
get_schema { entity_type: "feature" }

// Response:
{
  "type": "feature",
  "id_pattern": "F-XXX",
  "fields": {
    "id": { "type": "FeatureId", "required": true },
    "title": { "type": "string", "required": true },
    "tier": { "type": "enum", "values": ["OSS", "Premium"], "default": "OSS" },
    "phase": { "type": "enum", "values": ["MVP", "0", "1", "2", "3", "4", "5"], "default": "MVP" },
    "status": { "type": "enum", "values": ["Planned", "In Progress", "Complete", "Deferred"] },
    "documented_by": { 
      "type": "DocumentId[]",
      "relationship": { "inverse": "Document.documents", "auto_sync": true }
    },
    "implemented_by": {
      "type": "(MilestoneId | StoryId)[]",
      "relationship": { "inverse": "*.implements", "auto_sync": true }
    }
  },
  "lifecycle": {
    "statuses": ["Planned", "In Progress", "Complete", "Deferred"],
    "transitions": {
      "Planned": ["In Progress", "Deferred"],
      "In Progress": ["Complete", "Blocked"],
      "Complete": [],
      "Deferred": ["Planned"]
    }
  }
}
```

**Additional Options:**
```typescript
// Get all schemas
get_schema { all: true }

// Get relationship map
get_schema { relationships_only: true }
```

**Effort:** Medium  
**Impact:** Medium

---

### Issue #6: update_entity No Before/After Diff

**Problem:** After updating, can't see what actually changed without comparing manually.

**Current Behavior:**
```typescript
update_entity { id: "F-010", data: { implemented_by: ["M-014", "M-029"] } }

// Response - only shows current state
{
  "id": "F-010",
  "entity": {
    "implemented_by": ["M-014", "M-029"]
    // Was it ["M-014"] before? Or already ["M-014", "M-029"]?
  }
}
```

**Proposed Fix:**
```typescript
{
  "id": "F-010",
  "changes": [
    { 
      "field": "implemented_by", 
      "before": ["M-014"], 
      "after": ["M-014", "M-029"],
      "added": ["M-029"],
      "removed": []
    }
  ],
  "side_effects": [
    {
      "entity_id": "M-029",
      "field": "implements", 
      "action": "added",
      "value": "F-010"
    }
  ],
  "entity": { ... }
}
```

**Effort:** Low  
**Impact:** Medium

---

### Issue #10: Pagination Missing `offset`

**Problem:** `limit` works but no way to page through results.

**Current Behavior:**
```typescript
search_entities { filters: { type: ["task"] }, limit: 20 }
// Returns first 20, total_matches: 107
// No way to get next 20
```

**Proposed Fix:**
```typescript
search_entities { 
  filters: { type: ["task"] },
  limit: 20,
  offset: 20  // ADD THIS
}

// Response:
{
  "results": [ /* tasks 21-40 */ ],
  "total_matches": 107,
  "pagination": {
    "offset": 20,
    "limit": 20,
    "has_more": true
  }
}
```

**Effort:** Low  
**Impact:** Medium

---

## P3 - Nice to Have

### Issue #7: reconcile_relationships Minimal Output

**Current Behavior:**
```typescript
reconcile_relationships { dry_run: false }
// Response:
{ "scanned": 302, "updated": 0, "details": [] }
```

**Proposed Fix:**
```typescript
{
  "scanned": 302,
  "updated": 3,
  "changes": [
    { 
      "entity_id": "F-001", 
      "field": "documented_by", 
      "action": "added",
      "values": ["DOC-021"],
      "reason": "Synced from DOC-021.documents"
    }
  ],
  "warnings": [
    { "entity_id": "F-099", "issue": "References non-existent DOC-999" }
  ]
}
```

**Effort:** Low  
**Impact:** Low

---

### Issue #8: batch_update dry_run Not Implemented

**Current Behavior:**
```typescript
batch_update { 
  ops: [{ id: "F-002", op: "update", payload: { tier: "OSS" } }],
  options: { dry_run: true }  // Ignored - actually executes!
}
```

**Proposed Fix:**
```typescript
{
  "dry_run": true,
  "would_update": [
    {
      "id": "F-002",
      "changes": [{ "field": "tier", "before": "OSS", "after": "OSS" }],
      "side_effects": []
    }
  ],
  "validation_errors": []
}
```

**Effort:** Low  
**Impact:** Low

---

## NEW: Bug Fixes Discovered

### Issue #11: Status "Unknown" in Update Responses

**Problem:** Entity status shows "Unknown" in update/batch_update responses even when entity has valid status.

**Current Behavior:**
```typescript
update_entity { id: "F-003", data: { tier: "OSS" } }

// Response:
{
  "entity": {
    "id": "F-003",
    "status": "Unknown",  // BUG: Should be "Complete"
    "workstream": "",     // BUG: Should be "engineering"
    ...
  }
}
```

**Actual File (F-003):**
```yaml
---
id: F-003
status: Complete
workstream: engineering
---
```

**Root Cause:** Likely not re-parsing the file after update, returning stale/incomplete entity object.

**Expected Behavior:** Response should reflect actual persisted values.

**Effort:** Low  
**Impact:** High (causes confusion, requires extra verification calls)

---

### Issue #12: Workstream Empty in Responses

**Problem:** Same as #11 - `workstream: ""` appears in update responses.

**Likely Same Root Cause:** Entity not fully loaded after update.

---

### Issue #13: Content Always Empty

**Problem:** `content: ""` returned even when entity has markdown content.

**Current Behavior:**
```typescript
get_entity { id: "F-001", fields: ["id", "content"] }

// Response:
{
  "id": "F-001",
  "content": ""  // Empty even though file has content
}
```

**Actual File:**
```markdown
---
id: F-001
...
---

## Description
This feature provides MCP server capabilities...
```

**Proposed Fix:** Parse and return markdown content below frontmatter.

**Note:** May be intentional for performance - if so, add `include_content: true` option.

**Effort:** Low  
**Impact:** Medium

---

## Implementation Priority

### Phase 2a - Quick Wins (Bug Fixes)

| Issue | Description | Effort | Impact |
|-------|-------------|--------|--------|
| #11 | Status "Unknown" bug | Low | High |
| #12 | Workstream empty bug | Low | High |
| #4 | search_entities fields | Low | Medium |

### Phase 2b - High Value Features

| Issue | Description | Effort | Impact |
|-------|-------------|--------|--------|
| #3 | get_entities bulk | Low | High |
| #10 | Pagination offset | Low | Medium |

### Phase 2c - Medium Value

| Issue | Description | Effort | Impact |
|-------|-------------|--------|--------|
| #6 | update_entity diff | Low | Medium |
| #13 | Content field | Low | Medium |
| #5 | get_schema | Medium | Medium |

### Phase 2d - Nice to Have

| Issue | Description | Effort | Impact |
|-------|-------------|--------|--------|
| #7 | reconcile details | Low | Low |
| #8 | batch dry_run | Low | Low |

---

## Test Cases

### Issue #3: get_entities
```typescript
it('should fetch multiple entities in one call', async () => {
  const result = await get_entities({ 
    ids: ['F-001', 'F-002', 'F-999'],
    fields: ['id', 'title', 'phase']
  });
  
  expect(Object.keys(result.entities)).toHaveLength(2);
  expect(result.entities['F-001'].title).toBe('MCP Frontend');
  expect(result.not_found).toContain('F-999');
});
```

### Issue #4: search_entities fields
```typescript
it('should return only requested fields', async () => {
  const result = await search_entities({
    filters: { type: ['feature'] },
    fields: ['id', 'phase'],
    limit: 1
  });
  
  const feature = result.results[0];
  expect(feature).toHaveProperty('id');
  expect(feature).toHaveProperty('phase');
  expect(feature).not.toHaveProperty('status');
  expect(feature).not.toHaveProperty('workstream');
});
```

### Issue #11: Status in update response
```typescript
it('should return correct status after update', async () => {
  const result = await update_entity({
    id: 'F-003',
    data: { tier: 'OSS' }
  });
  
  expect(result.entity.status).toBe('Complete');  // Not 'Unknown'
  expect(result.entity.workstream).toBe('engineering');  // Not ''
});
```

---

## Files to Modify

| File | Issues | Changes |
|------|--------|---------|
| `src/tools/entity-management-tools.ts` | #3, #6, #11, #12 | Add get_entities, fix update response |
| `src/tools/search-navigation-tools.ts` | #4, #10 | Fix fields param, add offset |
| `src/services/v2/entity-parser.ts` | #13 | Parse content field |
| `src/tools/batch-operations-tools.ts` | #8 | Implement dry_run |
| `src/tools/decision-document-tools.ts` | #7 | Detailed reconcile output |
| `src/tools/index.ts` | #5 | Add get_schema tool |

---

## Acceptance Criteria

### Phase 2a (Bug Fixes) ✅ COMPLETE
- [x] update_entity returns correct status (not "Unknown") - Fixed in `getEntityStatus()`
- [x] update_entity returns correct workstream (not "") - Fixed in `getEntityWorkstream()`
- [x] search_entities respects fields parameter - Implemented `buildSearchResultItem()`

### Phase 2b (High Value) ✅ COMPLETE
- [x] get_entities tool works for bulk fetching - Wired up handler in `index.ts`
- [x] search_entities supports offset for pagination - Added `offset` parameter

### Phase 2c (Medium Value) ✅ COMPLETE
- [x] update_entity shows before/after changes - Added `computeFieldChanges()` returning `changes` array
- [x] content field populated when requested - Fixed `getEntityContent()` for features
- [x] get_schema tool available - Added `getSchema()` with full entity schemas

### Phase 2d (Nice to Have) ✅ COMPLETE
- [x] reconcile_relationships shows detailed changes - Added `changes`, `warnings` arrays and `dry_run` option
- [x] batch_update dry_run previews without executing - Added `dry_run` option with `would_update` array

---

## Implementation Summary

**Completed:** 2026-01-14

### Files Modified
- `src/services/v2/v2-runtime.ts` - Fixed `getEntityStatus()`, `getEntityWorkstream()`, `getEntityContent()`, enhanced `reconcileImplementsRelationships()`
- `src/tools/entity-management-tools.ts` - Added `computeFieldChanges()` for update diffs
- `src/tools/search-navigation-tools.ts` - Added `buildSearchResultItem()`, offset pagination
- `src/tools/project-understanding-tools.ts` - Added `getSchema()` with full entity schemas
- `src/tools/batch-operations-tools.ts` - Added `dry_run` option with change preview
- `src/tools/tool-types.ts` - Added `FieldChange`, `DryRunPreview`, `GetSchemaInput/Output`, `EntitySchema` types
- `src/tools/index.ts` - Added `get_schema` tool definition, `dry_run` option to `batch_update`
- `src/index.ts` - Added `get_schema` handler, updated `reconcile_relationships` handler

### Tests Added
- Integration tests for `batch_update` with `dry_run=true`
- Integration tests for `reconcile_relationships` with enhanced output
- All 415 tests passing
