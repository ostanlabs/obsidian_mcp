# MCP Implementation Specification

**Date**: 2025-12-24
**Goal**: Reduce MCP from 29 tools to 12 tools, implement token efficiency improvements, fix stability issues

---

## EXECUTIVE SUMMARY

### Current State
- **29 tools** (4 utility + 25 entity tools)
- Returns full EntityFull objects (~1500 tokens)
- Batch operations use array indices (no idempotency)
- ID generation uses in-memory counter (collision risk)
- Visual tools in MCP (should be plugin-only)

### Target State
- **12 tools** (4 utility + 8 entity tools)
- Returns only requested fields (60-90% token savings)
- Batch operations use client IDs (idempotent, selective retry)
- ID generation scans vault (no collisions)
- Visual tools removed from MCP

### Expected Impact
- **67% reduction in tool count** (29 → 12)
- **60-90% reduction in response tokens** (field selection)
- **Zero ID collisions** (scan-on-generate)
- **Clear separation of concerns** (MCP = logic, Plugin = visuals)

---

## PHASE 1: CRITICAL FIXES (Week 1)

### 1.1 Fix ID Generation in MCP ⚠️ CRITICAL

**Problem**: MCP uses in-memory counter, can get out of sync with plugin-created entities

**Current Implementation** (`obsidian_mcp/src/services/v2/v2-runtime.ts`):
```typescript
private idCounters: Map<EntityType, number> = new Map([...]);

async getNextId(type: EntityType): Promise<EntityId> {
  const current = this.idCounters.get(type) || 0;
  const next = current + 1;
  this.idCounters.set(type, next);
  // ...
}
```

**Target Implementation** (replicate plugin approach):
```typescript
async getNextId(type: EntityType): Promise<EntityId> {
  const prefix = this.getPrefixForType(type);

  // Scan all entities of this type to find max ID
  const entities = await this.index.getAllEntitiesOfType(type);
  let maxId = 0;

  for (const entity of entities) {
    const numericPart = entity.id.split('-')[1];
    const num = parseInt(numericPart, 10);
    if (!isNaN(num) && num > maxId) {
      maxId = num;
    }
  }

  const next = maxId + 1;
  const padded = String(next).padStart(3, '0');
  return `${prefix}-${padded}` as EntityId;
}

private getPrefixForType(type: EntityType): string {
  return {
    milestone: 'M',
    story: 'S',
    task: 'T',
    decision: 'DEC',
    document: 'DOC',
  }[type];
}
```

**Files to Modify**:
- `obsidian_mcp/src/services/v2/v2-runtime.ts` - Replace getNextId() implementation
- Remove `idCounters` Map entirely
- Add `getAllEntitiesOfType()` helper if not exists

**Testing**:
- Create entity via MCP → verify ID
- Create entity via Plugin → create entity via MCP → verify no collision
- Create 10 entities in sequence → verify sequential IDs

---

### 1.2 Remove Edge Sync from Plugin ⚠️ CRITICAL

**Problem**: Plugin has circular edge sync logic (canvas ↔ markdown)

**Decision**: Remove plugin's "Sync edges to dependencies" command (markdown is source of truth)

**Files to Modify**:
- `obsidian_plugin/main.ts`:
  - Remove `syncEdgesToDependsOnCommand()` function (line ~449)
  - Remove `syncEdgesToMdFiles()` function (line ~3121)
  - Remove command registration (line ~324-330)
  - Remove `edgeSyncDebounceTimers` Map
  - Remove debounce logic (line ~3076-3085)

**Documentation Update**:
- Add to plugin README: "Dependencies are managed in markdown `depends_on` field. Canvas edges are derived from markdown."

---

### 1.3 Document Notion Sync Fix

**Problem**: Plugin only syncs `type: accomplishment`, not V2 entities

**Action**: Add to backlog, not critical for this phase

**File to Create**: `BACKLOG.md` with entry:
```markdown
## Notion Sync - Support V2 Entities

**Current**: Plugin only syncs `type: accomplishment`
**Target**: Support all V2 entity types (milestone, story, task, decision, document)
**Priority**: Medium
**Effort**: 2-3 days
```

---

## PHASE 2: TOKEN EFFICIENCY (Week 1-2)

### 2.1 Implement Fields-Based Responses ⚠️ HIGH PRIORITY

**Goal**: Agent specifies exactly which fields to return

**Current**:
```typescript
get_entity_summary(id) → Returns ~200 tokens
get_entity_full(id) → Returns ~1500 tokens
```

**Target**:
```typescript
get_entity({
  id: "M-001",
  fields: ["id", "title", "status", "depends_on"]  // Agent controls response size
})
→ Returns only requested fields (~50-200 tokens depending on selection)

### 4.2 Consolidate Batch Operations (3 → 1 tool)

#### Tool: `batch_update` (replaces 3 tools)

**Replaces**:
- `batch_operations` (create multiple)
- `batch_update_status` (update multiple statuses)
- `batch_archive` (archive multiple)

**New Signature with Client IDs**:
```typescript
batch_update({
  ops: [
    {
      client_id: string,           // Required: for idempotency and cross-reference
      op: "create" | "update" | "archive",
      type?: EntityType,           // Required for create
      id?: EntityId,               // Required for update/archive
      payload: {
        // For create: full entity data
        // For update: fields to update
        // For archive: { archived: true }
      }
    }
  ],
  options?: {
    atomic?: boolean,              // Default: false (partial success allowed)
    add_to_canvas?: boolean,
    canvas_source?: string,
  }
})

// Returns:
{
  results: [
    {
      client_id: string,
      status: "ok" | "error",
      id?: EntityId,               // For successful creates/updates
      error?: {
        code: string,
        message: string,
        field?: string,
      }
    }
  ],
  summary: {
    total: number,
    succeeded: number,
    failed: number,
  }
}
```

**Examples**:
```typescript
// Create multiple entities (replaces batch_operations)
batch_update({
  ops: [
    {
      client_id: "m1",
      op: "create",
      type: "milestone",
      payload: { title: "Auth System", workstream: "auth" }
    },
    {
      client_id: "s1",
      op: "create",
      type: "story",
      payload: { title: "Login", parent: "m1", depends_on: ["m1"] }  // Can reference client_id
    }
  ]
})

// Update multiple statuses (replaces batch_update_status)
batch_update({
  ops: [
    { client_id: "u1", op: "update", id: "M-001", payload: { status: "completed" } },
    { client_id: "u2", op: "update", id: "S-005", payload: { status: "in_progress" } }
  ]
})

// Archive multiple (replaces batch_archive)
batch_update({
  ops: [
    { client_id: "a1", op: "archive", id: "M-001", payload: { archived: true, cascade: true } },
    { client_id: "a2", op: "archive", id: "S-010", payload: { archived: true } }
  ]
})

// Mixed operations
batch_update({
  ops: [
    { client_id: "c1", op: "create", type: "task", payload: { title: "Fix bug", parent: "S-001" } },
    { client_id: "u1", op: "update", id: "S-001", payload: { status: "in_progress" } },
    { client_id: "a1", op: "archive", id: "T-042", payload: { archived: true } }
  ]
})
```

**Client ID Resolution**:
```typescript
// When processing ops, build a map of client_id → real_id
const clientIdMap = new Map<string, EntityId>();

for (const op of ops) {
  if (op.op === "create") {
    // Resolve client_ids in payload
    const resolvedPayload = resolveClientIds(op.payload, clientIdMap);
    const newId = await createEntity(op.type, resolvedPayload);
    clientIdMap.set(op.client_id, newId);
  }
}

function resolveClientIds(payload: any, map: Map<string, EntityId>): any {
  // Replace client_ids with real IDs in parent, depends_on, etc.
  if (payload.parent && map.has(payload.parent)) {
    payload.parent = map.get(payload.parent);
  }
  if (payload.depends_on) {
    payload.depends_on = payload.depends_on.map(id => map.get(id) || id);
  }
  return payload;
}
```

**Idempotency**:
```typescript
// Track processed client_ids to prevent duplicates
const processedClientIds = new Set<string>();

for (const op of ops) {
  if (processedClientIds.has(op.client_id)) {
    // Return cached result instead of re-executing
    results.push(cachedResults.get(op.client_id));
    continue;
  }
  // ... process op
  processedClientIds.add(op.client_id);
}
```

**Files to Modify**:
- `obsidian_mcp/src/tools/batch-operations-tools.ts`:
  - Remove `batchOperations()` function
  - Remove `batchUpdateStatus()` function
  - Remove `batchArchive()` function
  - Add new `batchUpdate()` function with client ID support
- `obsidian_mcp/src/tools/tool-types.ts`:
  - Remove old batch input/output types
  - Add new `BatchUpdateInput/Output` types
- `obsidian_mcp/src/tools/index.ts`:
  - Remove old batch tool definitions
  - Add new `batch_update` tool definition

**Tool Count Impact**: 3 → 1 tool

---

### 4.3 Consolidate Project Understanding (3 → 2 tools)

#### Tool: `get_project_overview` (enhanced)

**Current**: Returns only high-level summary

**Enhanced**: Merge `get_workstream_status` functionality

**New Signature**:
```typescript
get_project_overview({
  workstream?: string,           // NEW: filter by specific workstream
  include_completed?: boolean,
  include_archived?: boolean,
  group_by?: "status" | "type" | "priority",  // NEW: from get_workstream_status
  canvas_source?: string,
})

// Returns:
{
  summary: {
    // Overall counts (if no workstream filter)
    milestones: { total, completed, in_progress, blocked },
    stories: { total, completed, in_progress, blocked },
    tasks: { total, completed, in_progress, blocked },
    decisions: { total, pending, decided },
    documents: { total, draft, approved },
  },
  workstreams: [
    {
      name: string,
      milestones: EntitySummary[],
      stories: EntitySummary[],
      tasks: EntitySummary[],
      health: "healthy" | "at_risk" | "blocked",
    }
  ],
  // If workstream filter specified, return detailed breakdown
  workstream_detail?: {
    name: string,
    grouped_by: "status" | "type" | "priority",
    groups: {
      [key: string]: EntitySummary[]
    }
  }
}
```

**Keep Separate**: `analyze_project_state` (different use case - deep analysis with blockers)

**Files to Modify**:
- `obsidian_mcp/src/tools/project-understanding-tools.ts`:
  - Enhance `getProjectOverview()` to include workstream filtering
  - Remove `getWorkstreamStatus()` function
- `obsidian_mcp/src/tools/index.ts`:
  - Remove `get_workstream_status` tool definition
  - Update `get_project_overview` schema

**Tool Count Impact**: 3 → 2 tools

---

### 4.4 Consolidate Search & Navigation (4 → 2 tools)

#### Already Done in Phase 2:
- Merged `get_entity_summary` + `get_entity_full` → `get_entity`

#### Tool: `search_entities` (enhanced)

**Current**: Only full-text search

**Enhanced**: Merge `navigate_hierarchy` functionality

**New Signature**:
```typescript
search_entities({
  // Search mode
  query?: string,                // Full-text search query

  // OR Navigation mode
  from_id?: EntityId,            // Navigate from this entity
  direction?: "up" | "down" | "siblings" | "dependencies",
  depth?: number,

  // Filters (apply to both modes)
  filters?: {
    type?: EntityType[],
    status?: EntityStatus[],
    workstream?: string[],
    archived?: boolean,
  },

  // Response control
  limit?: number,
  fields?: string[],             // NEW: control response size
})

// Returns:
{
  results: EntitySummary[],      // Or custom fields if specified
  total_matches: number,
  path_description?: string,     // For navigation mode
}
```

**Examples**:
```typescript
// Full-text search (current behavior)
search_entities({
  query: "authentication",
  filters: { type: ["story", "task"] },
  fields: ["id", "title", "status"]
})

// Navigate hierarchy (replaces navigate_hierarchy)
search_entities({
  from_id: "M-001",
  direction: "down",
  depth: 2,
  fields: ["id", "title", "status", "parent"]
})

// Navigate dependencies
search_entities({
  from_id: "S-005",
  direction: "dependencies",
  fields: ["id", "title", "status", "depends_on"]
})
```

**Files to Modify**:
- `obsidian_mcp/src/tools/search-navigation-tools.ts`:
  - Enhance `searchEntities()` to support navigation mode
  - Remove `navigateHierarchy()` function
  - Add `fields` parameter support
- `obsidian_mcp/src/tools/index.ts`:
  - Remove `navigate_hierarchy` tool definition
  - Update `search_entities` schema

**Tool Count Impact**: 4 → 2 tools (already counted get_entity merge in Phase 2)

---

### 4.5 Consolidate Decision & Document (5 → 1 tool)

#### Tool: `manage_documents` (new consolidated tool)

**Replaces**:
- `create_decision` → use `create_entity({ type: "decision" })`
- `get_decision_history`
- `supersede_document`
- `get_document_history`
- `check_document_freshness`

**Rationale**:
- Decision creation is just entity creation → use `create_entity`
- Remaining 4 tools are all document/decision management → consolidate

**New Signature**:
```typescript
manage_documents({
  action: "get_decision_history" | "supersede_document" | "get_document_history" | "check_freshness",

  // For get_decision_history
  topic?: string,
  workstream?: string,
  include_superseded?: boolean,
  include_archived?: boolean,

  // For supersede_document
  document_id?: EntityId,
  decision_id?: EntityId,
  new_content?: string,
  change_summary?: string,

  // For get_document_history / check_freshness
  document_id?: EntityId,
})
```

**Examples**:
```typescript
// Create decision (use create_entity instead)
create_entity({
  type: "decision",
  data: {
    title: "Use PostgreSQL",
    workstream: "backend",
    context: "Need to choose database",
    decision: "Use PostgreSQL",
    rationale: "Better for relational data",
    decided_by: "Tech Lead",
    enables: ["S-001", "S-002"]
  }
})

// Get decision history
manage_documents({
  action: "get_decision_history",
  topic: "database",
  workstream: "backend",
  include_archived: true
})

// Supersede document
manage_documents({
  action: "supersede_document",
  document_id: "DOC-001",
  decision_id: "DEC-005",
  new_content: "Updated spec...",
  change_summary: "Added PostgreSQL requirements"
})

// Get document history
manage_documents({
  action: "get_document_history",
  document_id: "DOC-001"
})

// Check freshness
manage_documents({
  action: "check_freshness",
  document_id: "DOC-001"
})
```

**Files to Modify**:
- `obsidian_mcp/src/tools/decision-document-tools.ts`:
  - Remove `createDecision()` function (use create_entity instead)
  - Keep `getDecisionHistory()`, `supersedeDocument()`, `getDocumentHistory()`, `checkDocumentFreshness()`
  - Add new `manageDocuments()` dispatcher function
- `obsidian_mcp/src/tools/index.ts`:
  - Remove `create_decision` tool definition
  - Remove individual decision/document tool definitions
  - Add new `manage_documents` tool definition

**Tool Count Impact**: 5 → 1 tool (create_decision → create_entity, others → manage_documents)

---

## PHASE 5: IMPLEMENTATION CHECKLIST

### Week 1: Critical Fixes
- [ ] Fix ID generation in MCP (scan vault on every generate)
  - [ ] Modify `obsidian_mcp/src/services/v2/v2-runtime.ts`
  - [ ] Remove `idCounters` Map
  - [ ] Add `getAllEntitiesOfType()` helper
  - [ ] Test: Create via MCP, create via Plugin, verify no collision

- [ ] Remove edge sync from Plugin
  - [ ] Remove `syncEdgesToDependsOnCommand()` from `obsidian_plugin/main.ts`
  - [ ] Remove `syncEdgesToMdFiles()` function
  - [ ] Remove command registration
  - [ ] Remove debounce timers
  - [ ] Update plugin README

- [ ] Document Notion sync fix in backlog
  - [ ] Create `BACKLOG.md`
  - [ ] Add Notion sync entry

### Week 1-2: Token Efficiency
- [ ] Implement fields-based responses
  - [ ] Merge `get_entity_summary` + `get_entity_full` → `get_entity`
  - [ ] Add `fields` parameter
  - [ ] Implement field selection logic
  - [ ] Update tool definitions
  - [ ] Test: Request specific fields, verify response size

- [ ] Add client IDs to batch operations
  - [ ] Implement `batch_update` with client IDs
  - [ ] Add client ID resolution logic
  - [ ] Add idempotency tracking
  - [ ] Update tool definitions
  - [ ] Test: Retry failed operations, verify no duplicates

- [ ] Remove `auto_layout_canvas` tool
  - [ ] Delete `obsidian_mcp/src/tools/canvas-layout-tools.ts`
  - [ ] Remove from index
  - [ ] Remove handler registration

### Week 2-3: Tool Consolidation
- [ ] Consolidate Entity Management (6 → 2)
  - [ ] Enhance `update_entity` with `archived` field
  - [ ] Remove `update_entity_status`, `archive_entity`, `restore_from_archive`, `archive_milestone`
  - [ ] Update tool definitions
  - [ ] Test: Archive, restore, update status via update_entity

- [ ] Consolidate Batch Operations (3 → 1)
  - [ ] Implement `batch_update` with create/update/archive ops
  - [ ] Remove `batch_operations`, `batch_update_status`, `batch_archive`
  - [ ] Update tool definitions
  - [ ] Test: Mixed operations in single batch

- [ ] Consolidate Project Understanding (3 → 2)
  - [ ] Enhance `get_project_overview` with workstream filtering
  - [ ] Remove `get_workstream_status`
  - [ ] Update tool definitions

- [ ] Consolidate Search & Navigation (4 → 2)
  - [ ] Enhance `search_entities` with navigation mode
  - [ ] Remove `navigate_hierarchy`
  - [ ] Add `fields` parameter
  - [ ] Update tool definitions

- [ ] Consolidate Decision & Document (5 → 1)
  - [ ] Implement `manage_documents` dispatcher
  - [ ] Remove `create_decision` (use create_entity)
  - [ ] Update tool definitions
  - [ ] Test: All document management actions

### Week 3-4: Testing & Documentation
- [ ] Integration tests for all consolidated tools
- [ ] Update MCP_V2_SPEC.md with new tool signatures
- [ ] Update MCP_TECHNICAL_SPEC.md
- [ ] Create migration guide for AI agents
- [ ] Performance testing (measure token savings)

---

## PHASE 6: SUCCESS METRICS

### Tool Count
- **Before**: 29 tools
- **After**: 12 tools
- **Reduction**: 58.6%

### Token Efficiency
- **Before**: ~1500 tokens per entity fetch
- **After**: ~50-200 tokens (depending on fields requested)
- **Savings**: 60-90%

### Stability
- **ID Collisions**: Zero (scan-on-generate)
- **Circular Dependencies**: Eliminated (removed edge sync)
- **Data Integrity**: Improved (client IDs, idempotency)

### Separation of Concerns
- **MCP**: Business logic only (no visual tools)
- **Plugin**: Visual responsibilities (layout, positioning)
- **Clear Boundaries**: Documented and enforced

---

## APPENDIX A: TOOL MAPPING

### Before → After

| Before (29 tools) | After (12 tools) | Action |
|-------------------|------------------|--------|
| `read_docs` | `read_docs` | Keep |
| `update_doc` | `update_doc` | Keep |
| `list_workspaces` | `list_workspaces` | Keep |
| `list_files` | `list_files` | Keep |
| `create_entity` | `create_entity` | Keep |
| `update_entity` | `update_entity` | Enhanced (add archived field) |
| `update_entity_status` | `update_entity` | Merged |
| `archive_entity` | `update_entity` | Merged |
| `archive_milestone` | `batch_update` | Replaced |
| `restore_from_archive` | `update_entity` | Merged |
| `batch_operations` | `batch_update` | Merged |
| `batch_update_status` | `batch_update` | Merged |
| `batch_archive` | `batch_update` | Merged |
| `get_project_overview` | `get_project_overview` | Enhanced |
| `get_workstream_status` | `get_project_overview` | Merged |
| `analyze_project_state` | `analyze_project_state` | Keep |
| `search_entities` | `search_entities` | Enhanced |
| `get_entity_summary` | `get_entity` | Merged |
| `get_entity_full` | `get_entity` | Merged |
| `navigate_hierarchy` | `search_entities` | Merged |
| `create_decision` | `create_entity` | Use create_entity |
| `get_decision_history` | `manage_documents` | Merged |
| `supersede_document` | `manage_documents` | Merged |
| `get_document_history` | `manage_documents` | Merged |
| `check_document_freshness` | `manage_documents` | Merged |
| `get_ready_for_implementation` | **REMOVED** | Low usage |
| `generate_implementation_package` | **REMOVED** | Low usage |
| `validate_spec_completeness` | **REMOVED** | Low usage |
| `auto_layout_canvas` | **REMOVED** | Visual → Plugin |

**Final Count**: 12 tools (4 utility + 8 entity)

---

## APPENDIX B: INTERNAL CONSOLIDATION OPPORTUNITIES

### Within MCP

**Current Overlaps to Address**:
1. ✅ Multiple ways to update status → Single `update_entity` with status field
2. ✅ Multiple ways to archive → Single `update_entity` with archived field
3. ✅ Multiple batch tools → Single `batch_update` with op type
4. ✅ Multiple entity fetch tools → Single `get_entity` with fields parameter
5. ✅ Separate decision creation → Use `create_entity({ type: "decision" })`

**Service Function Consolidation**:
- Entity validation: Single `validateEntity()` function used by all create/update operations
- Dependency resolution: Single `resolveDependencies()` function
- Canvas operations: Single `updateCanvas()` function (add/remove nodes/edges)
- Archive operations: Single `archiveEntity()` service function

### Within Plugin

**Opportunities** (for future work):
1. Entity creation flows:
   - `convertCanvasNodeToStructuredItem()` (from canvas)
   - Template-based creation
   - Modal-based creation
   → Consolidate to single `createEntity(source, data)` service function

2. ID generation:
   - Currently only in `util/idGenerator.ts`
   - Good! No duplication

3. Canvas operations:
   - Multiple canvas update functions
   → Consolidate to single `updateCanvas(operation, data)` service

**Note**: Plugin consolidation is lower priority (focus on MCP first)

---

## APPENDIX C: MIGRATION GUIDE FOR AI AGENTS

### For Agents Using Old Tools

**Entity Status Updates**:
```typescript
// OLD
update_entity_status({ id: "M-001", status: "completed" })

// NEW
update_entity({ id: "M-001", data: { status: "completed" } })
```

**Archiving**:
```typescript
// OLD
archive_entity({ id: "S-005" })

// NEW
update_entity({ id: "S-005", data: { archived: true } })
```

**Batch Operations**:
```typescript
// OLD
batch_operations({
  entities: [
    { type: "milestone", data: { title: "M1" } }
  ]
})

// NEW
batch_update({
  ops: [
    { client_id: "m1", op: "create", type: "milestone", payload: { title: "M1" } }
  ]
})
```

**Entity Fetching**:
```typescript
// OLD
get_entity_summary({ id: "M-001" })
get_entity_full({ id: "M-001" })

// NEW
get_entity({ id: "M-001" })  // Returns default fields
get_entity({ id: "M-001", fields: ["id", "title", "status", "depends_on"] })  // Custom fields
```

**Decision Creation**:
```typescript
// OLD
create_decision({
  title: "Use PostgreSQL",
  context: "...",
  decision: "...",
  rationale: "...",
  workstream: "backend",
  decided_by: "Tech Lead"
})

// NEW
create_entity({
  type: "decision",
  data: {
    title: "Use PostgreSQL",
    workstream: "backend",
    context: "...",
    decision: "...",
    rationale: "...",
    decided_by: "Tech Lead"
  }
})
```

---

**END OF SPECIFICATION**


